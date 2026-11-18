"""视觉域剩余路由（离线部分）：画布、素材库、角色、偏好、自定义样式。

分两类：
  - 离线可做：文档/素材/角色的增删改查与文件服务，全部落 SQLite + 本地文件
  - 需要模型：分镜/出图/出视频/LLM 归一，统一 501 并说明缺什么，绝不假装成功

路由数量多但每个都很薄，真正的逻辑在 `domain/visual/library.py`（通用文档库）。
"""

from __future__ import annotations

import mimetypes
import pathlib
from urllib.parse import unquote

from .router import Request, Response, Router
from domain.visual.library import (
    KIND_ASSET, KIND_CANVAS, KIND_CHARACTER, KIND_PROFILE, KIND_STYLE,
)
from domain.visual.service import VisualService

# 旧前端用 remainingPoints<=0 判断积分不足，免费模式给一个足够大的余额
FREE_BALANCE = 1000000.0

MODEL_REQUIRED = "该功能需要图像/视频/LLM 模型，新内核尚未接入；文档与素材管理不受影响。"
MAX_UPLOAD = 64 * 1024 * 1024


def _file(path: pathlib.Path) -> Response:
    data = path.read_bytes()
    ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return Response(200, None, {}, raw=data, content_type=ctype)


def _upload(req: Request, store, folder: str) -> Response:
    if len(req.body) > MAX_UPLOAD:
        return Response.error(413, "too_large", "文件超过 64MB 上限。")
    filename = unquote(req.headers.get("x-filename", "")) or "upload.bin"
    if not req.body:
        return Response.error(400, "invalid_input", "上传内容为空。")
    relative = store.save_file(folder, filename, req.body)
    return Response(200, {"ok": True, "file": relative, "size": len(req.body)})


