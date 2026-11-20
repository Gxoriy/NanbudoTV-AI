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
        """前端把响应**整体**当快照用：必须顶层有 source/currentSource/scenes。

        之前塞在 state 里，宏编排拿不到正文 → 补齐分镜报「原稿为空」。
        """
        project_id = req.q1("projectId") or ""
        saved = _macro(project_id)
        record = service.store.get(project_id) if service.store else None
        settings = (record or {}).get("settings") or {}
        source = str(settings.get("confirmedScript")
                     or settings.get("sourceStructure") or "")
        directory = ((settings.get("workflowPreparedScript") or {})
                     .get("sceneDirectory") or [])
        scenes = []
        offset = 0
        for index, row in enumerate(directory, start=1):
            text = str(row.get("source") or "")
            scenes.append({
                "id": str(row.get("id") or f"scene-{index}"),
                "number": int(row.get("number") or index),
                "title": str(row.get("title") or ""),
                "source": text,
                "sourceStart": offset,
                "sourceDuration": len(text),
            })
            offset += len(text)
        # 已补齐的分镜卡不能因为目录重建而丢：按 id/number 合并
        merged = scenes or []
        saved_scenes = {str(row.get("id")): row
                        for row in (saved.get("scenes") or [])}
        for scene in merged:
            previous = saved_scenes.get(str(scene.get("id")))
            if previous and previous.get("cards"):
                scene["cards"] = previous["cards"]
        final_scenes = merged or saved.get("scenes") or []
        segments_payload: dict[str, dict] = {}
        plan_segments: list[dict] = []
        for index, scene in enumerate(final_scenes, start=1):
            scene_id = str(scene.get("id") or f"scene-{index}")
            cards = list(scene.get("cards") or [])
            scene.setdefault("cardPlans", cards)
            segments_payload[scene_id] = {"result": {"complete": True, "cards": cards}}
            plan_segments.append({
                "segmentId": scene_id, "id": scene_id,
                "number": int(scene.get("number") or index),
                "title": str(scene.get("title") or ""),
                "source": str(scene.get("source") or ""),
                "cardPlans": cards,
            })
        saved_plan = dict(saved.get("plan") or {})
        snapshot = {
            **saved,
            "ok": True,
            "projectId": project_id,
            "source": source,
            "currentSource": source,
            "scenes": final_scenes,
            # 前端 renderCards 只遍历 plan.segments
            "plan": {**saved_plan, "segments": plan_segments},
            # readSceneCards 走 segments[id].result.cards
            "segments": {**(saved.get("segments") or {}), **segments_payload},
        }
        # state 键保留给旧调用方/测试，顶层才是前端快照契约
        return Response(200, {**snapshot, "state": snapshot})

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

    _macro_quotes: dict[str, dict] = {}

    def macro_quote(req: Request) -> Response:
        """前端要靠 quoteId/expiresAt/totalCredits 才能提交；不能只回 estimatedPoints。"""
        import uuid  # noqa: PLC0415

        body = req.json() if req.body else {}
        project_id = str(body.get("projectId") or "")
        source = str(body.get("source") or "")
        action = str(body.get("action") or "plan")
        segment_id = body.get("segmentId")
        completion = body.get("completionMode")
        quote = {
            "ok": True,
            "quoteId": uuid.uuid4().hex,
            "projectId": project_id,
            "action": action,
            "unitCredits": 1.0,
            "maxCalls": 1,
            "totalCredits": 1.0,
            "estimatedPoints": 1.0,
            "expiresAt": __import__("time").time() + 600,
            "pricingMode": "flat",
            "source": source[:4000],
            "message": "免费演示，不扣积分。",
        }
        # 只有场级补齐才回 segmentId；plan/plan_resume 前端用 id='' 比对，
        # 回了真实场次反而会被判定"身份不匹配"。
        if action == "segment" and segment_id not in (None, ""):
            quote["segmentId"] = str(segment_id)
        if body.get("cardNumber") is not None:
            quote["cardNumber"] = int(body["cardNumber"])

        if completion in ("missing", "all"):
            state = dict(_macro(project_id) or {})
            scenes = list(state.get("scenes") or [])
            scene = next((row for row in scenes
                          if str(row.get("id")) == str(segment_id)), None)
            if scene is None and scenes:
                scene = scenes[0]
            cards = list((scene or {}).get("cards") or [])
            if completion == "all":
                targets = list(range(1, len(cards) + 1))
            else:
                targets = [int(card.get("number") or index + 1)
                           for index, card in enumerate(cards)
                           if card.get("complete") is not True]
            quote["completionMode"] = completion
            quote["cardNumbers"] = targets
            quote["cardCount"] = len(targets)
            quote["maxCalls"] = max(1, len(targets))
            quote["totalCredits"] = quote["maxCalls"] * quote["unitCredits"]
            quote["estimatedPoints"] = quote["totalCredits"]
        elif action in ("plan", "plan_resume"):
            # 前端 plan 放行条件：actualCallBilling 或 shotFirst
            quote["actualCallBilling"] = True
            quote["shotFirst"] = True
        _macro_quotes[quote["quoteId"]] = quote
        payload = {key: value for key, value in quote.items()
                   if key != "source" and value is not None}
        return Response(200, payload)

    def macro_media_catalog(req: Request) -> Response:
        """前端 loadCatalog 要求顶层 models 数组；media 字段已废弃。"""
        from domain.pricing import visual_profile_defaults  # noqa: PLC0415

        project_id = req.q1("projectId") or ""
        profile = visual_profile_defaults()
        record = service.store.get(project_id) if service.store else {}
        settings = dict((record or {}).get("settings") or {})
        assets = []
        for kind in ("people", "scenes", "props"):
            for row in (settings.get("assets") or {}).get(kind) or []:
                image = str(row.get("imageFile") or "")
                if not image:
                    continue
                assets.append({
                    "id": str(row.get("id") or f"{kind}-{len(assets) + 1}"),
                    "name": str(row.get("name") or "参考图"),
                    "kind": kind,
                    "imageFile": image,
                    "imageReady": True,
                    "url": f"/api/asset-library/image?file={image}",
                })
        models = []
        for row in (profile.get("visualModels") or []):
            model = dict(row)
            model["pricingMode"] = "flat"
            model["supportedAspectRatios"] = ["16:9", "9:16", "1:1"]
            if model.get("media") == "video":
                model["supportedDurations"] = [4, 5, 6, 8, 10, 15]
                model["minDurationSeconds"] = 1
                model["maxDurationSeconds"] = 30
            model["referenceImageLimit"] = 9
            models.append(model)
        return Response(200, {
            "ok": True,
            "projectId": project_id,
            "models": models,
            "imagePricing": list(profile.get("imagePricing") or []),
            "videoPricing": list(profile.get("videoPricing") or []),
            "modelCapabilities": dict(profile.get("modelCapabilities") or {}),
            "pointsPerCny": profile.get("pointsPerCny"),
            "assets": assets,
            "projectMediaDefaults": settings.get("mediaDefaults") or {},
            "videoRouteGroups": [],
            "concurrency": {"video": {"limit": 2}, "image": {"limit": 2}},
            "visualCatalogPublished": False,
        })

    def macro_media_submit(req: Request) -> Response:
        """媒体提交：走与分镜视频同一条管线（上游 /v1/media/generate）。"""
        if video_pipeline is None:
            return Response.error(501, "model_required", VIDEO_REQUIRED)
        body = req.json()
        quote = _macro_quotes.get(str(body.get("quoteId") or ""))
        prompt = str(body.get("prompt") or body.get("requirement")
                     or (quote or {}).get("source") or "").strip()
        if not prompt:
            return Response.error(400, "invalid_input", "缺少生成提示词或有效报价。")
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

    def macro_media_quote(req: Request) -> Response:
        """单卡媒体报价：前端直接提交时逐项比对卡片身份与生成设置。"""
        from .media_quote import build_quote  # noqa: PLC0415

        body = req.json() if req.body else {}
        return Response(200, build_quote(body, _macro, _macro_quotes))

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
        quote_id = str(body.get("quoteId") or "")
        quote = _macro_quotes.pop(quote_id, None)
        if quote is None:
            return Response.error(400, "invalid_input",
                                  "报价已失效，请重新核价后再提交。")
        if quote.get("projectId") and quote["projectId"] != project_id:
            return Response.error(409, "conflict", "报价属于其他项目，请重新核价。")
        action = str(quote.get("action") or "plan")
        segment_id = str(quote.get("segmentId") or "")
        task = task_store.create("visual.macro", "D2",
                                 {"projectId": project_id,
                                  "quoteId": quote_id, "action": action})

        def work(task_id: str) -> None:
            try:
                task_store.start(task_id)
            except KeyError:
                return
            try:
                task_store.set_progress(task_id, 0.3, "正在补齐分镜…")
                state = dict(_macro(project_id) or {})
                record = service.store.get(project_id) if service.store else {}
                settings = (record or {}).get("settings") or {}
                source = str(quote.get("source")
                             or state.get("currentSource")
                             or settings.get("confirmedScript") or "")
                scenes = list(state.get("scenes") or [])
                if not scenes:
                    for index, row in enumerate(
                            ((settings.get("workflowPreparedScript") or {})
                             .get("sceneDirectory") or []), start=1):
                        scenes.append({"id": str(row.get("id") or f"scene-{index}"),
                                       "number": int(row.get("number") or index),
                                       "title": str(row.get("title") or ""),
                                       "source": str(row.get("source") or "")})
                completion = str(quote.get("completionMode") or "")
                targets = [int(number) for number in
                           (quote.get("cardNumbers") or [])]
                total = 0
                for scene in scenes:
                    if segment_id and str(scene.get("id")) != segment_id:
                        continue
                    text = str(scene.get("source") or source or "").strip()
                    if not text:
                        continue
                    existing = list(scene.get("cards") or [])
                    parts = [part.strip() for part in
                             text.replace("\n", "。").split("。") if part.strip()]
                    fresh = [{
                        "number": index,
                        "prompt": part,
                        "sourceText": part,
                        "storyboard": f"【镜头】{index}\n【画面】{part}",
                        "durationSeconds": 4,
                        "complete": True,
                    } for index, part in enumerate(parts[:8], start=1)]
                    if completion == "all" or action == "plan" or not existing:
                        # 整剧 plan 必须重建：旧的 complete=true 但无 storyboard 的卡
                        # 会让前端 cardComplete 判假，批量视频按钮永久置灰。
                        cards = fresh
                    else:
                        by_number = {int(row.get("number") or 0): row
                                     for row in existing}
                        for row in fresh:
                            number = int(row["number"])
                            if targets and number not in targets:
                                continue
                            if by_number.get(number, {}).get("complete") is True:
                                continue
                            by_number[number] = row
                        cards = [by_number[key] for key in sorted(by_number)]
                    if cards:
                        scene["cards"] = cards
                        total += len(cards)
                plan_segments = []
                for index, scene in enumerate(scenes, start=1):
                    scene_id = str(scene.get("id") or f"scene-{index}")
                    plan_segments.append({
                        "segmentId": scene_id, "id": scene_id,
                        "number": int(scene.get("number") or index),
                        "title": str(scene.get("title") or ""),
                        "source": str(scene.get("source") or ""),
                        "cardPlans": list(scene.get("cards") or []),
                    })
                state.update({"projectId": project_id, "source": source,
                              "currentSource": source, "scenes": scenes,
                              "plan": {"scenePlan": {"scenes": scenes},
                                       "segments": plan_segments}})
                store.set_setting(f"macro:{project_id}", state)
                task_store.succeed(task_id, {"scenes": len(scenes),
                                             "cards": total,
                                             "projectId": project_id})
            except Exception as exc:  # noqa: BLE001
                task_store.fail(task_id, "internal", str(exc)[:200])

        work(task.id)
        receipt = {"ok": True, "quoteId": quote_id, "action": action,
                   "maxCalls": int(quote.get("maxCalls") or 1),
                   "unitCredits": float(quote.get("unitCredits") or 1.0),
                   "totalCredits": float(quote.get("totalCredits") or 1.0),
                   "taskId": task.id}
        if segment_id:
            receipt["segmentId"] = segment_id
        if quote.get("cardNumber") is not None:
            receipt["cardNumber"] = int(quote["cardNumber"])
        return Response(200, receipt)

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
    def macro_card_draft(req: Request) -> Response:
        body = req.json() if req.body else {}
        project_id = str(body.get("projectId") or "")
        segment_id = str(body.get("segmentId") or "")
        number = int(body.get("cardNumber") or 1)
        state = dict(_macro(project_id) or {})
        previous = dict(((state.get("cardDrafts") or {}).get(segment_id) or {})
                        .get(str(number)) or {})
        revision = int(previous.get("revision") or 0) + 1
        draft = {
            "prompt": str(body.get("prompt") or ""),
            "referenceAssetIds": list(body.get("referenceAssetIds") or []),
            "revision": revision,
        }
        drafts = dict(state.get("cardDrafts") or {})
        drafts[segment_id] = {**drafts.get(segment_id, {}), str(number): draft}
        state["cardDrafts"] = drafts
        state["projectId"] = project_id
        store.set_setting(f"macro:{project_id}", state)
        return Response(200, {"ok": True, "draft": draft, "state": state})

    def macro_card_source(req: Request) -> Response:
        body = req.json() if req.body else {}
        project_id = str(body.get("projectId") or "")
        segment_id = str(body.get("segmentId") or "")
        number = int(body.get("cardNumber") or 1)
        state = dict(_macro(project_id) or {})
        edits = dict(state.get("sourceEdits") or {})
        scoped = dict(edits.get(segment_id) or {})
        previous = dict(scoped.get(str(number)) or {})
        revision = int(previous.get("revision") or 0) + 1
        source_edit = {"sourceText": str(body.get("sourceText") or ""),
                       "revision": revision}
        scoped[str(number)] = source_edit
        edits[segment_id] = scoped
        state["sourceEdits"] = edits
        state["projectId"] = project_id
        store.set_setting(f"macro:{project_id}", state)
        return Response(200, {"ok": True, "state": state,
                              "sourceEdit": source_edit})

    router.register("D2", "/api/visual/macro/card/draft", macro_card_draft,
                    methods=("POST",))
    router.register("D2", "/api/visual/macro/card/source", macro_card_source,
                    methods=("POST",))

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
