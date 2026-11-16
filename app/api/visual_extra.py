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


def build(router: Router, service: VisualService, library) -> None:
    store = library
    if store is None:
        return

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
        items = store.list(KIND_ASSET, limit=int(req.q1("limit", "200") or 200),
                           keyword=req.q1("q") or "")
        return Response(200, {"ok": True, "assets": [store.brief(
            row, fields=("file", "type", "projectId", "tags")) for row in items],
            "count": len(items)})

    def asset_add(req: Request) -> Response:
        body = req.json()
        record = store.create(KIND_ASSET, str(body.get("name") or "未命名素材"),
                              {"file": str(body.get("file") or ""),
                               "type": str(body.get("type") or "image"),
                               "projectId": str(body.get("projectId") or ""),
                               "tags": body.get("tags") or []})
        return Response(200, {"ok": True, "asset": store.brief(
            record, fields=("file", "type", "projectId"))})

    def asset_delete(req: Request) -> Response:
        body = req.json()
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
        record = store.get("profile:default")
        return Response(200, {"ok": True, "profile": record["payload"] if record else {}})

    def profile_save(req: Request) -> Response:
        body = req.json()
        record = store.update("profile:default", payload=body) or store.create(
            KIND_PROFILE, "default", body, doc_id="profile:default")
        return Response(200, {"ok": True, "profile": record["payload"]})

    def usage(_req: Request) -> Response:
        return Response(200, {"ok": True, "points": 0.0, "usedPoints": 0.0,
                              "remainingPoints": 0.0, "pricingMode": "free", "records": []})

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

    # ---------- 注册：需要模型（明确 501） ----------
    for path in ("/api/visual/project/source", "/api/visual/project/prepare",
                 "/api/visual/project/scenes", "/api/visual/asset/generate",
                 "/api/visual/assets/analyze", "/api/visual/assets/delete",
                 "/api/visual/cover/generate", "/api/visual/cut-storyboard",
                 "/api/visual/episode-cut", "/api/visual/script-storyboard",
                 "/api/visual/normalize", "/api/visual/plan",
                 "/api/visual/episode/frame", "/api/visual/episode/video",
                 "/api/visual/episode/video/observe", "/api/visual/episode/video/reset",
                 "/api/visual/episode/settings", "/api/visual/episode/state",
                 "/api/visual/episode/prompt", "/api/visual/episode/references",
                 "/api/visual/video-preview", "/api/visual/archive",
                 "/api/visual/download", "/api/visual/macro/state",
                 "/api/visual/macro/quote", "/api/visual/macro/submit"):
        router.register("D2", path, unavailable, methods=("GET", "POST"))
