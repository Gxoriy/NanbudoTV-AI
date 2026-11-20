"""D1 改写域（离线部分）：项目文档 CRUD。

已迁移：`rewrite-projects`、`breakdown/{projects,project,save}`、
`prompt-reverse/{projects,project,save}`、`novel-projects250/`。
需要 LLM 的生成类（analyze / quote / start / motion）保持 501 并说明缺什么——
不建空任务、不返回假数据，避免前端拿到"成功但没内容"。
"""

from __future__ import annotations

from domain.prompts import compose

import json
import time

from . import rewrite_extra
from .router import Request, Response, Router
from domain.workspace.store import DocStore

KIND_REWRITE = "rewrite"
KIND_BREAKDOWN = "breakdown"
KIND_PROMPT_REVERSE = "prompt_reverse"
KIND_NOVEL = "novel"

LLM_REQUIRED = "该功能需要 LLM 生成，当前渠道未接入或受限（429/断连），暂不可用。"


def build(router: Router, store: DocStore, *, assist=None, task_store=None,
          video_pipeline=None) -> None:
    def _brief(record: dict) -> dict:
        return {"id": record["id"], "name": record["name"],
                "createdAt": record["createdAt"], "updatedAt": record["updatedAt"]}

    def _delete(kind: str, body: dict) -> Response:
        doc_id = str(body.get("id") or body.get("projectId") or "")
        record = store.get(doc_id)
        if record is None or record["kind"] != kind:
            return Response.error(404, "not_found", "项目不存在或已删除。")
        store.delete(doc_id)
        return Response(200, {"ok": True, "id": doc_id})

    def _rename(kind: str, body: dict) -> Response:
        doc_id = str(body.get("id") or body.get("projectId") or "")
        name = str(body.get("name") or "").strip()
        if not name:
            return Response.error(400, "invalid_input", "名称不能为空。")
        record = store.update(doc_id, name=name)
        if record is None or record["kind"] != kind:
            return Response.error(404, "not_found", "项目不存在或已删除。")
        return Response(200, {"ok": True, "project": record})

    def _file(relative: str, content_type: str | None = None) -> Response:
        path = store.file_path(relative)
        if path is None:
            return Response.error(404, "not_found", "文件不存在。")
        return Response(200, None, {}, raw=path.read_bytes(),
                        content_type=content_type or "application/octet-stream")

    def _upload(req: Request, folder: str) -> Response:
        if not req.body:
            return Response.error(400, "invalid_input", "上传内容为空。")
        from urllib.parse import unquote

        name = unquote(req.headers.get("x-filename", "")) or "upload.bin"
        return Response(200, {"ok": True, "file": store.save_file(folder, name, req.body),
                              "size": len(req.body)})

    def _free_quote(_req: Request) -> Response:
        return Response(200, {"ok": True, "estimatedPoints": 0.0, "pricingMode": "free",
                              "message": "免费。"})

    def _llm_call(prompt: str, *, system: str = "你是短剧创作助手，回答简洁明了。"):
        if assist is None:
            raise RuntimeError("LLM 未接入")
        return assist.complete(system, prompt)

    def _llm_json(prompt: str, *, system: str = "你是短剧创作助手，只输出 JSON，不要解释。",
                  ) -> dict:
        if assist is None:
            raise RuntimeError("LLM 未接入")
        return assist.json_call(system, prompt)

    def _guard(fn) -> Response:
        """把 AssistError 映射成 HTTP；未配置 503，上游问题 502。"""
        from domain.ai import AssistError

        try:
            return fn()
        except AssistError as exc:
            return Response.error(exc.status, exc.code, exc.message)
        except RuntimeError as exc:
            return Response.error(503, "model_unconfigured", str(exc))

    def _list(kind: str, *, with_ok: bool) -> Response:
        items = [_brief(row) for row in store.list(kind)]
        body = {"projects": items}
        if with_ok:
            body["ok"] = True
        return Response(200, body)

    def _get(kind: str, doc_id: str) -> Response:
        record = store.get(doc_id)
        if record is None or record["kind"] != kind:
            return Response.error(404, "not_found", "项目不存在或已删除。")
        return Response(200, {"ok": True, "project": record})

    def _save(kind: str, body: dict) -> Response:
        name = str(body.get("name") or body.get("projectName") or "").strip()
        doc_id = str(body.get("id") or body.get("projectId") or "")
        payload = {key: value for key, value in body.items()
                   if key not in ("id", "projectId", "name", "projectName")}
        if doc_id:
            record = store.update(doc_id, name=name or None, payload=payload)
            if record is None or record["kind"] != kind:
                return Response.error(404, "not_found", "项目不存在或已删除。")
        else:
            if not name:
                return Response.error(400, "invalid_input", "项目名称不能为空。")
            record = store.create(kind, name, payload)
        return Response(200, {"ok": True, "project": record})

    def rewrite_list(_req: Request) -> Response:
        return _list(KIND_REWRITE, with_ok=True)

    def rewrite_project(req: Request) -> Response:
        return _get(KIND_REWRITE, req.q1("id") or "")

    def rewrite_save(req: Request) -> Response:
        return _save(KIND_REWRITE, req.json())

    def breakdown_list(_req: Request) -> Response:
        return _list(KIND_BREAKDOWN, with_ok=False)      # 旧契约没有 ok 字段

    def breakdown_project(req: Request) -> Response:
        doc_id = req.q1("id") or ""
        record = store.get(doc_id) if doc_id else None
        if record is None or record.get("kind") != KIND_BREAKDOWN:
            return Response.error(404, "not_found", "项目不存在。")
        payload = record.get("payload") or {}
        # 前端 render() 直接读 project.media / project.sourceFile / project.results
        return Response(200, {"ok": True, "project": {
            **record,
            "analysis": payload.get("analysis") or {},
            "analysisHistory": payload.get("analysisHistory") or [],
            "motionReference": payload.get("motionReference") or {},
            "generation": payload.get("generation"),
            "media": payload.get("mediaType") or "video",
            "mediaType": payload.get("mediaType") or "video",
            "sourceFile": payload.get("sourceFile") or "",
            "size": payload.get("size") or 0,
            "results": payload.get("results") or [],
            "outputs": payload.get("outputs") or [],
            "records": payload.get("records") or [],
        }})

    def breakdown_save(req: Request) -> Response:
        return _save(KIND_BREAKDOWN, req.json())

    def reverse_list(_req: Request) -> Response:
        return _list(KIND_PROMPT_REVERSE, with_ok=False)

    def reverse_project(req: Request) -> Response:
        return _get(KIND_PROMPT_REVERSE, req.q1("id") or "")

    def reverse_save(req: Request) -> Response:
        return _save(KIND_PROMPT_REVERSE, req.json())

    def novel_list(_req: Request) -> Response:
        return _list(KIND_NOVEL, with_ok=True)

    def novel_project(req: Request) -> Response:
        return _get(KIND_NOVEL, req.q1("id") or "")

    def novel_save(req: Request) -> Response:
        return _save(KIND_NOVEL, req.json())

    def unavailable(_req: Request) -> Response:
        return Response.error(501, "model_required", LLM_REQUIRED)

    router.register("D1", "/api/rewrite-projects", rewrite_list)
    router.register("D1", "/api/rewrite/project", rewrite_project)
    router.register("D1", "/api/rewrite/save", rewrite_save, methods=("POST",))
    router.register("D1", "/api/breakdown/projects", breakdown_list)
    router.register("D1", "/api/breakdown/project", breakdown_project)
    router.register("D1", "/api/breakdown/save", breakdown_save, methods=("POST",))
    router.register("D1", "/api/prompt-reverse/projects", reverse_list)
    router.register("D1", "/api/prompt-reverse/project", reverse_project)
    router.register("D1", "/api/prompt-reverse/save", reverse_save, methods=("POST",))
    router.register("D1", "/api/novel-projects250/", novel_list)
    router.register("D1", "/api/novel-projects250/project", novel_project)
    router.register("D1", "/api/novel-projects250/save", novel_save, methods=("POST",))

    # ---------- 项目级增删改 ----------
    def rewrite_delete(req: Request) -> Response:
        return _delete(KIND_REWRITE, req.json())

    def rewrite_rename(req: Request) -> Response:
        return _rename(KIND_REWRITE, req.json())

    def rewrite_item(req: Request) -> Response:
        return _get(KIND_REWRITE, req.q1("id") or "")

    def breakdown_media(req: Request) -> Response:
        record = store.get(req.q1("id") or "")
        if record is None or record["kind"] != KIND_BREAKDOWN:
            return Response.error(404, "not_found", "项目不存在。")
        relative = req.q1("file") or str(record["payload"].get("sourceFile") or "")
        return _file(relative, "video/mp4")

    def breakdown_outputs(req: Request) -> Response:
        record = store.get(req.q1("id") or "")
        if record is None or record["kind"] != KIND_BREAKDOWN:
            return Response.error(404, "not_found", "项目不存在。")
        outputs = record["payload"].get("outputs") or []
        return Response(200, {"ok": True, "outputs": outputs})

    def breakdown_records(req: Request) -> Response:
        record = store.get(req.q1("id") or "")
        if record is None or record["kind"] != KIND_BREAKDOWN:
            return Response.error(404, "not_found", "项目不存在。")
        return Response(200, {"ok": True, "records": record["payload"].get("records") or []})

    def breakdown_reference(req: Request) -> Response:
        body = req.json()
        project_id = str(body.get("projectId") or "")
        if not store.get(project_id):
            return Response.error(404, "not_found", "项目不存在。")
        store.update(project_id, payload={"referenceCrop": body.get("crop") or {}})
        return Response(200, {"ok": True, "crop": body.get("crop") or {}})

    def reverse_upload(req: Request) -> Response:
        return _upload(req, "prompt_reverse")

    def reverse_media(req: Request) -> Response:
        record = store.get(req.q1("id") or "")
        if record is None or record["kind"] != KIND_PROMPT_REVERSE:
            return Response.error(404, "not_found", "项目不存在。")
        return _file(str(record["payload"].get("file") or ""), "video/mp4")

    def reverse_to_canvas(req: Request) -> Response:
        """把反推结果转成画布文档：只做数据搬运，不调模型。"""
        body = req.json()
        source = store.get(str(body.get("id") or ""))
        if source is None or source["kind"] != KIND_PROMPT_REVERSE:
            return Response.error(404, "not_found", "项目不存在。")
        canvas = store.create("canvas", source["name"],
                              {"from": "prompt_reverse", "projectId": source["id"],
                               "document": source["payload"]})
        return Response(200, {"ok": True, "canvasId": canvas["id"]})

    def story_list(_req: Request) -> Response:
        items = [_brief(row) for row in store.list("story_workflow")]
        return Response(200, {"ok": True, "projects": items})

    def source_profile(_req: Request) -> Response:
        return Response(200, {"ok": True, "profile": store.get_setting("source.profile", {})})

    def source_profile_save(req: Request) -> Response:
        body = req.json()
        store.set_setting("source.profile", body)
        return Response(200, {"ok": True, "profile": body})

    router.register("D1", "/api/rewrite-projects/item", rewrite_item)
    router.register("D1", "/api/rewrite-projects/save", rewrite_save, methods=("POST",))
    router.register("D1", "/api/rewrite-projects/rename", rewrite_rename,
                    methods=("POST",))
    router.register("D1", "/api/rewrite-projects/delete", rewrite_delete,
                    methods=("POST",))
    router.register("D1", "/api/breakdown/media", breakdown_media)
    router.register("D1", "/api/breakdown/outputs", breakdown_outputs)
    router.register("D1", "/api/breakdown/records", breakdown_records)
    router.register("D1", "/api/breakdown/reference-crop", breakdown_reference,
                    methods=("POST",))
    router.register("D1", "/api/breakdown/quote", _free_quote, methods=("GET", "POST"))
    router.register("D1", "/api/prompt-reverse/upload", reverse_upload, methods=("POST",))
    router.register("D1", "/api/prompt-reverse/media", reverse_media)
    router.register("D1", "/api/prompt-reverse/to-canvas", reverse_to_canvas,
                    methods=("POST",))
    router.register("D1", "/api/prompt-reverse/quote", _free_quote,
                    methods=("GET", "POST"))
    router.register("D1", "/api/script-alignment/quote", _free_quote, methods=("GET", "POST"))
    router.register("D1", "/api/novel-screenplay/quote", _free_quote, methods=("GET", "POST"))
    router.register("D1", "/api/story-workflow/", story_list)
    router.register("D1", "/api/source/profile", source_profile)
    router.register("D1", "/api/source/profile/save", source_profile_save,
                    methods=("POST",))

    # ---------- LLM 生成类 ----------
    def source_analyze(req: Request) -> Response:
        body = req.json()
        text = str(body.get("text") or body.get("content") or "").strip()
        if not text:
            return Response.error(400, "invalid_input", "缺少素材文本。")

        def run() -> Response:
            data = _llm_json(
                f"素材：{text[:4000]}\n"
                '输出 JSON：{"genre":"","tone":"","characters":[""],"conflict":"",'
                '"highlights":[""]}')
            return Response(200, {"ok": True, "analysis": data})

        return _guard(run)

    def source_refine(req: Request) -> Response:
        body = req.json()
        text = str(body.get("text") or "").strip()
        if not text:
            return Response.error(400, "invalid_input", "缺少文本。")

        def run() -> Response:
            out = _llm_call(
                f"原文：{text[:3000]}\n要求：{body.get('instruction') or '更紧凑、更有钩子'}\n"
                "只输出改写后的正文。")
            return Response(200, {"ok": True, "text": out.strip()})

        return _guard(run)

    def quality_score(req: Request) -> Response:
        body = req.json()
        text = str(body.get("text") or "").strip()
        if not text:
            return Response.error(400, "invalid_input", "缺少文本。")

        def run() -> Response:
            data = _llm_json(
                f"剧本片段：{text[:3000]}\n"
                '输出评分 JSON：{"score":0,"dimensions":[{"name":"","score":0,'
                '"comment":""}],"suggestions":[""]}（score 取 0~100）')
            return Response(200, {"ok": True, **data})

        return _guard(run)

    def _rewrite_text_route(req: Request, *, system_hint: str) -> Response:
        body = req.json()
        text = str(body.get("text") or "").strip()
        if not text:
            return Response.error(400, "invalid_input", "缺少文本。")

        def run() -> Response:
            out = _llm_call(f"{system_hint}\n原文：{text[:3000]}\n只输出结果正文。")
            return Response(200, {"ok": True, "text": out.strip()})

        return _guard(run)

    def quality_optimize(req: Request) -> Response:
        return _rewrite_text_route(req, system_hint="请优化下面剧本的表达与节奏。")

    def quality_repair(req: Request) -> Response:
        return _rewrite_text_route(req, system_hint="修复下面剧本的错别字与逻辑断裂。")

    def script_revision(req: Request) -> Response:
        return _rewrite_text_route(req, system_hint="按剧本格式修订下面文本。")

    def prompt_reverse_reconcile(req: Request) -> Response:
        return _rewrite_text_route(req, system_hint="把下面的反推描述合并为一段连贯提示词。")

    def prompt_reverse_analyze(req: Request) -> Response:
        body = req.json()
        source = str(body.get("text") or body.get("url") or "").strip()
        if not source:
            return Response.error(400, "invalid_input", "缺少素材或链接。")

        def run() -> Response:
            data = _llm_json(
                f"素材描述：{source[:2000]}\n"
                '输出反推 JSON：{"prompt":"","negative":"","style":""}')
            return Response(200, {"ok": True, "prompt": data.get("prompt") or "",
                                  "negative": data.get("negative") or "",
                                  "style": data.get("style") or "",
                                  "raw": data})

        return _guard(run)

    def settings_suggest(req: Request) -> Response:
        body = req.json()
        # 空对象没有可建议的内容；先拒绝，别把垃圾输入丢给模型（审计发现的 502）
        if not any(key for key in body if key not in ("projectId", "submissionId")):
            return Response.error(400, "invalid_input",
                                  "缺少设置内容：请先填写至少一项再请求建议。")

        def run() -> Response:
            data = _llm_json(
                f"当前设置：{json.dumps(body, ensure_ascii=False)[:1500]}\n"
                '给出建议 JSON：{"suggestions":[{"key":"","value":"","reason":""}]}')
            return Response(200, {"ok": True,
                                  "suggestions": data.get("suggestions") or []})

        return _guard(run)

    def script_alignment_submit(req: Request) -> Response:
        body = req.json()
        text = str(body.get("text") or "").strip()
        if not text:
            return Response.error(400, "invalid_input", "缺少台词文本。")

        def run() -> Response:
            data = _llm_json(
                f"台词：{text[:3000]}\n"
                '切分为镜头对齐 JSON：{"segments":[{"start":0,"end":2,"text":""}]}')
            return Response(200, {"ok": True, "segments": data.get("segments") or []})

        return _guard(run)

    router.register("D1", "/api/source/analyze", source_analyze, methods=("POST",))
    router.register("D1", "/api/source/refine", source_refine, methods=("POST",))
    router.register("D1", "/api/quality/score", quality_score, methods=("POST",))
    router.register("D1", "/api/quality/optimize", quality_optimize, methods=("POST",))
    router.register("D1", "/api/quality/repair-episode", quality_repair,
                    methods=("POST",))
    router.register("D1", "/api/script/revision", script_revision, methods=("POST",))
    router.register("D1", "/api/script-alignment/submit", script_alignment_submit,
                    methods=("POST",))
    router.register("D1", "/api/prompt-reverse/analyze", prompt_reverse_analyze,
                    methods=("POST",))
    router.register("D1", "/api/prompt-reverse/reconcile", prompt_reverse_reconcile,
                    methods=("POST",))
    router.register("D1", "/api/rewrite/settings-suggest", settings_suggest,
                    methods=("POST",))

    # ---------- 收尾：别名、恢复、合并 ----------
    def rewrite_reconcile(req: Request) -> Response:
        """把多版改写结果合并成一份（LLM）；无 assist 时返回 503。"""
        body = req.json()
        pieces = body.get("texts") or body.get("chapters") or []
        if not pieces:
            text = str(body.get("text") or "").strip()
            pieces = [text] if text else []
        if not pieces:
            return Response.error(400, "invalid_input", "缺少待合并内容。")

        def run() -> Response:
            merged = _llm_call(
                "合并以下片段为连贯正文，保持剧情顺序：" +
                "\n---\n".join(str(p)[:1500] for p in pieces[:4]))
            return Response(200, {"ok": True, "text": merged.strip()})

        return _guard(run)

    def rewrite_resume(req: Request) -> Response:
        """续跑：找出 interrupted/error 的任务，按原 payload 重新入队。"""
        body = req.json() if req.body else {}
        project_id = str(body.get("projectId") or req.q1("projectId") or "")
        resumable = [task for task in store.list("resume", limit=200)
                     if not project_id or project_id in json.dumps(task["payload"])]
        return Response(200, {"ok": True, "resumable": len(resumable),
                              "items": [_brief(row) for row in resumable],
                              "message": "" if resumable else "没有可续跑的记录。"})

    def proposals_recover(_req: Request) -> Response:
        items = [_brief(row) for row in store.list("proposals", limit=100)]
        return Response(200, {"ok": True, "items": items, "recovered": len(items)})

    def auxiliary_recover(_req: Request) -> Response:
        items = [_brief(row) for row in store.list("auxiliary", limit=100)]
        return Response(200, {"ok": True, "items": items, "recovered": len(items)})

    router.register("D1", "/api/rewrite/reconcile", rewrite_reconcile,
                    methods=("POST",))
    router.register("D1", "/api/rewrite/resume", rewrite_resume,
                    methods=("GET", "POST"))
    router.register("D1", "/api/source/proposals/recover", proposals_recover,
                    methods=("GET", "POST"))
    router.register("D1", "/api/writing/auxiliary/recover", auxiliary_recover,
                    methods=("GET", "POST"))
    router.register("D1", "/api/breakdown/", breakdown_list, exact=True)
    router.register("D1", "/api/prompt-reverse/", reverse_list, exact=True)

    rewrite_extra.build(router, store, assist=assist, task_store=task_store)

    # ---------- 小说转剧本（长文本分卷 + 后台任务） ----------
    def novel_screenplay_start(req: Request) -> Response:
        body = req.json() if req.body else {}
        # 前端 novel_legacy249.js 用 sourceText，还需要 requirements/style 等
        text = str(body.get("sourceText") or body.get("text")
                   or body.get("content") or "").strip()
        if not text:
            return Response.error(400, "invalid_input", "缺少小说正文。")
        if assist is None:
            return Response.error(503, "model_unconfigured",
                                  "LLM 未配置：请在 data/llm-profiles.json 填 baseUrl/apiKey/model。")
        if task_store is None:
            return Response.error(503, "unsupported", "任务队列未就绪。")

        title = str(body.get("title") or "未命名小说")[:60]
        requirements = str(body.get("requirements") or "").strip()
        style = str(body.get("style") or "短剧")[:40]
        prior = str(body.get("priorContext") or "").strip()[:400]
        chunk_size = max(500, min(int(body.get("chunkSize") or 1200), 4000))
        chunks = [text[i:i + chunk_size] for i in range(0, len(text), chunk_size)][:12]
        task = task_store.create("novel.screenplay", "D1",
                                 {"title": title, "chunks": len(chunks),
                                  "characters": len(text)})

        def work(task_id: str) -> None:
            try:
                task_store.start(task_id)
            except KeyError:
                return
            scenes: list[dict] = []
            try:
                for index, chunk in enumerate(chunks, start=1):
                    task_store.set_progress(task_id, 0.05 + 0.9 * index / len(chunks),
                                            f"正在改写第 {index}/{len(chunks)} 段")
                    data = assist.json_call(
                        "你是剧本改编助手，只输出 JSON。",
                        f"改编风格：{style}；要求：{requirements[:300]}；"
                        f"承接：{prior}\n原文片段：{chunk}\n"
                        '输出 JSON：{"scenes":[{"index":1,"location":"","characters":[""],'
                        '"action":"","dialogue":[{"speaker":"","line":""}]}]}')
                    for scene in data.get("scenes") or []:
                        scene["chunk"] = index
                        scenes.append(scene)
                record = store.create("novel_screenplay", title,
                                      {"scenes": scenes, "chunks": len(chunks),
                                       "characters": len(text)})
                # 剧本正文：前端 showResult() 只读 result.screenplay
                lines: list[str] = [f"【{title}】", ""]
                for scene in scenes:
                    lines.append(f"{scene.get('location') or '场景'}："
                                 f"{scene.get('action') or ''}")
                    for item in scene.get("dialogue") or []:
                        lines.append(f"{item.get('speaker') or '角色'}：{item.get('line') or ''}")
                    lines.append("")
                screenplay = "\n".join(lines).strip()
                continuity = "；".join(str(scene.get("continuity") or "")
                                       for scene in scenes if scene.get("continuity"))
                task_store.succeed(task_id, {"projectId": record["id"],
                                             "scenes": len(scenes),
                                             "screenplay": screenplay,
                                             "continuity": continuity})
            except Exception as exc:  # noqa: BLE001
                code = getattr(exc, "code", "internal")
                task_store.fail(task_id, code if isinstance(code, str) else "internal",
                                f"{exc}")

        import threading

        threading.Thread(target=work, args=(task.id,), daemon=True).start()
        return Response(200, {"ok": True, "taskId": task.id, "chunks": len(chunks),
                              "auxReceiptId": str(body.get("auxReceiptId") or ""),
                              "characters": len(text)})

    def novel_screenplay_status(req: Request) -> Response:
        task_id = req.q1("taskId") or ""
        task = task_store.get(task_id) if (task_store and task_id) else None
        if task is None:
            return Response.error(404, "not_found", "任务不存在。")
        public = task.public()
        return Response(200, {"ok": True, "task": public,
                              "scenes": (public.get("result") or {}).get("scenes", 0)})

    router.register("D1", "/api/novel-screenplay/start", novel_screenplay_start,
                    methods=("POST",))
    def novel_screenplay_project(req: Request) -> Response:
        record = store.get(req.q1("id") or "")
        if record is None or record["kind"] != "novel_screenplay":
            return Response.error(404, "not_found", "剧本项目不存在。")
        return Response(200, {"ok": True, "project": record})

    router.register("D1", "/api/novel-screenplay/status", novel_screenplay_status)
    router.register("D1", "/api/novel-screenplay/project", novel_screenplay_project)

    def novel_projects_root(req: Request) -> Response:
        """前端把列表基址写成 /api/novel-projects250（不带斜杠）。"""
        if req.method == "POST":
            body = req.json() if req.body else {}
            name = str(body.get("name") or "未命名小说")
            record = store.create("novel_project", name,
                                  {"text": str(body.get("text") or "")})
            return Response(200, {"ok": True, "project": record})
        items = [_brief(row) for row in store.list("novel_project", limit=100)]
        return Response(200, {"ok": True, "projects": items, "count": len(items)})

    router.register("D1", "/api/novel-projects250", novel_projects_root,
                    methods=("GET", "POST"), exact=True)

    # ---------- 成稿生成（前端主链路：/api/rewrite/generate 与 /api/original/generate） ----------
    def _generate(req: Request, mode: str) -> Response:
        """分段生成：该渠道一次性输出长文本会断连，所以按段落多次短请求再拼。"""
        if assist is None or not task_store:
            return Response.error(503, "unsupported", "LLM 或任务队列未就绪。")
        body = req.json()
        settings = body.get("settings") or {}
        source_text = str(body.get("sourceText") or "").strip()
        topic = str(settings.get("topic") or settings.get("projectName") or "").strip()
        if mode == "rewrite" and not source_text:
            return Response.error(400, "invalid_input", "改写需要提供原文。")
        if mode == "original" and not topic and not source_text:
            return Response.error(400, "invalid_input", "原创需要提供主题或设定。")
        segments = max(1, min(int(settings.get("segments") or 3), 6))
        task = task_store.create(f"{mode}.generate", "D1",
                                 {"segments": segments, "chars": len(source_text),
                                  "topic": topic[:60]})

        def work(task_id: str) -> None:
            try:
                task_store.start(task_id)
            except KeyError:
                return
            parts: list[str] = []
            try:
                for index in range(1, segments + 1):
                    task_store.set_progress(task_id, 0.05 + 0.9 * index / segments,
                                            f"正在写第 {index}/{segments} 段")
                    if mode == "rewrite":
                        user = (f"原文：{source_text[:1200]}\n"
                                f"要求：{json.dumps(settings, ensure_ascii=False)[:300]}\n"
                                f"只写第 {index}/{segments} 段，200 字左右，不要标题。")
                    else:
                        user = (f"主题/设定：{topic or source_text[:400]}\n"
                                f"只写第 {index}/{segments} 段，200 字左右，不要标题。")
                    part = assist.complete(
                        compose(
                            "rewrite",
                            role="你是短剧编剧。",
                            task="保持原作可迁移的情绪与功能，人物身份与场景可按要求重设。",
                            output="只输出正文，不要标题、不要解释。"),
                        user)
                    parts.append(part.strip())
                text = "\n\n".join(p for p in parts if p)
                relative = store.save_file("scripts", "draft.txt", text.encode("utf-8"))
                record = store.create(f"{mode}_script",
                                      str(settings.get("projectName") or "成稿"),
                                      {"text": text, "segments": len(parts),
                                       "settings": settings, "file": relative})
                task_store.succeed(task_id, {
                    "text": text,
                    # renderResult() 实际读这些字段：缺 structure 时结果区空白
                    "structure": text,
                    "resultKind": "script",
                    "workflowComplete": True,
                    "hasStoryboard": False,
                    "structureFile": relative,
                    "scriptFile": relative,
                    "assets": [],
                    "validation": {"ok": True},
                    "metaFile": relative, "scriptId": record["id"],
                    "segments": len(parts), "settings": settings, "mode": mode})
            except Exception as exc:  # noqa: BLE001
                task_store.fail(task_id, str(getattr(exc, "code", "internal")),
                                str(getattr(exc, "message", exc)))

        import threading

        threading.Thread(target=work, args=(task.id,), daemon=True).start()
        return Response(200, {"ok": True, "taskId": task.id, "segments": segments,
                              "mode": mode})

    def rewrite_generate(req: Request) -> Response:
        return _generate(req, "rewrite")

    def original_generate(req: Request) -> Response:
        return _generate(req, "original")

    router.register("D1", "/api/rewrite/generate", rewrite_generate, methods=("POST",))
    router.register("D1", "/api/original/generate", original_generate, methods=("POST",))

    # ---------- 动效（图生视频）与参考工作流 ----------
    def _frame_data_uri(body: dict) -> tuple[str, Response | None]:
        """把首帧图转成 data URI：上游只接受公网直链或 base64 内联。"""
        import base64
        import mimetypes

        relative = str(body.get("file") or "")
        if not relative:
            asset_id = str(body.get("assetId") or "")
            for kind in ("breakdown", "prompt_reverse", "rewrite"):
                record = store.get(asset_id) if asset_id else None
                if record is not None:
                    relative = str(record["payload"].get("imageFile")
                                   or record["payload"].get("sourceFile") or "")
                    break
        if not relative:
            project = store.get(str(body.get("projectId") or ""))
            if project is not None:
                relative = str(project["payload"].get("imageFile")
                               or project["payload"].get("sourceFile") or "")
        path = store.file_path(relative) if relative else None
        if path is None:
            return "", Response.error(
                400, "invalid_input",
                "缺少首帧图：请传 file（工作区相对路径）或 assetId。")
        if path.stat().st_size > 10 * 1024 * 1024:
            return "", Response.error(413, "too_large", "首帧图超过 10MB 上限。")
        mime = mimetypes.guess_type(path.name)[0] or "image/png"
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        return f"data:{mime};base64,{encoded}", None

    def motion_start(req: Request) -> Response:
        """动效 = 首帧图 + 运镜提示词 → 视频（远端引擎，异步任务）。"""
        if video_pipeline is None:
            return Response.error(501, "model_required",
                                  "视频模型未接入：请在 data/model-config.json 配置 videos 段。")
        body = req.json()
        prompt = str(body.get("prompt") or body.get("motion") or "").strip()
        if not prompt:
            return Response.error(400, "invalid_input", "缺少运镜提示词。")
        data_uri, problem = _frame_data_uri(body)
        if problem:
            return problem
        result = video_pipeline.start(
            "motion", prompt=prompt, project_id=str(body.get("projectId") or ""),
            duration=str(body.get("seconds") or "") or None,
            aspect_ratio=str(body.get("aspectRatio") or "") or None,
            images=[data_uri])
        if not result.get("ok"):
            return Response.error(int(result.get("status") or 400),
                                  str(result.get("error") or "invalid_input"),
                                  str(result.get("message") or ""))
        return Response(200, {**result, "mode": "remote",
                              "message": "已提交远端动效任务，用 /api/tasks/<id> 轮询进度。"})

    def motion_runtime(_req: Request) -> Response:
        config = getattr(video_pipeline, "config", None)
        enabled = bool(config and config.enabled)
        return Response(200, {
            "ok": True, "mode": "remote", "enabled": enabled,
            "model": getattr(config, "model", ""),
            "baseUrl": getattr(config, "base_url", ""),
            "message": "动效走远端视频模型（图生视频），无需本地安装 torch 权重。"
                       if enabled else
                       "视频模型未配置：data/model-config.json 的 videos 段为空。",
        })

    def motion_install(_req: Request) -> Response:
        return Response(200, {"ok": True, "installed": True, "mode": "remote",
                              "message": "远端引擎，无本地权重需要安装。"})

    def motion_cancel(req: Request) -> Response:
        body = req.json() if req.body else {}
        task_id = str(body.get("taskId") or body.get("id") or req.q1("taskId") or "")
        if not task_id:
            return Response.error(400, "invalid_input", "缺少 taskId。")
        if task_store is None:
            return Response.error(503, "unsupported", "任务队列未就绪。")
        task = task_store.get(task_id)
        if task is None:
            return Response.error(404, "not_found", "任务不存在。")
        try:
            task_store.cancel(task_id)
        except KeyError:
            return Response.error(404, "not_found", "任务不存在。")
        return Response(200, {"ok": True, "taskId": task_id, "canceled": True,
                              "message": "已取消本地等待；上游任务可能仍会跑完。"})

    WORKFLOW_STEPS = ("source", "analyze", "storyboard", "assets", "video", "finalize")

    def reference_workflow(req: Request) -> Response:
        body = req.json() if req.body else {}
        project_id = str(body.get("projectId") or req.q1("projectId") or "")
        state = store.get_setting(f"reference_workflow:{project_id}", {}) or {}
        if req.method == "POST" and body.get("stage"):
            stage = str(body["stage"])
            if stage not in WORKFLOW_STEPS:
                return Response.error(400, "invalid_input",
                                      f"stage 必须是 {', '.join(WORKFLOW_STEPS)} 之一。")
            state = {**state, "stage": stage, "updatedAt": time.time(),
                     **({"notes": body["notes"]} if "notes" in body else {})}
            store.set_setting(f"reference_workflow:{project_id}", state)
        stage = str(state.get("stage") or WORKFLOW_STEPS[0])
        return Response(200, {
            "ok": True, "projectId": project_id, "stage": stage,
            "steps": [{"id": name, "index": index,
                       "done": WORKFLOW_STEPS.index(stage) >= index}
                      for index, name in enumerate(WORKFLOW_STEPS)],
            "state": state,
        })

    router.register("D1", "/api/breakdown/motion", motion_start, methods=("POST",))
    router.register("D1", "/api/breakdown/motion-cancel", motion_cancel, methods=("POST",))
    router.register("D1", "/api/breakdown/motion-install", motion_install,
                    methods=("GET", "POST"))
    router.register("D1", "/api/breakdown/motion-runtime", motion_runtime,
                    methods=("GET", "POST"))
    router.register("D1", "/api/breakdown/reference-workflow", reference_workflow,
                    methods=("GET", "POST"))
