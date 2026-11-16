"""S1 历史记录：列表、明细、删除、重命名、保留策略。

旧样本形状：`{ok, records: [], storagePath, retentionDays: -1}`
（`-1` 表示不自动清理）。记录存业务库，文件不进库只存相对路径。
"""

from __future__ import annotations

import pathlib

from .router import Request, Response, Router
from domain.workspace.store import DocStore

KIND_HISTORY = "history"


def build(router: Router, store: DocStore, *, outputs_root: pathlib.Path,
          retention_days: int = -1) -> None:
    def _brief(record: dict) -> dict:
        payload = record["payload"]
        item = {"id": record["id"], "name": record["name"],
                "createdAt": record["createdAt"], "updatedAt": record["updatedAt"]}
        for key in ("type", "feature", "file", "cover", "size", "duration",
                    "status", "projectId"):
            if key in payload:
                item[key] = payload[key]
        return item

    def history_list(req: Request) -> Response:
        feature = req.q1("feature") or req.q1("type")
        limit = int(req.q1("limit", "200") or 200)
        records = [_brief(row) for row in store.list(KIND_HISTORY, limit=limit)]
        if feature:
            records = [row for row in records if row.get("feature") == feature]
        return Response(200, {"ok": True, "records": records,
                              "storagePath": str(outputs_root),
                              "retentionDays": retention_days})

    def history_item(req: Request) -> Response:
        record = store.get(req.q1("id") or "")
        if record is None or record["kind"] != KIND_HISTORY:
            return Response.error(404, "not_found", "记录不存在。")
        body = _brief(record)
        body["payload"] = record["payload"]
        return Response(200, {"ok": True, "record": body})

    def history_delete(req: Request) -> Response:
        doc_id = str(req.json().get("id") or req.q1("id") or "")
        if not store.delete(doc_id):
            return Response.error(404, "not_found", "记录不存在。")
        return Response(200, {"ok": True, "id": doc_id})

    def history_rename(req: Request) -> Response:
        body = req.json()
        doc_id = str(body.get("id") or "")
        name = str(body.get("name") or "").strip()
        if not name:
            return Response.error(400, "invalid_input", "名称不能为空。")
        record = store.update(doc_id, name=name)
        if record is None:
            return Response.error(404, "not_found", "记录不存在。")
        return Response(200, {"ok": True, "record": _brief(record)})

    def history_policy(_req: Request) -> Response:
        return Response(200, {"ok": True, "retentionDays": retention_days,
                              "autoClean": retention_days > 0,
                              "message": "不自动清理（retentionDays=-1）。"})

    router.register("S1", "/api/history", history_list)
    router.register("S1", "/api/history/item", history_item)
    router.register("S1", "/api/history/delete", history_delete, methods=("POST",))
    router.register("S1", "/api/history/rename", history_rename, methods=("POST",))
    router.register("S1", "/api/history/policy", history_policy)
