"""资产库匹配：把项目里的资产与本机素材库对上，供步骤 02「匹配本地资产」使用。

前端流程：GET /api/asset-library/matches?projectId=... → {matchToken, targets}
        → POST /api/asset-library/inherit {projectId, matchToken, selections}
"""

from __future__ import annotations

from .router import Request, Response, Router


def build(router: Router, service, assets_store) -> None:
    _match_tokens: dict[str, dict] = {}

    def _match_candidates(project_id: str) -> tuple[list[dict], list[dict]]:
        """把项目资产与本机素材库按 类型+名称 对上：返回 (targets, all_assets)。"""
        record = service.store.get(project_id) if service.store else None
        if record is None:
            return [], []
        assets = record.get("assets") or {}
        library_rows = assets_store.list(limit=500) if assets_store else []
        by_kind: dict[str, list[dict]] = {}
        for row in library_rows:
            payload = row.get("payload") or {}
            kind = str(row.get("kind") or payload.get("kind") or "")
            if not str(payload.get("file") or "").strip():
                continue
            by_kind.setdefault(kind, []).append(row)
        targets: list[dict] = []
        flat: list[dict] = []
        for kind in ("people", "scenes", "props"):
            for index, item in enumerate(assets.get(kind) or [], start=1):
                name = str(item.get("name") or "")
                target_key = str(item.get("id") or f"{kind}-{index}")
                flat.append({"targetKey": target_key, "kind": kind, "name": name,
                             "file": item.get("imageFile") or ""})
                if not name:
                    continue
                for row in by_kind.get(kind, []):
                    candidate = row.get("name") or ""
                    if candidate == name or name in candidate or candidate in name:
                        payload = row.get("payload") or {}
                        targets.append({"targetKey": target_key, "kind": kind,
                                        "assetId": str(item.get("id") or ""),
                                        "name": name,
                                        "image": {"file": payload.get("file"),
                                                  "name": row.get("name"),
                                                  "assetId": row.get("id")}})
                        break
        return targets, flat

    def asset_matches(req: Request) -> Response:
        import secrets  # noqa: PLC0415

        project_id = req.q1("projectId") or ""
        if not project_id:
            return Response.error(400, "invalid_input", "缺少 projectId。")
        record = service.store.get(project_id) if service.store else None
        if record is None:
            return Response.error(404, "not_found", "项目不存在。")
        targets, flat = _match_candidates(project_id)
        token = secrets.token_urlsafe(16)
        _match_tokens[token] = {"projectId": project_id, "targets": targets}
        return Response(200, {
            "ok": True, "projectId": project_id,
            "totalAssets": len(flat),
            "matchedAssets": len(targets),
            "unmatchedAssets": max(0, len(flat) - len(targets)),
            "matchToken": token, "targets": targets,
            "libraryStatus": {"active": False, "scanning": False,
                              "indexing": False, "pendingProjects": 0},
        })

    def asset_inherit(req: Request) -> Response:
        body = req.json() if req.body else {}
        project_id = str(body.get("projectId") or "")
        token = str(body.get("matchToken") or "")
        saved = _match_tokens.pop(token, None) if token else None
        if not project_id:
            return Response.error(400, "invalid_input", "缺少 projectId。")
        if saved is None:
            # token 过期/服务重启：重新算一次，不阻断用户
            targets, _flat = _match_candidates(project_id)
        else:
            if saved.get("projectId") != project_id:
                return Response.error(409, "conflict", "匹配结果属于其他项目，请重新匹配。")
            targets = saved.get("targets") or []
        selections = body.get("selections")
        selected_keys = {str(row.get("targetKey")) for row in selections or []
                         if isinstance(row, dict)} if isinstance(selections, list) else set()
        record = service.store.get(project_id) if service.store else None
        if record is None:
            return Response.error(404, "not_found", "项目不存在。")
        settings = dict(record.get("settings") or {})
        assets = dict(settings.get("assets") or {})
        inherited = 0
        for target in targets:
            if selected_keys and str(target.get("targetKey")) not in selected_keys:
                continue
            kind = str(target.get("kind") or "")
            asset_id = str(target.get("targetKey"))
            rows = list(assets.get(kind) or [])
            for index, row in enumerate(rows):
                row_id = str(row.get("id") or f"{kind}-{index + 1}")
                if row_id != asset_id:
                    continue
                row = dict(row)
                row["id"] = row_id
                row["kind"] = kind
                row["imageFile"] = (target.get("image") or {}).get("file")
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
