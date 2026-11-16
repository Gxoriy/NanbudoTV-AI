"""通用工程文档库（D1 改写 / D5 电商等共用）。

形态与视觉域的 `LibraryStore` 一致——"有 id、有名字、挂一段 JSON、按 kind 查"，
但独立成 infra 级组件，避免 D1 反向依赖 domain/visual。

大文件不进库：只存相对路径，实体落 `files_root`。
"""

from __future__ import annotations

import json
import pathlib
import sqlite3
import threading
import time
import uuid
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS docs (
    id         TEXT PRIMARY KEY,
    kind       TEXT NOT NULL,
    name       TEXT NOT NULL DEFAULT '',
    payload    TEXT NOT NULL DEFAULT '{}',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_docs_kind ON docs(kind, updated_at DESC);
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


class DocStore:
    def __init__(self, db_path: str | pathlib.Path,
                 files_root: str | pathlib.Path | None = None) -> None:
        self.path = pathlib.Path(db_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.files_root = pathlib.Path(files_root or self.path.parent / "files")
        self.files_root.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(self.path), check_same_thread=False,
                                     isolation_level=None, timeout=10.0)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.executescript(SCHEMA)

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    # ---------- 文档 ----------
    def create(self, kind: str, name: str, payload: dict[str, Any] | None = None,
               doc_id: str | None = None) -> dict[str, Any]:
        now = time.time()
        ident = doc_id or uuid.uuid4().hex
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO docs (id, kind, name, payload, created_at, updated_at)"
                " VALUES (?,?,?,?,?,?)",
                (ident, kind, name, json.dumps(payload or {}, ensure_ascii=False), now, now))
        return self.get(ident) or {}

    def update(self, doc_id: str, **fields: Any) -> dict[str, Any] | None:
        record = self.get(doc_id)
        if record is None:
            return None
        changes: dict[str, Any] = {"updated_at": time.time()}
        if fields.get("name") is not None:
            changes["name"] = str(fields["name"])
        if isinstance(fields.get("payload"), dict):
            merged = {**record["payload"], **fields["payload"]}
            changes["payload"] = json.dumps(merged, ensure_ascii=False)
        cols = ", ".join(f"{k}=?" for k in changes)
        with self._lock:
            self._conn.execute(f"UPDATE docs SET {cols} WHERE id=?",
                               (*changes.values(), doc_id))
        return self.get(doc_id)

    def get(self, doc_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM docs WHERE id=?", (doc_id,)).fetchone()
        if row is None:
            return None
        return {"id": row["id"], "kind": row["kind"], "name": row["name"],
                "payload": json.loads(row["payload"]),
                "createdAt": row["created_at"], "updatedAt": row["updated_at"]}

    def list(self, kind: str, *, limit: int = 200) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM docs WHERE kind=? ORDER BY updated_at DESC LIMIT ?",
                (kind, int(limit))).fetchall()
        return [{"id": r["id"], "kind": r["kind"], "name": r["name"],
                 "payload": json.loads(r["payload"]),
                 "createdAt": r["created_at"], "updatedAt": r["updated_at"]} for r in rows]

    def delete(self, doc_id: str) -> bool:
        with self._lock:
            cur = self._conn.execute("DELETE FROM docs WHERE id=?", (doc_id,))
            return cur.rowcount > 0

    # ---------- 键值设置 ----------
    def get_setting(self, key: str, default: Any = None) -> Any:
        with self._lock:
            row = self._conn.execute("SELECT value FROM settings WHERE key=?",
                                     (key,)).fetchone()
        if row is None:
            return default
        try:
            return json.loads(row["value"])
        except json.JSONDecodeError:
            return default

    def set_setting(self, key: str, value: Any) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)",
                (key, json.dumps(value, ensure_ascii=False)))

    # ---------- 文件 ----------
    def save_file(self, folder: str, filename: str, data: bytes) -> str:
        suffix = pathlib.PurePath(filename).suffix.lower()
        relative = f"{folder}/{uuid.uuid4().hex}{suffix}"
        target = self.files_root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return relative

    def file_path(self, relative: str) -> pathlib.Path | None:
        if not relative:
            return None
        target = (self.files_root / relative).resolve()
        try:
            target.relative_to(self.files_root.resolve())
        except ValueError:
            return None
        return target if target.is_file() else None
