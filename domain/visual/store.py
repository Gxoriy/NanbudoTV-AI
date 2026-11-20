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


def _fnv_hash(text: str) -> str:
    value = 2166136261
    for char in text:
        value = ((value ^ ord(char)) * 16777619) & 0xFFFFFFFF
    return f"{value:08x}"


def _asset_buckets(settings: dict) -> dict:
    """项目资产分组：people/scenes/props。

    旧版本提取的资产没有 id（前端按 id 查 item、按 id 请求提示词），
    这里在**读取时**补一个稳定 id，不改数据库内容——否则老项目永远"素材不存在"。
    """
    raw = settings.get("assets") if isinstance(settings.get("assets"), dict) else {}
    buckets: dict[str, list] = {}
    for key in ("people", "scenes", "props"):
        rows = []
        for index, row in enumerate(raw.get(key) or [], start=1):
            item = dict(row) if isinstance(row, dict) else {"name": str(row)}
            item.setdefault("id", f"{key}-{index}")
            item.setdefault("kind", key)
            rows.append(item)
        buckets[key] = rows
    return buckets


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
        if "settings" in payload and not isinstance(payload["settings"], str):
            incoming = dict(payload["settings"])
            row = self._conn.execute(
                "SELECT settings FROM visual_projects WHERE id=?",
                (project_id,)).fetchone()
            old = json.loads(row["settings"] or "{}") if row is not None else {}
            for key in ("assets", "confirmedScript", "sourceStructure",
                        "workflowPreparedScript", "workflowAssetSourceHash"):
                if key not in incoming and old.get(key):
                    incoming[key] = old[key]
            payload["settings"] = incoming
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
        settings = json.loads(row["settings"]) or {}
        return {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "style": row["style"],
            "settings": settings,
            "scenes": json.loads(row["scenes"]),
            "thumbnail": row["thumbnail"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            # 前端保存后用它回读正文做一致性校验：
            # storedProjectSource = project.confirmedScript || project.sourceStructure
            "confirmedScript": str(settings.get("confirmedScript") or ""),
            "sourceStructure": str(settings.get("sourceStructure") or ""),
            # 步骤 01/03 依赖：needsAIDirectory() 读 sceneDirectory
            "workflowPreparedScript": settings.get("workflowPreparedScript") or {},
            "workflowAssetSourceHash": (
                settings.get("workflowAssetSourceHash")
                or (
                    _fnv_hash(str(settings.get("confirmedScript")
                                  or settings.get("sourceStructure") or ""))
                    if any((settings.get("assets") or {}).get(kind)
                           for kind in ("people", "scenes", "props"))
                    and str(settings.get("confirmedScript")
                            or settings.get("sourceStructure") or "").strip()
                    else ""
                )
            ),
            "workflowAssetSourceLength": settings.get("workflowAssetSourceLength") or 0,
            "scriptGenerationId": settings.get("scriptGenerationId") or "",
            # 前端有多处直接读 project.assets.people（不判空），缺了 assets 会在
            # 保存回调里抛 TypeError，被兜成"自动保存未完成"。
            "assets": _asset_buckets(settings),
            "episodes": settings.get("episodes") or [],
            # 前端项目卡片/激活逻辑用 projectName 与各类计数
            "projectName": row["name"],
            "macroArrangement": settings.get("macroArrangement") or {},
            "scriptCuts": settings.get("scriptCuts") or [],
        }
