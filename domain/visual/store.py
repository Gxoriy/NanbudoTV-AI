"""视觉项目存储（SQLite）。

只存"工程文档"：名称、描述、风格、设置、分镜骨架、缩略图。
图片/视频产物不落库，只落 `data/visual/<projectId>/`，库里存相对路径。
"""

from __future__ import annotations

import json
import pathlib
import sqlite3
import threading
import time
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS visual_projects (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    style        TEXT NOT NULL DEFAULT '',
    settings     TEXT NOT NULL DEFAULT '{}',
    scenes       TEXT NOT NULL DEFAULT '[]',
    thumbnail    TEXT NOT NULL DEFAULT '',
    request_id   TEXT,
    created_at   REAL NOT NULL,
    updated_at   REAL NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_visual_request
    ON visual_projects(request_id) WHERE request_id IS NOT NULL;
"""


class VisualStore:
    def __init__(self, db_path: str | pathlib.Path) -> None:
        self.path = pathlib.Path(db_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
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

    # ---------- 写 ----------
    def create(self, project_id: str, name: str, *, description: str = "",
               style: str = "", settings: dict[str, Any] | None = None,
               request_id: str | None = None) -> dict[str, Any]:
        now = time.time()
        try:
            with self._lock:
                self._conn.execute(
                    "INSERT INTO visual_projects (id, name, description, style, settings,"
                    " scenes, thumbnail, request_id, created_at, updated_at)"
                    " VALUES (?,?,?,?,?,?,'',?,?,?)",
                    (project_id, name, description, style,
                     json.dumps(settings or {}, ensure_ascii=False), "[]",
                     request_id, now, now))
        except sqlite3.IntegrityError:
            existing = self.find_by_request(request_id) if request_id else None
            if existing is None:
                raise
            return existing
        return self.get(project_id) or {}

    def update(self, project_id: str, **fields: Any) -> dict[str, Any]:
        allowed = {"name", "description", "style", "settings", "scenes", "thumbnail"}
        payload = {k: v for k, v in fields.items() if k in allowed}
        if not payload:
            return self.get(project_id) or {}
        for key in ("settings", "scenes"):
            if key in payload and not isinstance(payload[key], str):
                payload[key] = json.dumps(payload[key], ensure_ascii=False)
        payload["updated_at"] = time.time()
        cols = ", ".join(f"{k}=?" for k in payload)
        with self._lock:
            self._conn.execute(f"UPDATE visual_projects SET {cols} WHERE id=?",
                               (*payload.values(), project_id))
        return self.get(project_id) or {}

    def delete(self, project_id: str) -> bool:
        with self._lock:
            cur = self._conn.execute("DELETE FROM visual_projects WHERE id=?", (project_id,))
            return cur.rowcount > 0

    # ---------- 读 ----------
    def get(self, project_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM visual_projects WHERE id=?",
                                     (project_id,)).fetchone()
        return self._to_dict(row) if row else None

    def find_by_request(self, request_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM visual_projects WHERE request_id=?", (request_id,)).fetchone()
        return self._to_dict(row) if row else None

    def list(self, limit: int = 200) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM visual_projects ORDER BY updated_at DESC LIMIT ?",
                (int(limit),)).fetchall()
        return [self._to_dict(row) for row in rows]

    @staticmethod
    def _to_dict(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "style": row["style"],
            "settings": json.loads(row["settings"]),
            "scenes": json.loads(row["scenes"]),
            "thumbnail": row["thumbnail"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }
