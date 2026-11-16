"""整片配音任务记录（SQLite）。

按 (projectId, file) 唯一：前端刷新页面后要能看到"已完成 2/3 段""可继续"，
所以状态必须落盘，不能只存在内存里。
"""

from __future__ import annotations

import json
import pathlib
import sqlite3
import threading
import time
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS voice_jobs (
    project_id  TEXT NOT NULL,
    file        TEXT NOT NULL,
    segments    TEXT NOT NULL DEFAULT '[]',
    status      TEXT NOT NULL DEFAULT '{}',
    result_file TEXT NOT NULL DEFAULT '',
    updated_at  REAL NOT NULL,
    PRIMARY KEY (project_id, file)
);
"""


class VoiceJobStore:
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

    def save(self, project_id: str, file: str, *, segments: list[dict[str, Any]],
             status: dict[str, Any], result_file: str = "") -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO voice_jobs"
                " (project_id, file, segments, status, result_file, updated_at)"
                " VALUES (?,?,?,?,?,?)",
                (project_id, file, json.dumps(segments, ensure_ascii=False),
                 json.dumps(status, ensure_ascii=False), result_file, time.time()))

    def get(self, project_id: str, file: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM voice_jobs WHERE project_id=? AND file=?",
                (project_id, file)).fetchone()
        if row is None:
            return None
        return {
            "projectId": row["project_id"],
            "file": row["file"],
            "segments": json.loads(row["segments"]),
            "status": json.loads(row["status"]),
            "resultFile": row["result_file"],
            "updatedAt": row["updated_at"],
        }

    def latest(self, project_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM voice_jobs WHERE project_id=?"
                " ORDER BY updated_at DESC LIMIT 1", (project_id,)).fetchone()
        if row is None:
            return None
        return self.get(row["project_id"], row["file"])
