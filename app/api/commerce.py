"""D5 电商 / 门店域：文档 CRUD、素材展示、免费报价。

生成类（宣传片、营销文案）依赖模型，保持 501 `model_required`；
项目、批次、工作台、上传、媒体读取全部本地实现，字段尽量对齐旧样本
（`api_ecommerce-showcase.json`：`{ok, cards:{image:[], video:[]}}`）。
"""

from __future__ import annotations

import mimetypes
from urllib.parse import unquote

from .router import Request, Response, Router
from domain.workspace.store import DocStore

KIND_ECOM = "ecommerce"
KIND_BATCH = "ecommerce_batch"
KIND_CARD = "ecommerce_card"
KIND_STORE = "store"
KIND_WORKBENCH = "workbench"

LLM_REQUIRED = "该功能需要 LLM/图像模型，当前未接入对应渠道；项目与素材管理不受影响。"
MAX_UPLOAD = 64 * 1024 * 1024


def build(router: Router, store: DocStore, *, assist=None) -> None:
    def _brief(record: dict) -> dict:
        return {"id": record["id"], "name": record["name"],
                "createdAt": record["createdAt"], "updatedAt": record["updatedAt"]}

    def _file(relative: str) -> Response:
        path = store.file_path(relative)
        if path is None:
            return Response.error(404, "not_found", "文件不存在。")
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        return Response(200, None, {}, raw=path.read_bytes(), content_type=ctype)

    def _upload(req: Request, folder: str) -> Response:
        if len(req.body) > MAX_UPLOAD:
            return Response.error(413, "too_large", "文件超过 64MB 上限。")
        if not req.body:
            return Response.error(400, "invalid_input", "上传内容为空。")
        name = unquote(req.headers.get("x-filename", "")) or "upload.bin"
        return Response(200, {"ok": True, "file": store.save_file(folder, name, req.body),
                              "size": len(req.body)})

    # ---------- 展示柜 ----------
    def showcase(_req: Request) -> Response:
        cards = {"image": [], "video": []}
        for record in store.list(KIND_CARD, limit=500):
            kind = str(record["payload"].get("type") or "image")
            bucket = cards.get(kind)
            if bucket is None:
                continue
            item = {"id": record["id"], "type": kind,
                    "url": f"/api/ecommerce-showcase-media?id={record['id']}"}
            if record["payload"].get("title"):
                item["title"] = record["payload"]["title"]
            bucket.append(item)
        return Response(200, {"ok": True, "cards": cards})

    def showcase_media(req: Request) -> Response:
        record = store.get(req.q1("id") or "")
        if record is None or record["kind"] != KIND_CARD:
            return Response.error(404, "not_found", "素材不存在。")
        return _file(str(record["payload"].get("file") or ""))

    # ---------- 电商项目 ----------
    def ecom_list(_req: Request) -> Response:
        return Response(200, {"ok": True, "projects": [_brief(r) for r in
                                                       store.list(KIND_ECOM)]})

    def ecom_save(req: Request) -> Response:
        body = req.json()
        doc_id = str(body.get("id") or "")
        name = str(body.get("name") or body.get("projectName") or "").strip()
        payload = {k: v for k, v in body.items() if k not in ("id", "name", "projectName")}
        if doc_id:
            record = store.update(doc_id, name=name or None, payload=payload)
            if record is None:
                return Response.error(404, "not_found", "项目不存在。")
        else:
            if not name:
                return Response.error(400, "invalid_input", "项目名称不能为空。")
            record = store.create(KIND_ECOM, name, payload)
        return Response(200, {"ok": True, "project": record})

    def batch_list(_req: Request) -> Response:
        return Response(200, {"ok": True, "batches": [_brief(r) for r in
                                                      store.list(KIND_BATCH)]})

    def batch_archive(req: Request) -> Response:
        body = req.json()
        doc_id = str(body.get("id") or body.get("batchId") or "")
        record = store.update(doc_id, payload={"archived": True})
        if record is None:
            return Response.error(404, "not_found", "批次不存在。")
        return Response(200, {"ok": True, "batch": _brief(record)})

    def workbench(_req: Request) -> Response:
        saved = store.get_setting("ecommerce.workbench", {}) or {}
        return Response(200, {"ok": True, "workbench": saved})

    def workbench_save(req: Request) -> Response:
        body = req.json()
        store.set_setting("ecommerce.workbench", body)
        return Response(200, {"ok": True, "workbench": body})

    def workbench_media(req: Request) -> Response:
        return _file(req.q1("file") or "")

    # ---------- 门店 ----------
    def store_list(_req: Request) -> Response:
        return Response(200, {"ok": True, "projects": [_brief(r) for r in
                                                       store.list(KIND_STORE)]})

    def store_create(req: Request) -> Response:
        body = req.json()
        name = str(body.get("name") or body.get("projectName") or "").strip()
        if not name:
            return Response.error(400, "invalid_input", "门店项目名称不能为空。")
        record = store.create(KIND_STORE, name, body)
        return Response(200, {"ok": True, "project": record})

    def store_project(req: Request) -> Response:
        record = store.get(req.q1("id") or "")
        if record is None or record["kind"] != KIND_STORE:
            return Response.error(404, "not_found", "项目不存在。")
        return Response(200, {"ok": True, "project": record})

    def store_save(req: Request) -> Response:
        body = req.json()
        doc_id = str(body.get("id") or body.get("projectId") or "")
        record = store.update(doc_id, name=str(body.get("name") or "") or None,
                              payload=body)
        if record is None:
            return Response.error(404, "not_found", "项目不存在。")
        return Response(200, {"ok": True, "project": record})

    def store_prepare(req: Request) -> Response:
        record = store.get(req.q1("id") or "")
        if record is None or record["kind"] != KIND_STORE:
            return Response.error(404, "not_found", "项目不存在。")
        return Response(200, {"ok": True, "project": record,
                              "steps": [], "message": "素材与分镜需先上传，当前为空。"})

    def store_result(req: Request) -> Response:
        record = store.get(req.q1("id") or "")
        if record is None or record["kind"] != KIND_STORE:
            return Response.error(404, "not_found", "项目不存在。")
        return Response(200, {"ok": True, "resultFile": record["payload"].get("resultFile", "")})

    def store_quote(_req: Request) -> Response:
        return Response(200, {"ok": True, "estimatedPoints": 0.0, "pricingMode": "free",
                              "message": "免费。"})

    def store_upload(req: Request) -> Response:
        return _upload(req, "store")

    def ecom_upload(req: Request) -> Response:
        return _upload(req, "ecommerce")

    def unavailable(_req: Request) -> Response:
        return Response.error(501, "model_required", LLM_REQUIRED)

    router.register("D5", "/api/ecommerce-showcase", showcase)
    router.register("D5", "/api/ecommerce-showcase-media", showcase_media)
    router.register("D5", "/api/ecommerce/", ecom_list)
    router.register("D5", "/api/ecommerce/save", ecom_save, methods=("POST",))
    router.register("D5", "/api/ecommerce/upload", ecom_upload, methods=("POST",))
    router.register("D5", "/api/ecommerce/batch/", batch_list)
    router.register("D5", "/api/ecommerce/batch/archive", batch_archive, methods=("POST",))
    router.register("D5", "/api/ecommerce/workbench/", workbench)
    router.register("D5", "/api/ecommerce/workbench/save", workbench_save,
                    methods=("POST",))
    router.register("D5", "/api/ecommerce/workbench/media", workbench_media)
    router.register("D5", "/api/store/", store_list)
    router.register("D5", "/api/store/projects", store_list)
    router.register("D5", "/api/store/create", store_create, methods=("POST",))
    router.register("D5", "/api/store/project", store_project)
    router.register("D5", "/api/store/save", store_save, methods=("POST",))
    router.register("D5", "/api/store/prepare", store_prepare)
    router.register("D5", "/api/store/result", store_result)
    router.register("D5", "/api/store/quote", store_quote, methods=("POST",))
    router.register("D5", "/api/store/upload", store_upload, methods=("POST",))

    # ---------- 营销文案（LLM，短输出） ----------
    def _assist_error(exc: Exception) -> Response:
        code = str(getattr(exc, "code", "") or "llm_failed")
        message = str(getattr(exc, "message", str(exc)))
        status = int(getattr(exc, "status", 502))
        if code == "upstream_closed":
            message = ("上游中断连接（该渠道对长输出会断连）；请缩短素材或改用更短的要求。")
        return Response.error(status, code, message)

    def _marketing_input(req: Request) -> tuple[str, Response | None]:
        body = req.json() if req.body else {}
        text = str(body.get("text") or body.get("requirement")
                   or body.get("product") or "").strip()
        if not text:
            project_id = str(body.get("projectId") or req.q1("projectId") or "")
            if project_id:
                record = store.get(project_id)
                if record is not None:
                    payload = record["payload"]
                    text = str(payload.get("description") or payload.get("name") or "")
        if not text:
            return "", Response.error(400, "invalid_input", "缺少商品描述或文案素材。")
        return text, None

    def _require_assist() -> Response | None:
        if assist is None or not assist.ready():
            return Response.error(503, "model_unconfigured",
                                  "LLM 未就绪：请在 data/llm-profiles.json 配置渠道。")
        return None

    def marketing_analyze(req: Request) -> Response:
        problem = _require_assist()
        if problem:
            return problem
        text, problem = _marketing_input(req)
        if problem:
            return problem
        try:
            data = assist.json_call(
                "你是电商文案分析助手，只输出 JSON。",
                f"商品/素材：{text[:800]}\n"
                '输出 JSON：{"audience":"","sellingPoints":[""],"tone":"",'
                '"keywords":[""]}')
        except Exception as exc:  # noqa: BLE001
            return _assist_error(exc)
        return Response(200, {"ok": True, "analysis": data})

    def marketing_generate(req: Request) -> Response:
        problem = _require_assist()
        if problem:
            return problem
        text, problem = _marketing_input(req)
        if problem:
            return problem
        body = req.json() if req.body else {}
        platform = str(body.get("platform") or "抖音")
        try:
            data = assist.json_call(
                "你是电商营销文案写手，只输出 JSON。",
                f"商品：{text[:600]}\n平台：{platform}\n"
                '输出 JSON：{"title":"","copy":"","hashtags":[""]}')
        except Exception as exc:  # noqa: BLE001
            return _assist_error(exc)
        return Response(200, {"ok": True, "marketing": data,
                              "title": data.get("title", ""),
                              "copy": data.get("copy", "")})

    router.register("D5", "/api/marketing/analyze", marketing_analyze,
                    methods=("GET", "POST"))
    router.register("D5", "/api/marketing/generate", marketing_generate,
                    methods=("GET", "POST"))
