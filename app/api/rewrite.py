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


def build(router: Router, store: DocStore) -> None:
    def _brief(record: dict) -> dict:
        return {"id": record["id"], "name": record["name"],
                "createdAt": record["createdAt"], "updatedAt": record["updatedAt"]}

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

    for path in ("/api/breakdown/quote", "/api/breakdown/motion",
                 "/api/breakdown/motion-cancel", "/api/breakdown/motion-install",
                 "/api/breakdown/motion-runtime", "/api/breakdown/reference-workflow",
                 "/api/prompt-reverse/analyze", "/api/prompt-reverse/quote",
                 "/api/prompt-reverse/reconcile", "/api/novel-screenplay/start",
                 "/api/novel-screenplay/quote", "/api/original/recommend",
                 "/api/original/field-optimize"):
        router.register("D1", path, unavailable, methods=("GET", "POST"))
