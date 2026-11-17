"""爆款拆解（breakdown）的上传/参考图/分析/生成/查询。

从 rewrite.py 拆出来：那个文件已接近门禁上限（800 行），而这一组路由自成一体
（都在 Kind=breakdown 的文档上操作），单独成模块更好维护。
"""

from __future__ import annotations

import pathlib
import threading
import time
from typing import Any

from .router import Request, Response, Router
from domain.workspace.store import DocStore

KIND_BREAKDOWN = "breakdown"


def build(router: Router, store: DocStore, *, assist=None, task_store=None) -> None:
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
                               "size": len(req.body), "outputs": [], "records": []})
        return Response(200, {"ok": True, "project": record})

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
                    data = assist.json_call(
                        "你是爆款短视频拆解分析师，只输出 JSON。",
                        f"{hint}\n分析范围：第 {body.get('start', 0)} 秒起 "
                        f"{body.get('limit', 60)} 秒。\n"
                        '输出 JSON：{"hook":"","structure":[""],"sellingPoints":[""],'
                        '"shots":[{"start":0,"end":2,"shot":""}]}')
                    store.update(project_id, payload={**payload, "analysis": data})
                else:
                    data = assist.json_call(
                        "你是短视频复刻编导，只输出 JSON。",
                        f"{hint}\n基于已有分析生成可拍分镜：\n"
                        '输出 JSON：{"shots":[{"index":1,"seconds":3,"shot":"",'
                        '"prompt":""}],"notes":""}')
                    outputs = list(payload.get("outputs") or [])
                    outputs.append({"kind": "storyboard",
                                    "shots": data.get("shots") or [],
                                    "createdAt": time.time()})
                    store.update(project_id, payload={**payload, "outputs": outputs})
                task_store.succeed(task_id, {"projectId": project_id,
                                             "kind": kind, "data": data})
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


