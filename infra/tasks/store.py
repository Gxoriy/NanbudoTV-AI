"""SQLite(WAL) 单表任务队列（P1-02）。

设计要点（对应旧实现的三个坑）：
  1. 任务落盘：崩溃/关机后不再"已扣费但任务消失"
  2. 启动恢复：把人留在 running 的任务统一改成 interrupted，允许续跑
  3. 幂等：idempotency_key 唯一索引，重试不会产生第二条任务

并发模型：单进程多线程，故用 check_same_thread=False + 进程内 RLock，
WAL 保证读写不互相阻塞；不引入队列服务（红线：禁 Redis）。
"""

from __future__ import annotations

import json
import pathlib
import sqlite3
import threading
import time
import uuid
from typing import Any, Iterable

from .models import (
    ALL_STATES,
    CANCELED,
    DONE,
    ERROR,
    ERROR_CODES,
    INTERRUPTED,
    QUEUED,
    RUNNING,
    Task,
    assert_transition,
    clamp_progress,
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
    id               TEXT PRIMARY KEY,
    kind             TEXT NOT NULL,
    domain           TEXT NOT NULL,
    state            TEXT NOT NULL,
    progress         REAL NOT NULL DEFAULT 0,
    message          TEXT NOT NULL DEFAULT '',
    error_code       TEXT,
    error_detail     TEXT,
    idempotency_key  TEXT,
    payload          TEXT NOT NULL DEFAULT '{}',
    result           TEXT,
    checkpoint       TEXT,
    attempt          INTEGER NOT NULL DEFAULT 1,
    created_at       REAL NOT NULL,
    started_at       REAL,
    finished_at      REAL,
    updated_at       REAL NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tasks_idem
    ON tasks(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_tasks_state ON tasks(state, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_tasks_domain ON tasks(domain, updated_at DESC);
"""


def _dumps(value: Any) -> str | None:
    return None if value is None else json.dumps(value, ensure_ascii=False)


def _loads(value: str | None, default: Any = None) -> Any:
    if value is None:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


class TaskStore:
    def __init__(self, db_path: str | pathlib.Path) -> None:
        self.path = pathlib.Path(db_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(self.path), check_same_thread=False,
                                     isolation_level=None, timeout=10.0)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA synchronous=NORMAL")
            self._conn.executescript(SCHEMA)

    # ---------- 生命周期 ----------
    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def __enter__(self) -> "TaskStore":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # ---------- 写 ----------
    def create(self, kind: str, domain: str, payload: dict[str, Any] | None = None,
               *, idempotency_key: str | None = None, task_id: str | None = None) -> Task:
        """创建任务；同 idempotency_key 已存在时直接返回既有任务（幂等）。"""
        now = time.time()
        task = Task(
            id=task_id or uuid.uuid4().hex,
            kind=kind,
            domain=domain,
            payload=payload or {},
            idempotency_key=idempotency_key,
            created_at=now,
            updated_at=now,
        )
        with self._lock:
            try:
                self._conn.execute(
                    """INSERT INTO tasks (id, kind, domain, state, progress, message,
                           error_code, error_detail, idempotency_key, payload, result,
                           checkpoint, attempt, created_at, started_at, finished_at, updated_at)
                       VALUES (:id,:kind,:domain,:state,:progress,:message,:error_code,
                           :error_detail,:idempotency_key,:payload,:result,:checkpoint,
                           :attempt,:created_at,:started_at,:finished_at,:updated_at)""",
                    {
                        **task.to_row(),
                        "payload": _dumps(task.payload),
                        "result": _dumps(task.result),
                        "checkpoint": _dumps(task.checkpoint),
                    },
                )
            except sqlite3.IntegrityError:
                if not idempotency_key:
                    raise
                existing = self.get_by_idempotency_key(idempotency_key)
                if existing is None:      # 极端竞争：插入冲突但查不到，重抛
                    raise
                return existing
        return task

    def start(self, task_id: str) -> Task:
        task = self._require(task_id)
        assert_transition(task.state, RUNNING)
        now = time.time()
        self._update(task_id, state=RUNNING, started_at=task.started_at or now,
                     updated_at=now, error_code=None, error_detail=None)
        return self._require(task_id)

    def set_progress(self, task_id: str, progress: float, message: str | None = None) -> Task:
        task = self._require(task_id)
        value = clamp_progress(progress)
        if value < task.progress:      # 进度不回退
            value = task.progress
        fields: dict[str, Any] = {"progress": value, "updated_at": time.time()}
        if message is not None:
            fields["message"] = message
        self._update(task_id, **fields)
        return self._require(task_id)

    def checkpoint(self, task_id: str, payload: dict[str, Any]) -> None:
        self._update(task_id, checkpoint=_dumps(payload), updated_at=time.time())

    def succeed(self, task_id: str, result: dict[str, Any] | None = None) -> Task:
        task = self._require(task_id)
        assert_transition(task.state, DONE)
        now = time.time()
        self._update(task_id, state=DONE, progress=1.0, result=_dumps(result or {}),
                     finished_at=now, updated_at=now)
        return self._require(task_id)

    def fail(self, task_id: str, error_code: str = "internal",
             detail: str = "") -> Task:
        if error_code not in ERROR_CODES:
            raise ValueError(f"未知错误分类: {error_code}")
        task = self._require(task_id)
        assert_transition(task.state, ERROR)
        now = time.time()
        self._update(task_id, state=ERROR, error_code=error_code, error_detail=detail,
                     finished_at=now, updated_at=now)
        return self._require(task_id)

    def cancel(self, task_id: str) -> Task:
        task = self._require(task_id)
        assert_transition(task.state, CANCELED)
        now = time.time()
        self._update(task_id, state=CANCELED, finished_at=now, updated_at=now)
        return self._require(task_id)

    def requeue(self, task_id: str) -> Task:
        """失败重试：ERROR -> QUEUED，attempt+1。"""
        task = self._require(task_id)
        assert_transition(task.state, QUEUED)
        self._update(task_id, state=QUEUED, progress=0.0, attempt=task.attempt + 1,
                     error_code=None, error_detail=None, finished_at=None,
                     updated_at=time.time())
        return self._require(task_id)

    def interrupt_running(self) -> list[str]:
        """启动时调用：把上次进程遗留的 running 全部标记为 interrupted。

        这是 NFR-3 的核心动作——不这么做，用户看到的是"卡在 60% 永不结束"。
        """
        now = time.time()
        with self._lock:
            rows = self._conn.execute(
                "SELECT id FROM tasks WHERE state = ?", (RUNNING,)).fetchall()
            ids = [r["id"] for r in rows]
            if ids:
                self._conn.executemany(
                    "UPDATE tasks SET state=?, error_code=?, error_detail=?, updated_at=?"
                    " WHERE id=?",
                    [(INTERRUPTED, "interrupted", "进程重启导致中断，可续跑", now, i)
                     for i in ids],
                )
            return ids

    # ---------- 读 ----------
    def get(self, task_id: str) -> Task | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        return self._to_task(row) if row else None

    def get_by_idempotency_key(self, key: str) -> Task | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM tasks WHERE idempotency_key=?", (key,)).fetchone()
        return self._to_task(row) if row else None

    def list(self, *, states: Iterable[str] | None = None, domain: str | None = None,
             limit: int = 100) -> list[Task]:
        sql = "SELECT * FROM tasks"
        where, params = [], []
        if states:
            states = list(states)
            bad = set(states) - set(ALL_STATES)
            if bad:
                raise ValueError(f"未知状态: {bad}")
            where.append(f"state IN ({','.join('?' * len(states))})")
            params += states
        if domain:
            where.append("domain=?")
            params.append(domain)
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY created_at DESC LIMIT ?"
        params.append(int(limit))
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
        return [self._to_task(r) for r in rows]

    def snapshot(self) -> dict[str, Any]:
        """单一快照端点用：一次查询给出全量计数 + 活跃任务，替代前端 200ms 轮询多端点。"""
        with self._lock:
            counts = {r["state"]: r["n"] for r in self._conn.execute(
                "SELECT state, COUNT(*) AS n FROM tasks GROUP BY state")}
            active = self._conn.execute(
                "SELECT * FROM tasks WHERE state IN (?,?) ORDER BY created_at ASC LIMIT 50",
                (RUNNING, QUEUED)).fetchall()
        states = {s: counts.get(s, 0) for s in ALL_STATES}
        return {
            "counts": states,
            "activeCount": states[RUNNING] + states[QUEUED],
            "interruptedCount": states[INTERRUPTED],
            "active": [self._to_task(r).to_row() for r in active],
        }

    # ---------- 内部 ----------
    def _require(self, task_id: str) -> Task:
        task = self.get(task_id)
        if task is None:
            raise KeyError(f"任务不存在: {task_id}")
        return task

    def _update(self, task_id: str, **fields: Any) -> None:
        if not fields:
            return
        cols = ", ".join(f"{k}=?" for k in fields)
        with self._lock:
            self._conn.execute(f"UPDATE tasks SET {cols} WHERE id=?",
                               (*fields.values(), task_id))

    @staticmethod
    def _to_task(row: sqlite3.Row) -> Task:
        return Task(
            id=row["id"], kind=row["kind"], domain=row["domain"], state=row["state"],
            progress=row["progress"], message=row["message"],
            error_code=row["error_code"], error_detail=row["error_detail"],
            idempotency_key=row["idempotency_key"],
            payload=_loads(row["payload"], {}), result=_loads(row["result"]),
            checkpoint=_loads(row["checkpoint"]), attempt=row["attempt"],
            created_at=row["created_at"], started_at=row["started_at"],
            finished_at=row["finished_at"], updated_at=row["updated_at"],
        )
