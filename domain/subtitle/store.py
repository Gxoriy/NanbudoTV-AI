"""字幕记录的 SQLite 存储（P2-01）。

暂时内联在业务域内（ADR-006）：先看真实字段形态，再抽 `infra/store`。
与旧版的差异：旧版把记录摊在 `data/` 下的 JSON 文件里，并发写会互相覆盖；
这里用单表 + WAL + 行级更新，只改传入的列。
"""

from __future__ import annotations

import json
import pathlib
import sqlite3
import threading
import time
import uuid
from typing import Any

from .models import SubtitleRecord, assert_phase

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS subtitle_records (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    phase            TEXT NOT NULL,
    progress         REAL NOT NULL DEFAULT 0,
    message          TEXT NOT NULL DEFAULT '',
    error            TEXT NOT NULL DEFAULT '',
    metadata         TEXT NOT NULL DEFAULT '{}',
    size             INTEGER NOT NULL DEFAULT 0,
    source_file      TEXT NOT NULL DEFAULT '',
    result_file      TEXT NOT NULL DEFAULT '',
    region           TEXT,
    quality          TEXT NOT NULL DEFAULT 'standard',
    processing_mode  TEXT NOT NULL DEFAULT 'cloud',
    local_mode       TEXT NOT NULL DEFAULT '',
    request_id       TEXT,
    quote            TEXT,
    detection        TEXT,
    history          TEXT NOT NULL DEFAULT '[]',
    attempts         TEXT NOT NULL DEFAULT '[]',
    created_at       REAL NOT NULL,
    updated_at       REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_subtitle_phase ON subtitle_records(phase, updated_at DESC);
"""

JSON_FIELDS = ("metadata", "region", "quote", "detection", "history", "attempts")


def _dumps(value: Any) -> str | None:
    return None if value is None else json.dumps(value, ensure_ascii=False)


def _loads(value: str | None, default: Any = None) -> Any:
    if value is None:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


class SubtitleStore:
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
            self._conn.executescript(SCHEMA_SQL)

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def __enter__(self) -> "SubtitleStore":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # ---------- 写 ----------
    def create(self, name: str, *, metadata: dict[str, Any] | None = None,
               size: int = 0, source_file: str = "",
               processing_mode: str = "cloud", local_mode: str = "",
               record_id: str | None = None) -> SubtitleRecord:
        now = time.time()
        record = SubtitleRecord(
            id=record_id or uuid.uuid4().hex, name=name, metadata=metadata or {}, size=size,
            source_file=source_file, processing_mode=processing_mode,
            local_mode=local_mode, created_at=now, updated_at=now)
        self._insert(record)
        return record

    def update(self, record_id: str, **fields: Any) -> SubtitleRecord:
        if not fields:
            return self.get_or_raise(record_id)
        if "phase" in fields:
            assert_phase(fields["phase"])
        fields["updated_at"] = time.time()
        cols = ", ".join(f"{k}=?" for k in fields)
        params = [(_dumps(v) if k in JSON_FIELDS else v) for k, v in fields.items()]
        with self._lock:
            self._conn.execute(f"UPDATE subtitle_records SET {cols} WHERE id=?",
                               (*params, record_id))
        return self.get_or_raise(record_id)

    def append_history(self, record_id: str, entry: dict[str, Any]) -> SubtitleRecord:
        record = self.get_or_raise(record_id)
        history = [*record.history, {**entry, "createdAt": entry.get("createdAt", time.time())}]
        return self.update(record_id, history=history)

    def append_attempt(self, record_id: str, attempt: dict[str, Any]) -> SubtitleRecord:
        record = self.get_or_raise(record_id)
        attempts = [*record.attempts, {**attempt, "createdAt": attempt.get(
            "createdAt", time.time())}]
        return self.update(record_id, attempts=attempts)

    # ---------- 读 ----------
    def get(self, record_id: str) -> SubtitleRecord | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM subtitle_records WHERE id=?", (record_id,)).fetchone()
        return self._to_record(row) if row else None

    def get_or_raise(self, record_id: str) -> SubtitleRecord:
        record = self.get(record_id)
        if record is None:
            raise KeyError(f"记录不存在: {record_id}")
        return record

    def list(self, *, limit: int = 100) -> list[SubtitleRecord]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM subtitle_records ORDER BY created_at DESC LIMIT ?",
                (int(limit),)).fetchall()
        return [self._to_record(r) for r in rows]

    def brief(self, *, limit: int = 100) -> list[dict[str, Any]]:
        """历史下拉只需要 id/name/phase/processingMode。"""
        return [
            {"id": r.id, "name": r.name, "phase": r.phase,
             "processingMode": r.processing_mode, "updatedAt": r.updated_at}
            for r in self.list(limit=limit)
        ]

    # ---------- 内部 ----------
    def _insert(self, record: SubtitleRecord) -> None:
        row = record.public()
        with self._lock:
            self._conn.execute(
                """INSERT INTO subtitle_records (
                       id, name, phase, progress, message, error, metadata, size,
                       source_file, result_file, region, quality, processing_mode,
                       local_mode, request_id, quote, detection, history, attempts,
                       created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    row["id"], row["name"], row["phase"], record.progress,
                    row["message"], row["error"], _dumps(record.metadata), row["size"],
                    row["sourceFile"], row["resultFile"], _dumps(record.region),
                    row["quality"], row["processingMode"], row["localMode"],
                    row["requestId"], _dumps(record.quote), _dumps(record.detection),
                    _dumps(record.history), _dumps(record.attempts),
                    row["createdAt"], row["updatedAt"],
                ),
            )

    @staticmethod
    def _to_record(row: sqlite3.Row) -> SubtitleRecord:
        return SubtitleRecord(
            id=row["id"], name=row["name"], phase=row["phase"],
            progress=row["progress"], message=row["message"], error=row["error"],
            metadata=_loads(row["metadata"], {}), size=row["size"],
            source_file=row["source_file"], result_file=row["result_file"],
            region=_loads(row["region"]), quality=row["quality"],
            processing_mode=row["processing_mode"], local_mode=row["local_mode"],
            request_id=row["request_id"], quote=_loads(row["quote"]),
            detection=_loads(row["detection"]), history=_loads(row["history"], []),
            attempts=_loads(row["attempts"], []),
            created_at=row["created_at"], updated_at=row["updated_at"],
        )
