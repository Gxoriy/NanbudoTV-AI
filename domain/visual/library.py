"""视觉域的通用文档库：画布文档、素材、角色、自定义样式、用户偏好。

为什么用一张表：这些对象的共同形态都是"有 id、有名字、挂一段 JSON、按类型查"，
旧实现里它们各自散在十几个目录（canvas/asset-library/characters/profile），
维护成本高且搜索困难。用 `kind` 区分后，新增一类只需约定 payload 结构。

大文件（图片/视频）不进库：只存相对路径，实际文件落在 `data/visual/files/`。
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
    owner      TEXT NOT NULL DEFAULT '',
    name       TEXT NOT NULL DEFAULT '',
    payload    TEXT NOT NULL DEFAULT '{}',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_docs_kind ON docs(kind, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_docs_owner ON docs(kind, owner, updated_at DESC);
"""

KIND_CANVAS = "canvas"
KIND_ASSET = "asset"
KIND_CHARACTER = "character"
KIND_STYLE = "style"
KIND_PROFILE = "profile"


class LibraryStore:
    def __init__(self, db_path: str | pathlib.Path,
                 files_root: str | pathlib.Path | None = None) -> None:
        self.path = pathlib.Path(db_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.files_root = pathlib.Path(files_root or self.path.parent / "visual" / "files")
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

    # ---------- 通用 CRUD ----------
    def create(self, kind: str, name: str, payload: dict[str, Any] | None = None, *,
               owner: str = "", doc_id: str | None = None) -> dict[str, Any]:
        now = time.time()
        ident = doc_id or uuid.uuid4().hex
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO docs (id, kind, owner, name, payload,"
                " created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
                (ident, kind, owner, name, json.dumps(payload or {}, ensure_ascii=False),
                 now, now))
        return self.get(ident) or {}

    def update(self, doc_id: str, **fields: Any) -> dict[str, Any] | None:
        record = self.get(doc_id)
        if record is None:
            return None
        changes: dict[str, Any] = {"updated_at": time.time()}
        if "name" in fields and fields["name"] is not None:
            changes["name"] = str(fields["name"])
        if "owner" in fields and fields["owner"] is not None:
            changes["owner"] = str(fields["owner"])
        if "payload" in fields and isinstance(fields["payload"], dict):
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
        return self._to_dict(row) if row else None

    def list(self, kind: str, *, owner: str | None = None, limit: int = 200,
             keyword: str = "") -> list[dict[str, Any]]:
        sql = "SELECT * FROM docs WHERE kind=?"
        params: list[Any] = [kind]
        if owner:
            sql += " AND owner=?"
            params.append(owner)
        if keyword:
            sql += " AND name LIKE ?"
            params.append(f"%{keyword}%")
        sql += " ORDER BY updated_at DESC LIMIT ?"
        params.append(int(limit))
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
        return [self._to_dict(row) for row in rows]

    def delete(self, doc_id: str) -> bool:
        with self._lock:
            cur = self._conn.execute("DELETE FROM docs WHERE id=?", (doc_id,))
            return cur.rowcount > 0

    def count(self, kind: str) -> int:
        with self._lock:
            row = self._conn.execute("SELECT COUNT(*) AS n FROM docs WHERE kind=?",
                                     (kind,)).fetchone()
        return int(row["n"]) if row else 0

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

    @staticmethod
    def _to_dict(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "kind": row["kind"],
            "owner": row["owner"],
            "name": row["name"],
            "payload": json.loads(row["payload"]),
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    def brief(self, record: dict[str, Any], *, fields: tuple[str, ...] = ()) -> dict[str, Any]:
        summary = {"id": record["id"], "name": record["name"],
                   "createdAt": record["createdAt"], "updatedAt": record["updatedAt"]}
        if record.get("owner"):
            summary["owner"] = record["owner"]
        for key in fields:
            if key in record["payload"]:
                summary[key] = record["payload"][key]
        return summary
