"""资产库匹配：把项目资产与本机素材库对上，供步骤 02「匹配本地资产」使用。

前端契约（`asset_match230.js`）：

    GET  /api/asset-library/matches?projectId=...&busyTargets=[...]
      → { totalAssets, matchedAssets, recommendedAssets, alreadyHasImageAssets,
          busyAssets, matchToken,
          targets:[{targetKey,name,kind,status,reason,recommendedVersionId,
                    candidates:[{versionId,name,sourceName,url,recommended,
                                 eligible,requiresReview}]}] }
    POST /api/asset-library/inherit {projectId, matchToken, selections:[{targetKey,versionId}]}

`status` 取值：recommended | review | existing | busy | unmatched。
"""

from __future__ import annotations

import json
import secrets

from .router import Request, Response, Router

_MATCH_TOKENS: dict[str, dict] = {}
_KINDS = ("people", "scenes", "props")


def build(router: Router, service, assets_store) -> None:
    def _library_rows() -> dict[str, list[dict]]:
        rows: dict[str, list[dict]] = {}
        if assets_store is None:
            return rows
        for row in assets_store.list(limit=500):
            payload = row.get("payload") or {}
            kind = str(row.get("kind") or payload.get("kind") or "")
            file_value = str(row.get("file") or payload.get("file") or "").strip()
            if not kind or not file_value:
                continue
            # 统一成扁平结构，后面只读 row["file"]
            rows.setdefault(kind, []).append({**row, "file": file_value})
        return rows

    def _candidate(row: dict) -> dict:
        payload = row.get("payload") or {}
        return {
            "versionId": str(row.get("id")),
            "id": str(row.get("id")),
            "name": str(row.get("name") or "历史资产"),
            "sourceName": str(row.get("name") or "历史资产"),
            "url": f"/api/asset-library/image?id={row.get('id')}",
            "file": row.get("file") or payload.get("file"),
            "recommended": True,
            "eligible": True,
            "requiresReview": False,
        }

    def _build_rows(project_id: str, busy: set[str]) -> tuple[list[dict], dict]:
        record = service.store.get(project_id) if service.store else None
        assets = (record or {}).get("assets") or {}
        library = _library_rows()
        targets: list[dict] = []
        counts = {"total": 0, "recommended": 0, "review": 0,
                  "existing": 0, "busy": 0, "unmatched": 0}
        for kind in _KINDS:
            for index, item in enumerate(assets.get(kind) or [], start=1):
                key = str(item.get("id") or f"{kind}-{index}")
                name = str(item.get("name") or "")
                candidates = [
                    _candidate(row) for row in library.get(kind, [])
                    if name and (row.get("name") == name
                                 or name in str(row.get("name") or "")
                                 or str(row.get("name") or "") in name)
                ]
                if item.get("imageFile"):
                    status, reason = "existing", "此资产已有可用图片，默认不覆盖。"
                elif key in busy:
                    status, reason = "busy", "此项已进入原图片任务，本次不覆盖。"
                elif candidates:
                    status, reason = "recommended", "找到可继承的历史图片。"
                else:
                    status, reason = "unmatched", "本机素材库暂无同名图片。"
                counts["total"] += 1
                counts[status] += 1
                targets.append({
                    "targetKey": key, "assetId": key, "kind": kind, "name": name,
                    "status": status, "reason": reason,
                    "recommendedVersionId": candidates[0]["versionId"] if candidates else "",
                    "candidates": candidates,
                })
        return targets, counts

    def asset_matches(req: Request) -> Response:
        project_id = req.q1("projectId") or ""
        if not project_id:
            return Response.error(400, "invalid_input", "缺少 projectId。")
        if service.store is None or service.store.get(project_id) is None:
            return Response.error(404, "not_found", "项目不存在。")
        busy: set[str] = set()
        raw_busy = req.q1("busyTargets") or ""
        if raw_busy:
            try:
                busy = {str(item) for item in json.loads(raw_busy)}
            except (json.JSONDecodeError, TypeError):
                busy = set()
        targets, counts = _build_rows(project_id, busy)
        token = secrets.token_urlsafe(16)
        _MATCH_TOKENS[token] = {"projectId": project_id, "targets": targets}
        return Response(200, {
            "ok": True, "projectId": project_id,
            "totalAssets": counts["total"],
            "matchedAssets": counts["recommended"],
            "recommendedAssets": counts["recommended"],
            "reviewAssets": counts["review"],
            "alreadyHasImageAssets": counts["existing"],
            "busyAssets": counts["busy"],
            "unmatchedAssets": counts["unmatched"],
            "matchToken": token, "targets": targets,
            "libraryStatus": {"active": False, "scanning": False,
                              "indexing": False, "pendingProjects": 0},
        })

    def asset_inherit(req: Request) -> Response:
        body = req.json() if req.body else {}
        project_id = str(body.get("projectId") or "")
        token = str(body.get("matchToken") or "")
        if not project_id:
            return Response.error(400, "invalid_input", "缺少 projectId。")
        saved = _MATCH_TOKENS.pop(token, None) if token else None
        if saved is not None and saved.get("projectId") != project_id:
            return Response.error(409, "conflict", "匹配结果属于其他项目，请重新匹配。")
        targets = (saved or {}).get("targets") or []

        selections = body.get("selections")
        chosen: dict[str, str] = {}
        if isinstance(selections, list):
            for row in selections:
                if isinstance(row, dict):
                    chosen[str(row.get("targetKey"))] = str(row.get("versionId") or "")
        record = service.store.get(project_id) if service.store else None
        if record is None:
            return Response.error(404, "not_found", "项目不存在。")
        settings = dict(record.get("settings") or {})
        assets = dict(settings.get("assets") or {})
        inherited = 0
        for target in targets:
            key = str(target.get("targetKey") or "")
            if chosen and key not in chosen:
                continue
            version = chosen.get(key) or str(target.get("recommendedVersionId") or "")
            candidate = next((row for row in target.get("candidates") or []
                              if str(row.get("versionId")) == version), None)
            if candidate is None:
                continue
            kind = str(target.get("kind") or "")
            rows = list(assets.get(kind) or [])
            for index, row in enumerate(rows):
                row_id = str(row.get("id") or f"{kind}-{index + 1}")
                if row_id != key:
                    continue
                row = dict(row)
                row["id"] = row_id
                row["kind"] = kind
                row["imageFile"] = candidate.get("file")
                row["status"] = "done"
                row["inherited"] = True
                rows[index] = row
                inherited += 1
                break
            assets[kind] = rows
        settings["assets"] = assets
        service.store.update(project_id, settings=settings)
        return Response(200, {"ok": True, "inherited": inherited,
                              "project": service.store.get(project_id)})

    router.register("D2", "/api/asset-library/matches", asset_matches)
    router.register("D2", "/api/asset-library/inherit", asset_inherit,
                    methods=("POST",))
