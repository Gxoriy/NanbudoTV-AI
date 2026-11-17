"""素材库（四表 + 相似度检索）——对齐原包 `core.asset_library228` 的 schema。

原包用 `projects / assets / aliases / versions` 四张表，并带相似度排序
（`ROW_NUMBER() OVER(PARTITION BY id ORDER BY similarity)`）。这里按同样结构实现：

  projects(id, name, style, deleted, created_at, updated_at)
  assets(id, project_id, name, kind, file, meta, deleted, created_at, updated_at)
  aliases(asset_id, name)                    -- 同一素材的别名/别称
  versions(id, asset_id, file, note, deleted, created_at)

与 `LibraryStore` 的分工：
  - `document`（画布/样式/角色/剧集设置）继续用单表 docs
  - **素材**用这里的四表：名字检索、别名命中、历史版本都在这层
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
CREATE TABLE IF NOT EXISTS projects(
    id TEXT PRIMARY KEY, name TEXT NOT NULL, style TEXT NOT NULL DEFAULT '',
    deleted INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL, updated_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS assets(
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'image',
    file TEXT NOT NULL DEFAULT '', meta TEXT NOT NULL DEFAULT '{}',
    deleted INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL, updated_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS aliases(
    asset_id TEXT NOT NULL, name TEXT NOT NULL,
    UNIQUE(asset_id, name));
CREATE TABLE IF NOT EXISTS versions(
    id TEXT PRIMARY KEY, asset_id TEXT NOT NULL, file TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '', deleted INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL);
CREATE INDEX IF NOT EXISTS ix_assets_project ON assets(project_id, deleted);
CREATE INDEX IF NOT EXISTS ix_aliases_name ON aliases(name);
"""