def build(router: Router, service: VisualService, library, *,
          images=None, task_store=None, transport=None, assist=None,
          videos=None, video_pipeline=None, assets_store=None) -> None:
    store = library
    if store is None:
        return

    import pathlib as _path
    import threading

    from domain.visual.assist import AssistError
    from infra.media.images import ImageConfig, ImageError, generate as gen_image
    from infra.media.videos import VideoConfig, VideoError
    from infra.media import videos as video_api

    image_config = images or ImageConfig()
    video_config = videos or VideoConfig()
    if video_pipeline is None:
        from domain.visual.video import VideoPipeline

        video_pipeline = VideoPipeline(library, task_store, video_config)

    def _run_image(task_id: str, kind: str, project_id: str, prompt: str,
                   extra: dict | None = None) -> None:
        if task_store is not None:
            try:
                task_store.start(task_id)
            except KeyError:
                return
        try:
            if task_store is not None:
                task_store.set_progress(task_id, 0.2, "正在生成图像…")
            data = gen_image(image_config, prompt, transport=transport)
            folder = "covers" if kind == "cover" else "assets"
            relative = store.save_file(folder, "gen.png", data)
            record = store.create(KIND_ASSET, prompt[:40] or "生成图",
                                  {"file": relative, "type": "image",
                                   "projectId": project_id, "kind": kind,
                                   "prompt": prompt, **(extra or {})})
            if kind == "cover" and project_id and service.store:
                service.store.update(project_id, thumbnail=relative)
            if task_store is not None:
                task_store.succeed(task_id, {"file": relative, "assetId": record["id"]})
        except ImageError as exc:
            if task_store is not None:
                task_store.fail(task_id, "network" if exc.code == "network" else "internal",
                                exc.message)
        except Exception as exc:  # noqa: BLE001
            if task_store is not None:
                task_store.fail(task_id, "internal", repr(exc))

    def _start_generation(req: Request, kind: str) -> Response:
        body = req.json()
        prompt = str(body.get("prompt") or body.get("requirement") or "").strip()
        project_id = str(body.get("projectId") or "")
        extra = {key: body[key] for key in ("sceneIndex", "shotId", "episode")
                 if key in body}
        if not prompt:
            return Response.error(400, "invalid_input", "提示词不能为空。")
        if not image_config.enabled:
            return Response.error(503, "model_unconfigured",
                                  "图像模型未配置：请在 data/model-config.json 填 "
                                  "baseUrl/apiKey/model（参考 OpenAI 兼容协议）。")
        if task_store is None:
            return Response.error(503, "unsupported", "任务队列未就绪。")
        task = task_store.create(f"visual.{kind}", "D2",
                                 {"projectId": project_id, "prompt": prompt[:200]})
        thread = threading.Thread(target=_run_image,
                                  args=(task.id, kind, project_id, prompt, extra),
                                  daemon=True)
        thread.start()
        if body.get("wait"):
            thread.join(timeout=300)
            done = task_store.get(task.id)
            return Response(200, {"ok": True, "taskId": task.id,
                                  "state": done.state if done else "unknown",
                                  "error": done.error_detail if done else ""})
        return Response(200, {"ok": True, "taskId": task.id})

    def cover_generate(req: Request) -> Response:
        return _start_generation(req, "cover")

    def asset_generate(req: Request) -> Response:
        return _start_generation(req, "asset")

    def episode_frame(req: Request) -> Response:
        """分镜单帧出图：与封面同一条生成链路，额外带上场景序号。"""
        return _start_generation(req, "frame")

    def _start_video(req: Request, kind: str) -> Response:
        """视频生成：建上游任务 → 后台轮询 → 落库；前端用现成 /api/tasks 轮询。"""
        body = req.json()
        prompt = str(body.get("prompt") or body.get("requirement") or "").strip()
        result = video_pipeline.start(
            kind, prompt=prompt, project_id=str(body.get("projectId") or ""),
            duration=str(body.get("duration") or "") or None,
            aspect_ratio=str(body.get("aspectRatio") or body.get("aspect_ratio") or "") or None,
            version=str(body.get("version") or "") or None,
            images=body.get("images") or [])
        if not result.get("ok"):
            return Response.error(int(result.get("status") or 400),
                                  str(result.get("error") or "invalid_input"),
                                  str(result.get("message") or ""))
        return Response(200, result)

    def episode_video(req: Request) -> Response:
        return _start_video(req, "video")

    def episode_video_observe(req: Request) -> Response:
        body = req.json() if req.body else {}
        task_id = str(body.get("taskId") or body.get("id") or "")
        public = video_pipeline.observe(task_id)
        if public is None:
            return Response.error(404, "not_found", "任务不存在。")
        return Response(200, {"ok": True, "task": public})

    def owner_of(req: Request) -> str:
        return (req.headers.get("x-device-code") or "").strip()[:64]

    # ---------- 画布 ----------
    def canvas_list(req: Request) -> Response:
        items = store.list(KIND_CANVAS, owner=owner_of(req) or None)
        return Response(200, {"ok": True, "canvases": [
            store.brief(row, fields=("thumbnail", "nodeCount")) for row in items]})

    def canvas_document(req: Request) -> Response:
        doc_id = req.q1("id") or req.q1("canvasId") or ""
        record = store.get(doc_id)
        if record is None or record["kind"] != KIND_CANVAS:
            return Response.error(404, "not_found", "画布不存在。")
        return Response(200, {"ok": True, "document": record["payload"],
                              "id": record["id"], "name": record["name"],
                              "updatedAt": record["updatedAt"]})

    def canvas_save(req: Request) -> Response:
        body = req.json()
        doc = body.get("document") or body.get("canvas") or {}
        if not isinstance(doc, dict):
            return Response.error(400, "invalid_input", "document 必须是对象。")
        doc_id = str(body.get("id") or "")
        name = str(body.get("name") or "未命名画布")
        record = store.update(doc_id, name=name, payload=doc) if doc_id else None
        if record is None:
            record = store.create(KIND_CANVAS, name, doc, owner=owner_of(req))
        return Response(200, {"ok": True, "id": record["id"], "name": record["name"],
                              "updatedAt": record["updatedAt"]})

    def canvas_create(req: Request) -> Response:
        body = req.json()
        record = store.create(KIND_CANVAS, str(body.get("name") or "未命名画布"),
                              body.get("document") or {}, owner=owner_of(req))
        return Response(200, {"ok": True, "id": record["id"], "name": record["name"]})

    def canvas_styles(_req: Request) -> Response:
        return Response(200, service.styles())

    def canvas_upload(req: Request) -> Response:
        return _upload(req, store, "canvas")

    def canvas_media(req: Request) -> Response:
        path = store.file_path(req.q1("file") or "")
        if path is None:
            return Response.error(404, "not_found", "文件不存在。")
        return _file(path)

    def canvas_status(_req: Request) -> Response:
        return Response(200, {"ok": True, "running": False, "nodeId": "", "progress": 0,
                              "message": "画布执行器尚未接入模型，当前仅支持编辑与保存。"})

    def canvas_quote(_req: Request) -> Response:
        return Response(200, {"ok": True, "estimatedPoints": 0.0, "pricingMode": "free",
                              "message": "免费。"})

    def canvas_saved(_req: Request) -> Response:
        items = store.list(KIND_CANVAS, limit=50)
        return Response(200, {"ok": True, "items": [store.brief(row) for row in items]})

    def canvas_assets(_req: Request) -> Response:
        items = store.list(KIND_ASSET, limit=200)
        return Response(200, {"ok": True, "assets": [store.brief(
            row, fields=("file", "type", "projectId")) for row in items]})

    # ---------- 素材库 ----------
    def asset_list(req: Request) -> Response:
        limit = int(req.q1("limit", "200") or 200)
        keyword = req.q1("q") or ""
        project_id = req.q1("projectId") or ""
        if assets_store is not None:
            rows = assets_store.list(project_id=project_id or None, q=keyword, limit=limit)
            return Response(200, {"ok": True,
                                  "assets": [assets_store.brief(row) for row in rows],
                                  "count": len(rows), "store": "assets"})
        items = store.list(KIND_ASSET, limit=limit, keyword=keyword)
        return Response(200, {"ok": True, "assets": [store.brief(
            row, fields=("file", "type", "projectId", "tags", "kind", "sceneIndex"))
            for row in items], "count": len(items)})

    def asset_add(req: Request) -> Response:
        body = req.json()
        if assets_store is not None:
            name = str(body.get("name") or "未命名素材")
            row = assets_store.add(
                name=name, file=str(body.get("file") or ""),
                kind=str(body.get("type") or body.get("kind") or "image"),
                project_id=str(body.get("projectId") or ""),
                meta={"type": str(body.get("type") or "image"),
                      "tags": body.get("tags") or []},
                aliases=body.get("aliases") or [])
            assets_store.ensure_project(str(body.get("projectId") or ""),
                                        str(body.get("projectName") or ""))
            return Response(200, {"ok": True, "asset": assets_store.brief(row)})
        record = store.create(KIND_ASSET, str(body.get("name") or "未命名素材"),
                              {"file": str(body.get("file") or ""),
                               "type": str(body.get("type") or "image"),
                               "projectId": str(body.get("projectId") or ""),
                               "tags": body.get("tags") or []})
        return Response(200, {"ok": True, "asset": store.brief(
            record, fields=("file", "type", "projectId"))})

    def asset_delete(req: Request) -> Response:
        body = req.json()
        if assets_store is not None:
            removed = assets_store.delete(str(body.get("id") or body.get("assetId") or ""))
            if not removed:
                return Response.error(404, "not_found", "素材不存在。")
            return Response(200, {"ok": True})
        removed = store.delete(str(body.get("id") or ""))
        if not removed:
            return Response.error(404, "not_found", "素材不存在。")
        return Response(200, {"ok": True})

    def asset_media(req: Request) -> Response:
        record = store.get(req.q1("id") or "")
        if record is None:
            return Response.error(404, "not_found", "素材不存在。")
        path = store.file_path(str(record["payload"].get("file") or ""))
        if path is None:
            return Response.error(404, "not_found", "文件不存在。")
        return _file(path)

    def asset_upload(req: Request) -> Response:
        response = _upload(req, store, "assets")
        if response.status != 200:
            return response
        data = response.payload
        record = store.create(KIND_ASSET, unquote(req.headers.get("x-filename", "素材")),
                              {"file": data["file"], "type": "image", "projectId": ""})
        return Response(200, {"ok": True, "asset": store.brief(
            record, fields=("file", "type")), **data})

    # ---------- 角色 ----------
    def characters_list(_req: Request) -> Response:
        items = store.list(KIND_CHARACTER)
        return Response(200, {"ok": True, "characters": [store.brief(
            row, fields=("file", "voiceId", "speakerName")) for row in items]})

    def characters_manage(req: Request) -> Response:
        body = req.json()
        name = str(body.get("name") or body.get("speakerName") or "").strip()
        doc_id = str(body.get("id") or "")
        payload = {key: body[key] for key in ("file", "voiceId", "speakerName", "prompt",
                                              "description", "tags") if key in body}
        if doc_id:
            record = store.update(doc_id, name=name or None, payload=payload)
            if record is None:
                return Response.error(404, "not_found", "角色不存在。")
        else:
            if not name:
                return Response.error(400, "invalid_input", "角色名称不能为空。")
            record = store.create(KIND_CHARACTER, name, payload)
        return Response(200, {"ok": True, "character": store.brief(
            record, fields=("file", "voiceId", "speakerName"))})

    def characters_upload(req: Request) -> Response:
        return _upload(req, store, "characters")

    def characters_media(req: Request) -> Response:
        record = store.get(req.q1("id") or "")
        if record is None:
            return Response.error(404, "not_found", "角色不存在。")
        path = store.file_path(str(record["payload"].get("file") or ""))
        if path is None:
            return Response.error(404, "not_found", "文件不存在。")
        return _file(path)

    def characters_quote(_req: Request) -> Response:
        return Response(200, {"ok": True, "estimatedPoints": 0.0, "pricingMode": "free"})

    def characters_empty(_req: Request) -> Response:
        return Response(200, {"ok": True, "items": [], "message": MODEL_REQUIRED})

    # ---------- 偏好 / 用量 / 模型 ----------
    def profile_get(_req: Request) -> Response:
        """默认档案必须带示例价格，否则前端 quote() 返回 null → 按钮"尚无有效价格"。"""
        from domain.pricing import visual_profile_defaults  # noqa: PLC0415

        record = store.get("profile:default")
        saved = dict(record["payload"]) if record else {}
        merged = {**visual_profile_defaults(), **saved}
        return Response(200, {"ok": True, "profile": merged})

    def profile_save(req: Request) -> Response:
        body = req.json()
        record = store.update("profile:default", payload=body) or store.create(
            KIND_PROFILE, "default", body, doc_id="profile:default")
        return Response(200, {"ok": True, "profile": record["payload"]})

    def usage(_req: Request) -> Response:
        """对外免费：余额给足，让前端解锁生成按钮；报价与实践扣费都是 0。"""
        return Response(200, {
            "ok": True, "points": FREE_BALANCE, "usedPoints": 0.0,
            "remainingPoints": FREE_BALANCE, "pricingMode": "free",
            "free": True, "records": [],
            "message": "免费使用，不扣积分。",
            # 前端 renderPointsUsage(data.usage) 从嵌套对象取余额；
            # 少了它余额会被算成 0.00，任何正价格都会显示"积分不足"。
            "usage": {"points": FREE_BALANCE, "usedPoints": 0.0,
                      "remainingPoints": FREE_BALANCE, "records": [], "orders": []},
        })

    def models(_req: Request) -> Response:
        return Response(200, {"ok": True, "models": [], "message": MODEL_REQUIRED})

    def live_quote(_req: Request) -> Response:
        return Response(200, {"ok": True, "estimatedPoints": 0.0, "pricingMode": "free",
                              "message": "全部免费。"})

    # ---------- 自定义样式 ----------
    def style_create(req: Request) -> Response:
        body = req.json()
        name = str(body.get("name") or "").strip()
        if not name:
            return Response.error(400, "invalid_input", "样式名称不能为空。")
        record = store.create(KIND_STYLE, name, body)
        return Response(200, {"ok": True, "style": store.brief(record)})

    def style_delete(req: Request) -> Response:
        body = req.json()
        removed = store.delete(str(body.get("id") or ""))
        if not removed:
            return Response.error(404, "not_found", "样式不存在。")
        return Response(200, {"ok": True})

    # ---------- 媒体 / 缩略图 ----------
    def project_media(req: Request) -> Response:
        project = service.store.get(req.q1("projectId") or "") if service.store else None
        if project is None:
            return Response.error(404, "not_found", "项目不存在。")
        relative = req.q1("file") or str(project["payload"].get("sourceFile") or "")
        path = store.file_path(relative)
        if path is None:
            return Response.error(404, "not_found", "文件不存在。")
        return _file(path)

    def project_thumbnail(req: Request) -> Response:
        response = _upload(req, store, "thumbnails")
        if response.status != 200:
            return response
        body = req.json() if req.body[:1] in (b"{", b"[") else {}
        project_id = str(body.get("projectId") or req.q1("projectId") or "")
        if project_id and service.store:
            service.store.update(project_id, thumbnail=response.payload["file"])
        return Response(200, {"ok": True, "thumbnail": response.payload["file"]})

    def unavailable(_req: Request) -> Response:
        return Response.error(501, "model_required", MODEL_REQUIRED)

    def _assist_call(req: Request, action: str) -> Response:
        if assist is None:
            return Response.error(503, "model_unconfigured", "LLM 未接入。")
        body = req.json()
        requirement = str(body.get("requirement") or body.get("prompt")
                          or body.get("text") or "")
        try:
            if action == "plan":
                shots = int(body.get("shots") or 6)
                return Response(200, assist.plan(requirement, shots=max(1, min(shots, 40))))
            return Response(200, assist.normalize(requirement))
        except AssistError as exc:
            return Response.error(exc.status, exc.code, exc.message)

    def plan(req: Request) -> Response:
        return _assist_call(req, "plan")

    def normalize(req: Request) -> Response:
        return _assist_call(req, "normalize")

    # ---------- 注册：离线可用 ----------
    router.register("D2", "/api/canvas/list", canvas_list)
    router.register("D2", "/api/canvas/document", canvas_document)
    router.register("D2", "/api/canvas/save", canvas_save, methods=("POST",))
    router.register("D2", "/api/canvas/create", canvas_create, methods=("POST",))
    router.register("D2", "/api/canvas/styles", canvas_styles)
    router.register("D2", "/api/canvas/upload", canvas_upload, methods=("POST",))
    router.register("D2", "/api/canvas/media", canvas_media)
    router.register("D2", "/api/canvas/run-status", canvas_status)
    router.register("D2", "/api/canvas/quote", canvas_quote)
    router.register("D2", "/api/canvas/saved", canvas_saved)
    router.register("D2", "/api/canvas/assets/", canvas_assets)
    router.register("D2", "/api/canvas/location", canvas_status)
    router.register("D2", "/api/canvas/reveal", canvas_status)
    router.register("D2", "/api/canvas/disconnect", canvas_status, methods=("POST",))

    router.register("D2", "/api/asset-library/", asset_list)
    router.register("D2", "/api/asset-library/add", asset_add, methods=("POST",))
    router.register("D2", "/api/asset-library/delete", asset_delete, methods=("POST",))
    router.register("D2", "/api/asset-library/media", asset_media)
    router.register("D2", "/api/asset-library/upload", asset_upload, methods=("POST",))

    router.register("D2", "/api/characters", characters_list)
    router.register("D2", "/api/characters/", characters_list)
    router.register("D2", "/api/characters/library", characters_list)
    router.register("D2", "/api/characters/manage", characters_manage, methods=("POST",))
    router.register("D2", "/api/characters/upload", characters_upload, methods=("POST",))
    router.register("D2", "/api/characters/media", characters_media)
    router.register("D2", "/api/characters/quote", characters_quote, methods=("POST",))
    router.register("D2", "/api/characters/hall", characters_empty)
    router.register("D2", "/api/characters/combine", characters_empty, methods=("POST",))
    router.register("D2", "/api/characters/image-models", characters_empty)

    router.register("D2", "/api/visual/profile", profile_get)
    router.register("D2", "/api/visual/profile/save", profile_save, methods=("POST",))
    router.register("D2", "/api/visual/usage", usage)
    router.register("D2", "/api/visual/points", usage)
    router.register("D2", "/api/visual/models", models)
    router.register("D2", "/api/visual/live-quote", live_quote, methods=("POST",))
    router.register("D2", "/api/visual/style/create", style_create, methods=("POST",))
    router.register("D2", "/api/visual/style/delete", style_delete, methods=("POST",))
    router.register("D2", "/api/visual/media", project_media)
    router.register("D2", "/api/visual/project-thumbnail", project_thumbnail, methods=("POST",))

    # ---------- 注册：LLM 辅助（分镜规划 / 需求归一） ----------
    router.register("D2", "/api/visual/plan", plan, methods=("GET", "POST"))
    router.register("D2", "/api/visual/normalize", normalize, methods=("GET", "POST"))

    # ---------- 注册：图像生成（已接入 OpenAI 兼容协议） ----------
    router.register("D2", "/api/visual/cover/generate", cover_generate,
                    methods=("GET", "POST"))
    router.register("D2", "/api/visual/episode/frame", episode_frame,
                    methods=("GET", "POST"))
    router.register("D2", "/api/visual/episode/video", episode_video,
                    methods=("GET", "POST"))
    router.register("D2", "/api/visual/episode/video/observe", episode_video_observe,
                    methods=("GET", "POST"))
    router.register("D2", "/api/visual/asset/generate", asset_generate,
                    methods=("GET", "POST"))

    # 分镜/剧集/成片这 16 条已由 visual_stage.py 真实实现；
    # macro 系列由 visual_tail.py 实现。这里不再注册兜底，避免同路径被 501 抢先命中。
