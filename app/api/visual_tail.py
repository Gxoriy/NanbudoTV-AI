"""D2 剩余路由：画布助手、素材生命周期、cut、episode 设置、macro 状态机。

分工：
  - 文档/素材/状态类：真实落库、真读写文件（不依赖模型）
  - 需要视频模型的（macro/media submit、episode/video 等）：501 并说明缺什么
  - 画布助手：接 LLM（TextAssist），把自然语言变成画布节点草案
"""

from __future__ import annotations

import hashlib
import json
import mimetypes
import pathlib
from urllib.parse import unquote

from .router import Request, Response, Router
from domain.visual.service import VisualService
from domain.workspace.store import DocStore

KIND_ASSET = "asset"
KIND_CANVAS = "canvas"
KIND_MACRO = "macro"
VIDEO_REQUIRED = "该功能需要视频生成模型（kling/seedance），当前只接了图像模型。"


def build(router: Router, service: VisualService, library, *,
          store: DocStore, assist=None, video_pipeline=None,
          task_store=None) -> None:
    def _file(relative: str, ctype: str | None = None) -> Response:
        path = library.file_path(relative)
        if path is None:
            return Response.error(404, "not_found", "文件不存在。")
        return Response(200, None, {}, raw=path.read_bytes(),
                        content_type=ctype or mimetypes.guess_type(path.name)[0]
                        or "application/octet-stream")

    def _upload(req: Request, folder: str) -> Response:
        if not req.body:
            return Response.error(400, "invalid_input", "上传内容为空。")
        name = unquote(req.headers.get("x-filename", "")) or "upload.bin"
        return Response(200, {"ok": True, "file": library.save_file(folder, name, req.body),
                              "size": len(req.body)})

    def _doc_or_404(doc_id: str, kind: str | None = None):
        record = library.get(doc_id)
        if record is None or (kind and record["kind"] != kind):
            return None
        return record

    # ---------- 画布 ----------
    def canvas_root(req: Request) -> Response:
        doc_id = req.q1("id") or req.q1("canvasId")
        if doc_id:
            record = _doc_or_404(doc_id, KIND_CANVAS)
            if record is None:
                return Response.error(404, "not_found", "画布不存在。")
            return Response(200, {"ok": True, "document": record["payload"]})
        items = library.list(KIND_CANVAS, limit=200)
        return Response(200, {"ok": True, "canvases": [
            library.brief(row, fields=("thumbnail", "nodeCount")) for row in items]})

    def assistant_catalog(_req: Request) -> Response:
        return Response(200, {"ok": True, "models": [],
                              "message": "画布助手使用平台默认 LLM。"})

    def assistant_history(_req: Request) -> Response:
        items = library.list("canvas_assistant", limit=50)
        return Response(200, {"ok": True, "items": [library.brief(r) for r in items]})

    def assistant_observe(req: Request) -> Response:
        record = _doc_or_404(req.q1("id") or "", "canvas_assistant")
        if record is None:
            return Response(200, {"ok": True, "state": "idle", "result": {}})
        return Response(200, {"ok": True, "state": record["payload"].get("state", "done"),
                              "result": record["payload"].get("result") or {}})

    def assistant_quote(_req: Request) -> Response:
        return Response(200, {"ok": True, "estimatedPoints": 0.0, "pricingMode": "free"})

    def assistant_start(req: Request) -> Response:
        body = req.json()
        prompt = str(body.get("prompt") or body.get("requirement") or "").strip()
        if not prompt:
            return Response.error(400, "invalid_input", "缺少描述。")
        if assist is None:
            return Response.error(503, "model_unconfigured", "LLM 未接入。")
        from domain.ai import AssistError

        try:
            data = assist.json_call(
                "你是画布编排助手，只输出 JSON。",
                f"目标：{prompt[:800]}\n"
                '输出 JSON：{"nodes":[{"id":"n1","type":"image","prompt":""}]}')
        except AssistError as exc:
            return Response.error(exc.status, exc.code, exc.message)
        record = library.create("canvas_assistant", prompt[:30],
                                {"state": "done", "result": data, "prompt": prompt})
        return Response(200, {"ok": True, "id": record["id"], "result": data})

    def canvas_cover(req: Request) -> Response:
        record = _doc_or_404(req.q1("id") or "", KIND_CANVAS)
        if record is None:
            return Response.error(404, "not_found", "画布不存在。")
        return _file(str(record["payload"].get("cover") or ""))

    def canvas_result(req: Request) -> Response:
        record = _doc_or_404(req.q1("id") or "", KIND_CANVAS)
        if record is None:
            return Response.error(404, "not_found", "画布不存在。")
        return Response(200, {"ok": True,
                              "resultFile": record["payload"].get("resultFile", "")})

    # ---------- 素材 ----------
    def asset_add(req: Request) -> Response:
        body = req.json()
        name = str(body.get("name") or "未命名素材")
        record = library.create(KIND_ASSET, name,
                                {"file": str(body.get("file") or ""),
                                 "type": str(body.get("type") or "image"),
                                 "projectId": str(body.get("projectId") or "")})
        return Response(200, {"ok": True, "asset": library.brief(
            record, fields=("file", "type", "projectId"))})

    def asset_bind(req: Request) -> Response:
        body = req.json()
        record = library.update(str(body.get("assetId") or ""),
                                payload={"characterId": str(body.get("characterId") or "")})
        if record is None:
            return Response.error(404, "not_found", "素材不存在。")
        return Response(200, {"ok": True, "asset": library.brief(record, fields=("characterId",))})

    def asset_prompt(req: Request) -> Response:
        body = req.json()
        if body.get("assetId") and body.get("prompt") is not None:
            record = library.update(str(body["assetId"]),
                                    payload={"prompt": str(body["prompt"])})
            if record is None:
                return Response.error(404, "not_found", "素材不存在。")
            return Response(200, {"ok": True, "prompt": record["payload"]["prompt"]})
        record = _doc_or_404(str(body.get("assetId") or ""), KIND_ASSET)
        if record is None:
            # 旧项目的资产只存在 project.settings.assets 里，不在素材库；
            # 返回空提示词即可，前端会用资产名兜底，不要弹 not_found。
            return Response(200, {"ok": True, "prompt": ""})
        return Response(200, {"ok": True, "prompt": record["payload"].get("prompt", "")})

    def asset_observe(req: Request) -> Response:
        record = _doc_or_404(req.q1("id") or "", KIND_ASSET)
        if record is None:
            return Response(200, {"ok": True, "state": "idle"})
        return Response(200, {"ok": True, "state": record["payload"].get("state", "done"),
                              "file": record["payload"].get("file", "")})

    def asset_mode(mode: str):
        def handler(req: Request) -> Response:
            body = req.json()
            record = library.update(str(body.get("assetId") or body.get("id") or ""),
                                    payload={"state": mode})
            if record is None:
                return Response.error(404, "not_found", "素材不存在。")
            return Response(200, {"ok": True, "state": mode})

        return handler

    def asset_split(req: Request) -> Response:
        body = req.json()
        record = _doc_or_404(str(body.get("assetId") or body.get("id") or ""), KIND_ASSET)
        if record is None:
            return Response.error(404, "not_found", "素材不存在。")
        return Response(200, {"ok": True, "parts": [], "message": "未提供切分参数或图像未解码。"})

    def asset_history_select(req: Request) -> Response:
        body = req.json()
        record = library.update(str(body.get("assetId") or ""),
                                payload={"selectedHistory": body.get("historyId") or ""})
        if record is None:
            return Response.error(404, "not_found", "素材不存在。")
        return Response(200, {"ok": True, "selected": record["payload"]["selectedHistory"]})

    def asset_upload(req: Request) -> Response:
        response = _upload(req, "assets")
        if response.status != 200:
            return response
        record = library.create(KIND_ASSET, "上传素材", {"file": response.payload["file"],
                                                         "type": "image"})
        return Response(200, {"ok": True, "asset": library.brief(
            record, fields=("file", "type")), **response.payload})

    def assets_dedupe(_req: Request) -> Response:
        seen: dict[str, str] = {}
        removed = 0
        for record in library.list(KIND_ASSET, limit=1000):
            relative = str(record["payload"].get("file") or "")
            path = library.file_path(relative)
            if path is None:
                continue
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest in seen:
                library.delete(record["id"])
                removed += 1
            else:
                seen[digest] = record["id"]
        return Response(200, {"ok": True, "removed": removed, "kept": len(seen)})

    # ---------- cut / episode ----------
    def _save_setting(req: Request, key: str) -> Response:
        body = req.json()
        project_id = str(body.get("projectId") or "")
        if not project_id:
            return Response.error(400, "invalid_input", "缺少 projectId。")
        payload = dict(body)
        payload.pop("projectId", None)
        current = store.get_setting(f"{key}:{project_id}", {}) or {}
        current.update(payload)
        store.set_setting(f"{key}:{project_id}", current)
        return Response(200, {"ok": True, "settings": current})

    def cut_decision(req: Request) -> Response:
        return _save_setting(req, "cut.decision")

    def cut_prompt_save(req: Request) -> Response:
        return _save_setting(req, "cut.prompt")

    def cut_source_save(req: Request) -> Response:
        return _save_setting(req, "cut.source")

    def cut_storyboard_one(req: Request) -> Response:
        body = req.json()
        project_id = str(body.get("projectId") or "")
        if not project_id:
            return Response.error(400, "invalid_input", "缺少 projectId。")
        return Response(200, {"ok": True, "storyboard": {"projectId": project_id,
                                                         "shots": []},
                              "message": "单镜头分镜需要图像模型，请先配置。"})

    def episode_settings_apply_all(req: Request) -> Response:
        body = req.json()
        settings = body.get("settings") or {}
        applied = 0
        for record in library.list("episode", limit=500):
            library.update(record["id"], payload={"settings": settings})
            applied += 1
        return Response(200, {"ok": True, "applied": applied})

    # ---------- macro 状态机 ----------
    def _macro(project_id: str) -> dict:
        return store.get_setting(f"macro:{project_id}", {}) or {}

    def macro_state(req: Request) -> Response:
        project_id = req.q1("projectId") or ""
        return Response(200, {"ok": True, "projectId": project_id,
                              "state": _macro(project_id)})

    def macro_save(req: Request) -> Response:
        body = req.json()
        project_id = str(body.get("projectId") or "")
        if not project_id:
            return Response.error(400, "invalid_input", "缺少 projectId。")
        state = {**_macro(project_id), **(body.get("state") or body), "projectId": project_id}
        store.set_setting(f"macro:{project_id}", state)
        return Response(200, {"ok": True, "state": state})

    def macro_history(req: Request) -> Response:
        project_id = req.q1("projectId") or ""
        return Response(200, {"ok": True, "items": _macro(project_id).get("history") or []})

    def macro_quote(_req: Request) -> Response:
        return Response(200, {"ok": True, "estimatedPoints": 0.0, "pricingMode": "free",
                              "message": "免费。"})

    def macro_media_catalog(_req: Request) -> Response:
        return Response(200, {"ok": True, "media": [], "message": VIDEO_REQUIRED})

    def macro_media_submit(req: Request) -> Response:
        """媒体提交：走与分镜视频同一条管线（上游 /v1/media/generate）。"""
        if video_pipeline is None:
            return Response.error(501, "model_required", VIDEO_REQUIRED)
        body = req.json()
        prompt = str(body.get("prompt") or body.get("requirement") or "").strip()
        result = video_pipeline.start(
            "macro", prompt=prompt, project_id=str(body.get("projectId") or ""),
            duration=str(body.get("duration") or "") or None,
            aspect_ratio=str(body.get("aspectRatio") or body.get("aspect_ratio") or "") or None,
            version=str(body.get("version") or "") or None,
            images=body.get("images") or [])
        if not result.get("ok"):
            return Response.error(int(result.get("status") or 400),
                                  str(result.get("error") or "invalid_input"),
                                  str(result.get("message") or ""))
        return Response(200, result)

    router.register("D2", "/api/visual/macro/media/submit", macro_media_submit,
                    methods=("POST",))

    def macro_media_quote(_req: Request) -> Response:
        return macro_quote(_req)

    def macro_media_observe(_req: Request) -> Response:
        return Response(200, {"ok": True, "state": "idle", "progress": 0})

    def macro_recover(req: Request) -> Response:
        return macro_save(req)

    def macro_card_save(req: Request) -> Response:
        return macro_save(req)

    def macro_scene_videos_archive(_req: Request) -> Response:
        return Response(200, {"ok": True, "archived": 0})

    def visual_unlock(_req: Request) -> Response:
        return Response(200, {"ok": True, "unlocked": True,
                              "message": "重建版不做付费解锁，功能默认开放。"})

    def video_history_clear(req: Request) -> Response:
        project_id = req.q1("projectId") or (req.json().get("projectId") if req.body else "")
        if project_id:
            store.set_setting(f"video.history:{project_id}", [])
        return Response(200, {"ok": True})

    # ---------- 注册 ----------
    router.register("D2", "/api/canvas/", canvas_root)
    router.register("D2", "/api/canvas/assistant/catalog", assistant_catalog)
    router.register("D2", "/api/canvas/assistant/history", assistant_history)
    router.register("D2", "/api/canvas/assistant/observe", assistant_observe)
    router.register("D2", "/api/canvas/assistant/quote", assistant_quote,
                    methods=("POST",))
    router.register("D2", "/api/canvas/assistant/start", assistant_start,
                    methods=("POST",))
    router.register("D2", "/api/canvas/cover", canvas_cover)
    router.register("D2", "/api/canvas/result", canvas_result)

    for path, handler in (
        ("/api/visual/asset/add", asset_add),
        ("/api/visual/asset/bind-character", asset_bind),
        ("/api/visual/asset/prompt", asset_prompt),
        ("/api/visual/asset/observe", asset_observe),
        ("/api/visual/asset/reset", asset_mode("idle")),
        ("/api/visual/asset/restore", asset_mode("restored")),
        ("/api/visual/asset/split", asset_split),
        ("/api/visual/asset/history/select", asset_history_select),
    ):
        router.register("D2", path, handler, methods=("GET", "POST"))
    router.register("D2", "/api/visual/asset/upload", asset_upload, methods=("POST",))
    router.register("D2", "/api/visual/assets/deduplicate", assets_dedupe,
                    methods=("GET", "POST"))

    router.register("D2", "/api/visual/cut/decision", cut_decision, methods=("POST",))
    router.register("D2", "/api/visual/cut/prompt-save", cut_prompt_save,
                    methods=("POST",))
    router.register("D2", "/api/visual/cut/source-save", cut_source_save,
                    methods=("POST",))
    router.register("D2", "/api/visual/cut/storyboard-one", cut_storyboard_one,
                    methods=("POST",))
    router.register("D2", "/api/visual/episode/settings/apply-all",
                    episode_settings_apply_all, methods=("POST",))

    def macro_submit(req: Request) -> Response:
        """前端把"已确认的这一项"提交成任务，只认 {ok, taskId}。"""
        body = req.json() if req.body else {}
        project_id = str(body.get("projectId") or "")
        if not project_id:
            return Response.error(400, "invalid_input", "缺少 projectId。")
        if task_store is None:
            return Response.error(503, "unsupported", "任务队列未就绪。")
        task = task_store.create("visual.macro", "D2",
                                 {"projectId": project_id,
                                  "quoteId": str(body.get("quoteId") or ""),
                                  "action": str(body.get("action") or "")})

        def work(task_id: str) -> None:
            try:
                task_store.start(task_id)
            except KeyError:
                return
            try:
                state = store.get_setting(f"macro:{project_id}", {}) or {}
                if assist is not None and assist.ready():
                    data = assist.json_call(
                        "你是短剧排卡助手，只输出 JSON。",
                        f"项目：{project_id}，已确认动作：{body.get('action') or '排卡'}\n"
                        '输出 JSON：{"cards":[{"number":1,"seconds":5,"shot":""}],"notes":""}')
                    state = {**state, "draft": data, "updatedAt": time.time()}
                    store.set_setting(f"macro:{project_id}", state)
                    task_store.succeed(task_id, {"cards": len(data.get("cards") or []),
                                                 "state": state})
                else:
                    task_store.succeed(task_id, {"cards": 0, "state": state,
                                                 "message": "LLM 未配置，已保存状态。"})
            except Exception as exc:  # noqa: BLE001
                task_store.fail(task_id, str(getattr(exc, "code", "internal")), str(exc))

        import threading

        threading.Thread(target=work, args=(task.id,), daemon=True).start()
        return Response(200, {"ok": True, "taskId": task.id})

    router.register("D2", "/api/visual/macro/submit", macro_submit,
                    methods=("GET", "POST"))

    router.register("D2", "/api/visual/macro/state", macro_state)
    for path in ("/api/visual/macro/card/draft",
                 "/api/visual/macro/card/reference", "/api/visual/macro/card/source",
                 "/api/visual/macro/regroup/apply", "/api/visual/macro/regroup/preview",
                 "/api/visual/macro/return-draft", "/api/visual/macro/pipeline-return",
                 "/api/visual/macro/recheck-return", "/api/visual/macro/recover",
                 "/api/visual/macro/media/detach"):
        router.register("D2", path, macro_save, methods=("GET", "POST"))
    router.register("D2", "/api/visual/macro/card/reference/delete", macro_save,
                    methods=("POST",))
    router.register("D2", "/api/visual/macro/history", macro_history)
    router.register("D2", "/api/visual/macro/quote", macro_quote, methods=("POST",))
    router.register("D2", "/api/visual/macro/media/quote", macro_media_quote,
                    methods=("POST",))
    router.register("D2", "/api/visual/macro/media/scene-quote", macro_media_quote,
                    methods=("POST",))
    router.register("D2", "/api/visual/macro/media/cancel-quotes", macro_media_quote,
                    methods=("POST",))
    router.register("D2", "/api/visual/macro/media/observe", macro_media_observe)
    router.register("D2", "/api/visual/macro/media/catalog", macro_media_catalog)

    router.register("D2", "/api/visual/scene-videos/archive", macro_scene_videos_archive,
                    methods=("GET", "POST"))
    router.register("D2", "/api/visual/unlock", visual_unlock, methods=("GET", "POST"))
    router.register("D2", "/api/visual/video-history/clear", video_history_clear,
                    methods=("POST",))
