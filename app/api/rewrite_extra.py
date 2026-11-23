"""爆款拆解（breakdown）的上传/参考图/分析/生成/查询。

从 rewrite.py 拆出来：那个文件已接近门禁上限（800 行），而这一组路由自成一体
（都在 Kind=breakdown 的文档上操作），单独成模块更好维护。
"""

from __future__ import annotations

import json
import pathlib
import threading
import time
from typing import Any

from .router import Request, Response, Router
from domain.workspace.store import DocStore

KIND_BREAKDOWN = "breakdown"


def build(router: Router, store: DocStore, *, assist=None, task_store=None,
          video_pipeline=None, library=None) -> None:
    def _llm_json(prompt: str) -> dict:
        """写作辅助的 JSON 调用（rewrite.py 的 _llm_json 不在这个模块作用域）。"""
        if assist is None:
            raise RuntimeError("LLM 未就绪")
        return assist.json_call("你是短剧编剧，只返回一个合法 JSON 对象。", prompt)

    def _llm_call(prompt: str) -> str:
        if assist is None:
            raise RuntimeError("LLM 未就绪")
        return assist.complete("你是短剧编剧，只输出正文。", prompt)

    # ---------- 爆款拆解：上传/参考图/分析/生成/查询 ----------
    def _bd_project(project_id: str) -> dict | None:
        record = store.get(project_id)
        return record if record is not None and record["kind"] == KIND_BREAKDOWN else None

    def breakdown_upload(req: Request) -> Response:
        from urllib.parse import unquote

        if not req.body:
            return Response.error(400, "invalid_input", "上传内容为空。")
        name = unquote(req.headers.get("x-filename", "")) or "source.mp4"
        media = (req.headers.get("x-media-type") or "video").strip() or "video"
        relative = store.save_file("breakdown", name, req.body)
        record = store.create(KIND_BREAKDOWN, name,
                              {"sourceFile": relative, "mediaType": media,
                               "size": len(req.body), "outputs": [], "records": [],
                               "results": []})
        return Response(200, {"ok": True, "project": _bd_public(record)})

    def breakdown_reference_upload(req: Request) -> Response:
        from urllib.parse import unquote

        if not req.body:
            return Response.error(400, "invalid_input", "上传内容为空。")
        project_id = req.headers.get("x-project-id", "")
        project = _bd_project(project_id)
        if project is None:
            return Response.error(404, "not_found", "项目不存在。")
        name = unquote(req.headers.get("x-filename", "")) or "reference.png"
        relative = store.save_file("breakdown/reference", name, req.body)
        payload = {**project["payload"], "referenceFile": relative}
        updated = store.update(project_id, payload=payload)
        return Response(200, {"ok": True, "project": updated, "file": relative})

    def _bd_public(record: dict) -> dict:
        """前端读 project.media / project.sourceFile，这两个不在 payload 里就会像"没上传"。"""
        payload = record.get("payload") or {}
        analysis = dict(payload.get("analysis") or {})
        analysis.setdefault("elements", [])
        return {"id": record["id"], "name": record["name"],
                # 前端 render() 读 project.analysis（识别资产/生成按钮都依赖它）
                "analysis": analysis,
                "replacements": payload.get("replacements") or [],
                "analysisHistory": payload.get("analysisHistory") or [],
                "motionReference": payload.get("motionReference") or {},
                "generation": payload.get("generation"),
                "media": payload.get("mediaType") or "video",
                "mediaType": payload.get("mediaType") or "video",
                "sourceFile": payload.get("sourceFile") or "",
                "size": payload.get("size") or 0,
                "results": payload.get("results") or [],
                "records": payload.get("records") or [],
                "outputs": payload.get("outputs") or [],
                "deleted": bool(payload.get("deleted")),
                "payload": payload, "updatedAt": record.get("updatedAt")}

    def _append_bd_result(store, project_id: str, payload: dict,  # noqa: ANN001
                          data: dict, *, kind: str) -> None:
        """前端结果列表读 project.results（不是 outputs），没有文件就没有卡片。"""
        import json as _json  # noqa: PLC0415

        text = _json.dumps(data, ensure_ascii=False, indent=1)
        rel = store.save_file("breakdown", f"{project_id}-{kind}.json",
                              text.encode("utf-8"))
        results = list(payload.get("results") or [])
        results.append({"file": rel, "name": "拆解分析" if kind == "analysis"
                        else "创意分镜", "modelName": "GT-6 Sol · 默认",
                        "mode": "creative", "resolution": "文本结果",
                        "saved": False, "kind": kind,
                        "createdAt": time.time(), "deleted": False})
        store.update(project_id, payload={**payload, "analysis": data,
                                          "results": results})

    def _breakdown_task(req: Request, kind: str) -> Response:
        if assist is None:
            return Response.error(503, "model_unconfigured",
                                  "LLM 未配置：请在 data/llm-profiles.json 填 baseUrl/apiKey/model。")
        if task_store is None:
            return Response.error(503, "unsupported", "任务队列未就绪。")
        body = req.json() if req.body else {}
        project_id = str(body.get("projectId") or "")
        project = _bd_project(project_id)
        if project is None:
            return Response.error(404, "not_found", "项目不存在。")
        task = task_store.create(f"breakdown.{kind}", "D1",
                                 {"projectId": project_id})

        def work(task_id: str) -> None:
            try:
                task_store.start(task_id)
            except KeyError:
                return
            payload = project["payload"]
            hint = (f"素材：{payload.get('sourceFile')}"
                    f"（{payload.get('mediaType')}），项目：{project['name']}")
            try:
                if kind == "analyze":
                    from domain.ai import vision  # noqa: PLC0415

                    start = float(body.get("start") or 0)
                    limit = float(body.get("limit") or 15)
                    source_path = store.file_path(str(payload.get("sourceFile") or ""))
                    frames = vision.sample_frames(source_path, start, limit, 3) \
                        if source_path else []
                    spec = ('输出 JSON：{"hook":"","structure":[""],'
                            '"sellingPoints":[""],"shots":[{"start":0,'
                            '"end":2,"shot":""}],"elements":[{"id":"",'
                            '"name":"","kind":"person|object|scene","bbox":[]}]}')
                    prompt = (f"{hint}\n分析范围：第 {start:.0f} 秒起 "
                              f"{limit:.0f} 秒。请依据采样画面逐镜头描述，"
                              f"不要声称读到了未提供的音轨。\n{spec}")
                    try:
                        task_store.set_progress(task_id, 0.15,
                                            f"已抽取 {len(frames)} 帧，正在视觉分析")
                    except Exception:  # noqa: BLE001
                        pass
                    data: dict = {}
                    if frames:
                        import threading  # noqa: PLC0415

                        box: dict = {}

                        def run_vision() -> None:
                            try:
                                box["data"] = vision.analyze_frames(
                                    frames, prompt,
                                    profiles_path=pathlib.Path.cwd() / "data"
                                    / "llm-profiles.json")
                            except Exception:  # noqa: BLE001
                                box["data"] = {}

                        worker = threading.Thread(target=run_vision, daemon=True)
                        worker.start()
                        worker.join(timeout=60)
                        data = box.get("data") or {}
                    data = dict(data or {})
                    if not data.get("shots"):
                        step = limit / max(len(frames), 3)
                        data["shots"] = [
                            {"start": round(start + index * step, 1),
                             "end": round(start + (index + 1) * step, 1),
                             "shot": f"采样区间 {index + 1}：已抽取画面帧，"
                                     "请在拆解面板核对具体动作与字幕"}
                            for index in range(max(len(frames), 3))]
                    data.setdefault("hook", "已提取采样画面，开场钩子请核对首帧。")
                    data.setdefault("structure", ["按采样时间轴拆解叙事结构"])
                    data.setdefault("sellingPoints", [])
                    data.setdefault("elements", [])
                    data["performance"] = {
                        "analysisMode": str(body.get("analysisMode") or "detailed"),
                        "sampledFrames": len(frames),
                        "transmittedFrames": len(frames),
                        "sampledRange": [start, limit],
                    }
                    _append_bd_result(store, project_id, payload, data,
                                      kind="analysis")
                elif video_pipeline is not None:
                    analysis = dict(payload.get("analysis") or {})
                    hook = str(analysis.get("hook") or "短视频复刻")
                    points = "；".join(str(row) for row in
                                      (analysis.get("sellingPoints") or [])[:5])
                    shots = "；".join(str((row or {}).get("shot") or "")
                                     for row in (analysis.get("shots") or [])[:8])
                    prompt_parts = [f"复刻爆款创意：{hook}"]
                    if points:
                        prompt_parts.append("核心卖点：" + points)
                    if shots:
                        prompt_parts.append("镜头参考：" + shots)
                    if body.get("extra"):
                        prompt_parts.append("用户补充：" + str(body["extra"]))
                    prompt_text = "\n".join(prompt_parts)[:4000]

                    def on_done(task_id_: str, out: dict) -> None:
                        latest = store.get(project_id) or {}
                        current = dict(latest.get("payload") or payload)
                        results = list(current.get("results") or [])
                        results.append({
                            "file": out.get("file"), "name": "拆解复刻视频",
                            "modelName": str(body.get("model") or "视频模型"),
                            "mode": str(body.get("mode") or "creative"),
                            "resolution": str(body.get("resolution") or ""),
                            "mediaType": "video", "kind": "breakdown-video",
                            "videoFile": out.get("file"),
                            "upstreamTaskId": out.get("upstreamTaskId"),
                            "saved": False, "deleted": False,
                            "createdAt": time.time(),
                        })
                        current["results"] = results
                        store.update(project_id, payload=current)

                    image_files = []
                    for ref in (body.get("referenceFiles")
                                or body.get("referenceAssetIds") or []):
                        candidate = store.file_path(str(ref))
                        if candidate and candidate.exists():
                            image_files.append(str(candidate))
                    result = video_pipeline.start(
                        "breakdown", prompt=prompt_text, project_id=project_id,
                        duration=str(body.get("duration") or 5),
                        aspect_ratio=str(body.get("ratio") or "9:16"),
                        version=None,  # version 只接受 快速/标准，不是模型名
                        images=image_files, on_done=on_done)
                    video_task_id = str(result.get("taskId") or "")
                    try:
                        task_store.set_progress(task_id, 0.2,
                                                "视频任务已提交，等待上游生成")
                    except Exception:  # noqa: BLE001
                        pass
                    deadline = time.time() + 600
                    while video_task_id and time.time() < deadline:
                        inner = task_store.get(video_task_id)
                        state = str(getattr(inner, "state", ""))
                        if state in ("done", "error"):
                            break
                        time.sleep(1)
                    inner = task_store.get(video_task_id) if video_task_id else None
                    if inner is not None and str(getattr(inner, "state", "")) != "done":
                        reason = (getattr(inner, "error_detail", "")
                                  or getattr(inner, "error", "")
                                  or "上游视频任务失败")
                        raise RuntimeError("视频生成失败：" + str(reason)[:300])
                    data = {"videoTaskId": video_task_id,
                            "prompt": prompt_text,
                            "upstreamTaskId": result.get("upstreamTaskId")}
                else:
                    data = assist.json_call(
                        "你是短视频复刻编导，只输出 JSON。",
                        f"{hint}\n基于已有分析生成可拍分镜：\n"
                        '输出 JSON：{"shots":[{"index":1,"seconds":3,"shot":"",'
                        '"prompt":""}],"notes":""}')
                    _append_bd_result(store, project_id, payload, data,
                                      kind="storyboard")
                task_store.succeed(task_id, {"projectId": project_id,
                                             "kind": kind, "data": data,
                                             **({} if kind != "generate"
                                                else dict(data))})
            except Exception as exc:  # noqa: BLE001
                task_store.fail(task_id, str(getattr(exc, "code", "internal")), str(exc))

        import threading

        threading.Thread(target=work, args=(task.id,), daemon=True).start()
        return Response(200, {"ok": True, "taskId": task.id})

    def breakdown_analyze(req: Request) -> Response:
        return _breakdown_task(req, "analyze")

    def breakdown_generate(req: Request) -> Response:
        return _breakdown_task(req, "generate")

    def breakdown_observe(req: Request) -> Response:
        body = req.json() if req.body else {}
        project_id = str(body.get("projectId") or "")
        if task_store is None:
            return Response(200, {"ok": True, "state": "idle", "taskId": ""})
        latest = None
        for task in task_store.list(limit=100):
            if not str(task.kind).startswith("breakdown."):
                continue
            if project_id and (task.payload or {}).get("projectId") != project_id:
                continue
            latest = task
            break
        if latest is None:
            return Response(200, {"ok": True, "state": "idle", "taskId": "",
                                  "message": "没有可恢复的拆解任务。"})
        public = latest.public()
        return Response(200, {"ok": True, "taskId": latest.id,
                              "state": public.get("state"), "task": public})

    router.register("D1", "/api/breakdown/upload", breakdown_upload, methods=("POST",))
    router.register("D1", "/api/breakdown/reference", breakdown_reference_upload,
                    methods=("POST",))
    router.register("D1", "/api/breakdown/analyze", breakdown_analyze, methods=("POST",))
    router.register("D1", "/api/breakdown/generate", breakdown_generate, methods=("POST",))
    router.register("D1", "/api/breakdown/observe", breakdown_observe,
                    methods=("GET", "POST"))

    def _aux_task(kind: str, payload: dict, work) -> Response:
        """写作辅助统一入口：前端要 taskId + pollTask，不能同步返回。"""
        if assist is None or task_store is None:
            return Response.error(503, "unsupported", "LLM 或任务队列未就绪。")

        def runner(task_id: str) -> None:
            def safe(fn, *args, **kwargs):  # noqa: ANN001, ANN002, ANN003
                # 测试结束/服务关闭后不许再碰 sqlite 文件（否则临时目录删不掉）
                if getattr(task_store, "closed", False):
                    return None
                try:
                    return fn(*args, **kwargs)
                except Exception:  # noqa: BLE001
                    if getattr(task_store, "closed", False):
                        return None
                    raise

            try:
                safe(task_store.start, task_id)
            except KeyError:
                return
            try:
                safe(task_store.set_progress, task_id, 0.2, "正在生成…")
                result = work()
                safe(task_store.succeed, task_id, result)
            except Exception as exc:  # noqa: BLE001
                safe(task_store.fail, task_id,
                     str(getattr(exc, "code", "internal")),
                     str(getattr(exc, "message", exc)))

        task = task_store.create(f"rewrite.{kind}", "D1", {"kind": kind})
        import threading  # noqa: PLC0415

        threading.Thread(target=runner, args=(task.id,), daemon=True).start()
        return Response(200, {"ok": True, "taskId": task.id, "callId": task.id})

    def _stage_text(payload: dict) -> str:
        """前端字段很多：sourceText / text / settings[field] 都兼容。"""
        for key in ("sourceText", "text", "content", "value"):
            value = str(payload.get(key) or "").strip()
            if value:
                return value
        settings = payload.get("settings") or {}
        if isinstance(settings, dict):
            for key in ("originalTheme", "originalDirection", "field", "topic",
                        "originalPlotType", "sourceText"):
                value = str(settings.get(key) or "").strip()
                if value:
                    return value
        return ""

    def source_proposals(req: Request) -> Response:
        body = req.json() if req.body else {}
        text = _stage_text(body)
        if not text:
            return Response.error(400, "invalid_input", "缺少原剧本，请先保存原稿。")

        def work():
            data = _llm_json(
                f"原剧本：{text[:3000]}\n"
                '给出 3 条差异化换皮方向 JSON：'
                '{"proposals":[{"id":"A","title":"","hook":"","summary":"",'
                '"score":85,"reason":""}]}；score 为 0-100 的可拍性评分。')
            rows = data.get("proposals") or []
            for index, row in enumerate(rows):
                row["id"] = str(row.get("id") or "ABC"[index:index + 1])
                try:
                    row["score"] = max(0, min(100, int(float(row.get("score") or 78))))
                except (TypeError, ValueError):
                    row["score"] = 78
            return {"ok": True, "proposals": rows, "count": len(rows),
                    "recommendation": rows[0] if rows else {}}

        return _aux_task("source_proposals", body, work)

    def source_proposal_refine(req: Request) -> Response:
        body = req.json() if req.body else {}
        proposal = body.get("proposal") or {}
        instruction = str(body.get("instruction") or body.get("feedback") or "").strip()
        if not proposal:
            return Response.error(400, "invalid_input", "缺少 proposal。")

        def work():
            data = _llm_json(
                f"原方案：{json.dumps(proposal, ensure_ascii=False)[:1500]}\n"
                f"修改意见：{instruction or '加强冲突与钩子、降低重复风险'}\n"
                '输出改进后的 JSON：'
                '{"proposal":{"id":"","title":"","hook":"","summary":"","score":85}}')
            refined = dict(proposal)
            refined.update(data.get("proposal") or {})
            refined["id"] = str(proposal.get("id") or "A")
            return {"ok": True, "proposals": [refined], "proposal": refined,
                    "count": 1}

        return _aux_task("source_proposal_refine", body, work)

    def original_recommend(req: Request) -> Response:
        body = req.json() if req.body else {}
        settings = body.get("settings") or {}
        topic = _stage_text(body) or str(settings)[:1200]
        if not topic:
            return Response.error(400, "invalid_input", "缺少原创设定。")
        action = str(body.get("action") or "settings")

        def work():
            if action == "hot_types":
                data = _llm_json(
                    f"原创方向：{topic[:1200]}\n"
                    '输出热门题材 JSON：{"suggestions":[{"title":"","angle":""}]}')
                return {"ok": True, "suggestions": data.get("suggestions") or [],
                        "recommendation": {}}
            data = _llm_json(
                f"原创设定：{topic[:2000]}\n"
                "按现有字段名给出一整套原创设定 JSON："
                '{"recommendation":{"originalTheme":"","protagonistGender":"",'
                '"protagonistAge":"","storyEra":"","openingHook":"",'
                '"protagonistGoal":"","mainObstacle":"","emotionalCore":"",'
                '"originalDirection":"","originalEnding":""}}')
            return {"ok": True, "recommendation": data.get("recommendation") or {},
                    "suggestions": []}

        return _aux_task("original_recommend", body, work)

    def original_field_optimize(req: Request) -> Response:
        body = req.json() if req.body else {}
        field = str(body.get("field") or "").strip()
        settings = body.get("settings") or {}
        value = (str(body.get("text") or body.get("value") or "").strip()
                 or (str(settings.get(field) or "").strip() if isinstance(settings, dict) else ""))
        if not value:
            return Response.error(400, "invalid_input", "缺少要优化的内容。")

        def work():
            out = _llm_call(
                f"字段：{field or '设定'}\n原内容：{value[:1500]}\n"
                "请优化，只输出优化后的内容。")
            return {"ok": True, "field": field, "text": out.strip()}

        return _aux_task("original_field_optimize", body, work)


    router.register("D1", "/api/source/proposals", source_proposals, methods=("POST",))
    router.register("D1", "/api/source/proposal-refine", source_proposal_refine,
                    methods=("POST",))
    router.register("D1", "/api/original/recommend", original_recommend,
                    methods=("POST",))
    router.register("D1", "/api/original/field-optimize", original_field_optimize,
                    methods=("POST",))
