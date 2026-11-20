"""原版 1.280 更新带来的新组件所依赖的接口。

来源：_internal/static 里的 asset_tools283.js / workflow_series282.js /
canvas_tail283.js / workflow_script_review286.css / app.js / login.js。
只实现前端契约需要的形状，不改旧路由语义。
"""

from __future__ import annotations

import hashlib
import time
from typing import Any

from .router import Request, Response, Router


def build(router: Router, service: Any, *, task_store=None, assist=None) -> None:
    def _record(project_id: str) -> dict:
        return service.store.get(project_id) or {} if service.store else {}

    def _settings(project_id: str) -> dict:
        return dict(_record(project_id).get("settings") or {})

    def _save(project_id: str, settings: dict) -> dict:
        if service.store is None:
            return {}
        service.store.update(project_id, settings=settings)
        return service.store.get(project_id) or {}

    # ---------- 客户端在线更新 ----------
    def update_apply(req: Request) -> Response:
        body = req.json() if req.body else {}
        name = str(body.get("fileName") or "")
        return Response(200, {
            "ok": True, "fileName": name,
            "message": "更新流程已启动（演示版不替换正在运行的文件）。",
        })

    # ---------- 剧本格式检查 ----------
    def _review_rows(text: str) -> list[dict]:
        rows: list[dict] = []
        for number, line in enumerate((text or "").splitlines(), start=1):
            value = line.strip()
            if not value:
                continue
            if value.startswith("第") and ("场" in value[:12] or "集" in value[:12]):
                kind = "action"
            elif any(token in value for token in ("屏幕", "画外音", "OS", "VO")):
                kind = "ambiguous"
            elif len(value) > 1 and value[1] in "：:" and len(value.split("：")[0]) <= 8:
                kind = "dialogue"
            else:
                kind = "action"
            choices = ["voice", "screen", "dialogue", "action"] if kind == "ambiguous" else None
            rows.append({"line": number, "text": value[:200],
                         "type": "dialogue" if kind == "ambiguous" else kind,
                         "choices": choices,
                         "decision": (dict(_settings("")).get("scriptReviewDecisions")
                                      or {}).get(str(number))})
        return rows[:200]

    def script_review(req: Request) -> Response:
        payload = req.json() if req.body else {}
        project_id = req.q1("projectId") or str(payload.get("projectId") or "")
        settings = _settings(project_id)
        record = _record(project_id)
        source = str(settings.get("confirmedScript")
                     or settings.get("sourceStructure")
                     or record.get("confirmedScript")
                     or record.get("sourceStructure") or "")
        if not source:
            return Response.error(400, "invalid_input", "项目原稿为空，无法检查格式。")
        if req.method == "POST":
            settings["scriptReviewDecisions"] = payload.get("decisions") or {}
            return Response(200, {"ok": True, "project": _save(project_id, settings)})
        rows = _review_rows(source)
        decisions = settings.get("scriptReviewDecisions") or {}
        for row in rows:
            if decisions.get(str(row["line"])):
                row["decision"] = decisions[str(row["line"])]
        counts: dict[str, int] = {}
        for row in rows:
            counts[row["type"]] = counts.get(row["type"], 0) + 1
        unresolved = sum(1 for row in rows if row.get("choices") and not row.get("decision"))
        return Response(200, {"ok": True, "projectId": project_id,
                              "counts": counts, "rows": rows,
                              "unresolvedCount": unresolved, "unmappedCount": 0})

    # ---------- 资产合并 / 使用项目内图片 ----------
    def _asset_rows(project_id: str, kind: str) -> tuple[dict, dict, list]:
        settings = _settings(project_id)
        assets = dict(settings.get("assets") or {})
        return settings, assets, list(assets.get(kind) or [])

    def merge_preview(req: Request) -> Response:
        body = req.json() if req.body else {}
        project_id = str(body.get("projectId") or "")
        kind = str(body.get("kind") or "")
        keep_id = str(body.get("keepId") or "")
        name = str(body.get("name") or "").strip()
        ids = [str(item) for item in (body.get("assetIds") or [])]
        if not project_id or not kind or not name or keep_id not in ids:
            return Response.error(400, "invalid_input", "合并参数不完整。")
        settings, _assets, rows = _asset_rows(project_id, kind)
        selected = [row for row in rows if str(row.get("id")) in ids]
        if not selected:
            return Response.error(404, "not_found", "所选资产不存在。")
        plan = "|".join([project_id, kind, keep_id, name, *sorted(ids)])
        plan_hash = hashlib.sha256(plan.encode()).hexdigest()[:16]
        aliases = sorted({str(row.get("name")) for row in selected
                          if str(row.get("id")) != keep_id and row.get("name")})
        return Response(200, {
            "ok": True, "projectId": project_id, "kind": kind,
            "keepId": keep_id, "name": name, "planHash": plan_hash,
            "aliases": aliases,
            "affectedEpisodeCount": len(settings.get("seriesEpisodes") or []),
            "affectedReferenceCount": 0,
        })

    def merge_apply(req: Request) -> Response:
        body = req.json() if req.body else {}
        project_id = str(body.get("projectId") or "")
        kind = str(body.get("kind") or "")
        keep_id = str(body.get("keepId") or "")
        name = str(body.get("name") or "").strip()
        ids = [str(item) for item in (body.get("assetIds") or [])]
        settings, assets, rows = _asset_rows(project_id, kind)
        kept = next((dict(row) for row in rows if str(row.get("id")) == keep_id), None)
        if kept is None:
            return Response.error(404, "not_found", "保留资产不存在。")
        aliases = list(kept.get("aliases") or [])
        for row in rows:
            if str(row.get("id")) in ids and str(row.get("id")) != keep_id:
                if row.get("name") and row["name"] not in aliases:
                    aliases.append(row["name"])
        kept["name"] = name
        kept["aliases"] = aliases
        kept["id"] = keep_id
        kept["kind"] = kind
        image_asset_id = body.get("imageAssetId")
        if image_asset_id:
            all_rows = [row for group in assets.values() for row in (group or [])]
            source = next((row for row in all_rows
                           if str(row.get("id")) == str(image_asset_id)), None)
            if source and source.get("imageFile"):
                kept["imageFile"] = source["imageFile"]
        assets[kind] = [kept] + [row for row in rows
                                 if str(row.get("id")) not in ids]
        settings["assets"] = assets
        return Response(200, {"ok": True, "project": _save(project_id, settings)})

    def use_project_image(req: Request) -> Response:
        body = req.json() if req.body else {}
        project_id = str(body.get("projectId") or "")
        kind = str(body.get("kind") or "")
        asset_id = str(body.get("assetId") or "")
        file_value = str(body.get("sourceImageFile") or "")
        settings, assets, rows = _asset_rows(project_id, kind)
        for index, row in enumerate(rows):
            if str(row.get("id")) != asset_id:
                continue
            row = dict(row)
            row["imageFile"] = file_value
            row["status"] = "done"
            rows[index] = row
            break
        else:
            return Response.error(404, "not_found", "目标资产不存在。")
        assets[kind] = rows
        settings["assets"] = assets
        return Response(200, {"ok": True, "project": _save(project_id, settings)})

    # ---------- 卡片视频设置 ----------
    def video_settings(req: Request) -> Response:
        body = req.json() if req.body else {}
        if body.get("reset"):
            return Response(200, {"ok": True, "videoSettings": None})
        model = str(body.get("model") or "")
        resolution = str(body.get("resolution") or "")
        if not model or not resolution:
            return Response.error(400, "invalid_input", "缺少模型或分辨率。")
        value = {"model": model, "resolution": resolution}
        project_id = str(body.get("projectId") or "")
        segment_id = str(body.get("segmentId") or "")
        number = str(body.get("cardNumber") or "")
        if project_id:
            settings = _settings(project_id)
            media = dict(settings.get("macroMedia") or {})
            media[f"{segment_id}/{number}"] = value
            settings["macroMedia"] = media
            _save(project_id, settings)
        return Response(200, {"ok": True, "videoSettings": value})

    # ---------- 多剧集 ----------
    def _episode(title: str, description: str, number: int) -> dict:
        return {"id": f"episode-{number}-{int(time.time() * 1000):x}",
                "title": title, "description": description,
                "number": number, "deleted": False}

    def _series(project_id: str) -> dict:
        record = _record(project_id)
        settings = dict(record.get("settings") or {})
        episodes = list(settings.get("seriesEpisodes") or [])
        return {
            "ok": True,
            "project": {**record, "seriesManaged": settings.get("seriesManaged") is True},
            "episodes": [row for row in episodes if not row.get("deleted")],
            "deletedEpisodes": [row for row in episodes if row.get("deleted")],
        }

    def series_list(req: Request) -> Response:
        project_id = req.q1("projectId") or ""
        if not project_id or _record(project_id).get("id") != project_id:
            return Response.error(404, "not_found", "项目不存在。")
        return Response(200, _series(project_id))

    def series_convert(req: Request) -> Response:
        body = req.json() if req.body else {}
        project_id = str(body.get("projectId") or "")
        settings = _settings(project_id)
        settings["seriesManaged"] = True
        if not settings.get("seriesEpisodes"):
            settings["seriesEpisodes"] = [_episode("第 1 集", "", 1)]
        _save(project_id, settings)
        return Response(200, _series(project_id))

    def series_settings(req: Request) -> Response:
        body = req.json() if req.body else {}
        project_id = str(body.get("projectId") or "")
        settings = _settings(project_id)
        for key in ("style", "imageTier", "videoTier", "visualStyle"):
            if key in (body.get("settings") or {}):
                settings[key] = body["settings"][key]
        if service.store and "projectName" in body:
            service.store.update(project_id, name=str(body["projectName"]))
        if "projectDescription" in body:
            settings["projectDescription"] = str(body["projectDescription"])
        settings["seriesManaged"] = True
        saved = _save(project_id, settings)
        if not saved:
            return Response.error(404, "not_found", "项目不存在。")
        return Response(200, _series(project_id))

    def series_episode_create(req: Request) -> Response:
        body = req.json() if req.body else {}
        project_id = str(body.get("projectId") or "")
        settings = _settings(project_id)
        episodes = list(settings.get("seriesEpisodes") or [])
        row = _episode(str(body.get("title") or f"第 {len(episodes) + 1} 集"),
                       str(body.get("description") or ""), len(episodes) + 1)
        episodes.append(row)
        settings["seriesEpisodes"] = episodes
        settings["seriesManaged"] = True
        _save(project_id, settings)
        return Response(200, {**_series(project_id), "episodeId": row["id"]})

    def series_episode_update(req: Request) -> Response:
        body = req.json() if req.body else {}
        project_id = str(body.get("projectId") or "")
        settings = _settings(project_id)
        episodes = list(settings.get("seriesEpisodes") or [])
        episode_id = str(body.get("episodeId") or "")
        for index, row in enumerate(episodes):
            if str(row.get("id")) == episode_id:
                row = dict(row)
                if "title" in body:
                    row["title"] = str(body["title"])
                if "description" in body:
                    row["description"] = str(body["description"])
                episodes[index] = row
                break
        settings["seriesEpisodes"] = episodes
        _save(project_id, settings)
        return Response(200, {**_series(project_id), "episodeId": episode_id})

    def series_episode_delete(req: Request) -> Response:
        body = req.json() if req.body else {}
        project_id = str(body.get("projectId") or "")
        episode_id = str(body.get("episodeId") or "")
        settings = _settings(project_id)
        episodes = list(settings.get("seriesEpisodes") or [])
        for index, row in enumerate(episodes):
            if str(row.get("id")) == episode_id:
                row = dict(row)
                row["deleted"] = True
                episodes[index] = row
                break
        settings["seriesEpisodes"] = episodes
        _save(project_id, settings)
        return Response(200, {**_series(project_id), "episodeId": episode_id})

    def series_delete(req: Request) -> Response:
        body = req.json() if req.body else {}
        project_id = str(body.get("projectId") or "")
        settings = _settings(project_id)
        settings["deleted"] = True
        _save(project_id, settings)
        return Response(200, {"ok": True, "projectId": project_id})

    def series_restore(req: Request) -> Response:
        body = req.json() if req.body else {}
        project_id = str(body.get("projectId") or "")
        settings = _settings(project_id)
        settings["deleted"] = False
        _save(project_id, settings)
        return Response(200, {"ok": True, "projectId": project_id,
                              "project": _record(project_id)})

    router.register("D2", "/api/update/apply-online", update_apply, methods=("POST",))
    router.register("D2", "/api/visual/project/script-review", script_review,
                    methods=("GET", "POST"))
    router.register("D2", "/api/visual/assets/merge/preview", merge_preview,
                    methods=("POST",))
    router.register("D2", "/api/visual/assets/merge/apply", merge_apply,
                    methods=("POST",))
    router.register("D2", "/api/visual/asset/use-project-image", use_project_image,
                    methods=("POST",))
    router.register("D2", "/api/visual/macro/media/video-settings", video_settings,
                    methods=("POST",))
    router.register("D2", "/api/visual/series", series_list)
    router.register("D2", "/api/visual/series/convert", series_convert,
                    methods=("POST",))
    router.register("D2", "/api/visual/series/settings", series_settings,
                    methods=("POST",))
    router.register("D2", "/api/visual/series/delete", series_delete,
                    methods=("POST",))
    router.register("D2", "/api/visual/series/restore", series_restore,
                    methods=("POST",))
    for suffix, handler in (("create", series_episode_create),
                            ("update", series_episode_update),
                            ("delete", series_episode_delete)):
        router.register("D2", f"/api/visual/series/episode/{suffix}", handler,
                        methods=("POST",))