class AssetStore:
    def __init__(self, path: str | pathlib.Path) -> None:
        self.path = pathlib.Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(str(self.path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.executescript(SCHEMA)
            self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    # ---------- 项目 ----------
    def ensure_project(self, project_id: str, name: str = "") -> None:
        if not project_id:
            return
        now = time.time()
        with self._lock:
            self._conn.execute(
                "INSERT INTO projects(id, name, style, created_at, updated_at)"
                " VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at",
                (project_id, name or project_id[:8], "", now, now))
            self._conn.commit()

    # ---------- 素材 ----------
    def add(self, *, name: str, file: str = "", kind: str = "image",
            project_id: str = "", meta: dict[str, Any] | None = None,
            aliases: list[str] | None = None, asset_id: str | None = None) -> dict[str, Any]:
        asset_id = asset_id or uuid.uuid4().hex
        now = time.time()
        with self._lock:
            self._conn.execute(
                "INSERT INTO assets(id, project_id, name, kind, file, meta,"
                " created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
                (asset_id, project_id, name, kind, file,
                 json.dumps(meta or {}, ensure_ascii=False), now, now))
            for alias in aliases or []:
                text = str(alias).strip()
                if text:
                    self._conn.execute(
                        "INSERT OR IGNORE INTO aliases(asset_id, name) VALUES (?,?)",
                        (asset_id, text))
            self._conn.commit()
        return self.get(asset_id) or {}

    def get(self, asset_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM assets WHERE id=? AND deleted=0", (asset_id,)).fetchone()
            if row is None:
                return None
            aliases = [r["name"] for r in self._conn.execute(
                "SELECT name FROM aliases WHERE asset_id=?", (asset_id,))]
        return self._to_dict(row, aliases)

    def update(self, asset_id: str, **fields: Any) -> dict[str, Any] | None:
        allowed = {key: value for key, value in fields.items()
                   if key in ("name", "file", "kind", "project_id")}
        meta = fields.get("meta")
        assignments = [f"{key}=?" for key in allowed]
        values: list[Any] = list(allowed.values())
        if meta is not None:
            assignments.append("meta=?")
            values.append(json.dumps(meta, ensure_ascii=False))
        if not assignments:
            return self.get(asset_id)
        assignments.append("updated_at=?")
        values.extend([time.time(), asset_id])
        with self._lock:
            cur = self._conn.execute(
                f"UPDATE assets SET {', '.join(assignments)} WHERE id=? AND deleted=0",
                values)
            self._conn.commit()
            if cur.rowcount == 0:
                return None
        aliases = fields.get("aliases")
        if isinstance(aliases, list):
            with self._lock:
                self._conn.execute("DELETE FROM aliases WHERE asset_id=?", (asset_id,))
                for alias in aliases:
                    text = str(alias).strip()
                    if text:
                        self._conn.execute(
                            "INSERT OR IGNORE INTO aliases(asset_id, name) VALUES (?,?)",
                            (asset_id, text))
                self._conn.commit()
        return self.get(asset_id)

    def delete(self, asset_id: str) -> bool:
        with self._lock:
            cur = self._conn.execute(
                "UPDATE assets SET deleted=1, updated_at=? WHERE id=? AND deleted=0",
                (time.time(), asset_id))
            self._conn.commit()
            return cur.rowcount > 0

    def list(self, *, project_id: str | None = None, q: str = "",
             kind: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
        if q.strip():
            return self.search(q, project_id=project_id, kind=kind, limit=limit)
        sql = "SELECT * FROM assets WHERE deleted=0"
        params: list[Any] = []
        if project_id:
            sql += " AND project_id=?"
            params.append(project_id)
        if kind:
            sql += " AND kind=?"
            params.append(kind)
        sql += " ORDER BY updated_at DESC LIMIT ?"
        params.append(limit)
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
            out = []
            for row in rows:
                aliases = [r["name"] for r in self._conn.execute(
                    "SELECT name FROM aliases WHERE asset_id=?", (row["id"],))]
                out.append(self._to_dict(row, aliases))
        return out

    def search(self, q: str, *, project_id: str | None = None,
               kind: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        """相似度排序：完全相等 3 分、前缀 2 分、包含 1 分；别名同权。"""
        text = q.strip()
        if not text:
            return self.list(project_id=project_id, kind=kind, limit=limit)
        like = f"%{text}%"
        sql = """
        SELECT a.*, MAX(
            CASE WHEN a.name = ? THEN 3
                 WHEN a.name LIKE ? THEN 2
                 WHEN a.name LIKE ? THEN 1 ELSE 0 END,
            COALESCE((SELECT MAX(CASE WHEN al.name = ? THEN 3
                                      WHEN al.name LIKE ? THEN 2
                                      WHEN al.name LIKE ? THEN 1 ELSE 0 END)
                      FROM aliases al WHERE al.asset_id = a.id), 0)
        ) AS similarity
        FROM assets a
        WHERE a.deleted=0 AND (a.name LIKE ? OR a.id IN
              (SELECT asset_id FROM aliases WHERE name LIKE ?))
        """
        params: list[Any] = [text, f"{text}%", like, text, f"{text}%", like, like, like]
        if project_id:
            sql += " AND a.project_id = ?"
            params.append(project_id)
        if kind:
            sql += " AND a.kind = ?"
            params.append(kind)
        sql += " GROUP BY a.id ORDER BY similarity DESC, a.updated_at DESC LIMIT ?"
        params.append(limit)
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
            out = []
            for row in rows:
                aliases = [r["name"] for r in self._conn.execute(
                    "SELECT name FROM aliases WHERE asset_id=?", (row["id"],))]
                item = self._to_dict(row, aliases)
                item["similarity"] = row["similarity"]
                out.append(item)
        return out

    # ---------- 版本 ----------
    def add_version(self, asset_id: str, file: str, note: str = "") -> dict[str, Any]:
        version_id = uuid.uuid4().hex
        now = time.time()
        with self._lock:
            self._conn.execute(
                "INSERT INTO versions(id, asset_id, file, note, created_at)"
                " VALUES (?,?,?,?,?)", (version_id, asset_id, file, note, now))
            self._conn.commit()
        return {"id": version_id, "assetId": asset_id, "file": file, "note": note,
                "createdAt": now}

    def versions(self, asset_id: str) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM versions WHERE asset_id=? AND deleted=0"
                " ORDER BY created_at DESC", (asset_id,)).fetchall()
        return [{"id": r["id"], "assetId": r["asset_id"], "file": r["file"],
                 "note": r["note"], "createdAt": r["created_at"]} for r in rows]

    def count(self) -> int:
        with self._lock:
            return int(self._conn.execute(
                "SELECT COUNT(*) FROM assets WHERE deleted=0").fetchone()[0])

    # ---------- 序列化 ----------
    @staticmethod
    def _to_dict(row: sqlite3.Row, aliases: list[str]) -> dict[str, Any]:
        try:
            meta = json.loads(row["meta"] or "{}")
        except json.JSONDecodeError:
            meta = {}
        item = {"id": row["id"], "projectId": row["project_id"], "name": row["name"],
                "kind": row["kind"], "type": meta.get("type") or row["kind"],
                "file": row["file"], "aliases": aliases,
                "createdAt": row["created_at"], "updatedAt": row["updated_at"]}
        item.update({k: v for k, v in meta.items() if k not in item})
        return item

    def brief(self, item: dict[str, Any], fields: tuple[str, ...] | None = None) -> dict:
        keys = fields or ("id", "name", "file", "type", "kind", "projectId",
                          "aliases", "similarity", "createdAt", "updatedAt")
        return {key: item.get(key) for key in keys if key in item}
