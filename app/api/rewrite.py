"""D1 改写域（离线部分）：项目文档 CRUD。

已迁移：`rewrite-projects`、`breakdown/{projects,project,save}`、
`prompt-reverse/{projects,project,save}`、`novel-projects250/`。
需要 LLM 的生成类（analyze / quote / start / motion）保持 501 并说明缺什么——
不建空任务、不返回假数据，避免前端拿到"成功但没内容"。
"""

from __future__ import annotations

from .router import Request, Response, Router
from domain.workspace.store import DocStore

KIND_REWRITE = "rewrite"
KIND_BREAKDOWN = "breakdown"
KIND_PROMPT_REVERSE = "prompt_reverse"
KIND_NOVEL = "novel"

LLM_REQUIRED = "该功能需要 LLM 生成，当前渠道未接入或受限（429/断连），暂不可用。"


def build(router: Router, store: DocStore, *, assist=None) -> None:
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

    def _llm_call(prompt: str, *, system: str = "你是短剧创作助手，回答简洁。"):
        if assist is None:
            raise RuntimeError("LLM 未接入")
        return assist.complete(system, prompt)

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
        return _get(KIND_BREAKDOWN, req.q1("id") or "")

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
    router.register("D1", "/api/breakdown/quote", _free_quote, methods=("POST",))
    router.register("D1", "/api/prompt-reverse/upload", reverse_upload, methods=("POST",))
    router.register("D1", "/api/prompt-reverse/media", reverse_media)
    router.register("D1", "/api/prompt-reverse/to-canvas", reverse_to_canvas,
                    methods=("POST",))
    router.register("D1", "/api/prompt-reverse/quote", _free_quote, methods=("POST",))
    router.register("D1", "/api/script-alignment/quote", _free_quote, methods=("POST",))
    router.register("D1", "/api/novel-screenplay/quote", _free_quote, methods=("POST",))
    router.register("D1", "/api/story-workflow/", story_list)
    router.register("D1", "/api/source/profile", source_profile)
    router.register("D1", "/api/source/profile/save", source_profile_save,
                    methods=("POST",))

    for path in ("/api/breakdown/motion",
                 "/api/breakdown/motion-cancel", "/api/breakdown/motion-install",
                 "/api/breakdown/motion-runtime", "/api/breakdown/reference-workflow",
                 "/api/prompt-reverse/analyze",
                 "/api/prompt-reverse/reconcile", "/api/novel-screenplay/start",
                 "/api/original/recommend",
                 "/api/original/field-optimize"):
        router.register("D1", path, unavailable, methods=("GET", "POST"))
