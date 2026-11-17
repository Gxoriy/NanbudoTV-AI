"""前端动态拼出来的接口（`/api/ecommerce/<action>`）与几处别名。

为什么需要这一层：电商页不是逐个写死 URL，而是
`fetch('/api/ecommerce/' + action)`，actions 有 25 个。逐个 register 会写 25 段样板，
所以用一个**动作分派器**：`ACTION_TABLE` 里登记动作，未登记的动作返回 404 并列出可用动作
（而不是笼统 501），这样前端点错也不会只看到"未迁移"。

存储语义：
  - 电商文档、批次状态 → DocStore（kind=ecommerce259 / ecommerce_batch）
  - 报价 → 恒 0（本项目对外免费）
  - 需要模型的动作（analyze/generate）→ LLM + 任务队列，缺配置时 503 并说明
"""

from __future__ import annotations

import json
import pathlib
import threading
import time
from typing import Any, Callable

from .router import Request, Response, Router
from domain.workspace.store import DocStore

DOC_KIND = "ecommerce259"
BATCH_KIND = "ecommerce_batch"


def build(router: Router, store: DocStore, *, assist=None, task_store=None,
          files_root: pathlib.Path | None = None) -> None:
    table: dict[str, Callable[[Request], Response]] = {}

    def action(name: str):
        def wrapper(fn: Callable[[Request], Response]) -> Callable[[Request], Response]:
            table[name] = fn
            return fn
        return wrapper

    # ---------- 文档 CRUD ----------
    @action("list")
    def list_docs(req: Request) -> Response:
        include_deleted = req.q1("includeDeleted") in ("1", "true", "yes")
        rows = store.list(DOC_KIND, limit=int(req.q1("limit") or 200))
        items = [{"id": row["id"], "name": row["name"],
                  "updatedAt": row["updatedAt"],
                  "deleted": bool(row["payload"].get("deleted"))} for row in rows]
        if not include_deleted:
            items = [row for row in items if not row["deleted"]]
        return Response(200, {"ok": True, "documents": items, "count": len(items)})

    @action("create")
    def create(req: Request) -> Response:
        body = req.json() if req.body else {}
        record = store.create(DOC_KIND, str(body.get("name") or "未命名商品"),
                              {"ecommerce259": body.get("document") or {},
                               "batch260": {"items": [], "results": []}})
        return Response(200, {"ok": True, "id": record["id"], "document": record})

    @action("save")
    def save(req: Request) -> Response:
        body = req.json() if req.body else {}
        doc_id = str(body.get("id") or body.get("canvasId") or "")
        record = store.get(doc_id)
        if record is None or record["kind"] != DOC_KIND:
            return Response.error(404, "not_found", "电商项目不存在。")
        updated = store.update(doc_id, name=str(body.get("name") or record["name"]),
                               payload={**record["payload"],
                                        "ecommerce259": body.get("document")
                                        or record["payload"].get("ecommerce259", {})})
        return Response(200, {"ok": True, "document": updated})

    @action("save-preferences")
    def save_preferences(req: Request) -> Response:
        body = req.json() if req.body else {}
        store.set_setting("ecommerce.preferences", body)
        return Response(200, {"ok": True, "preferences": body})

    @action("restore")
    def restore(req: Request) -> Response:
        body = req.json() if req.body else {}
        doc_id = str(body.get("id") or "")
        record = store.get(doc_id)
        if record is None:
            return Response.error(404, "not_found", "该项目不存在或已删除。")
        if record["payload"].get("deleted"):
            record = store.update(doc_id, payload={**record["payload"], "deleted": False})
        return Response(200, {"ok": True, "document": record})

    @action("delete")
    def delete(req: Request) -> Response:
        """软删除：前端有"已删除项目"视图，说明旧版是可恢复的。"""
        body = req.json() if req.body else {}
        doc_id = str(body.get("id") or "")
        record = store.get(doc_id)
        if record is None or record["kind"] != DOC_KIND:
            return Response.error(404, "not_found", "该项目不存在或已删除。")
        store.update(doc_id, payload={**record["payload"], "deleted": True,
                                      "deletedAt": time.time()})
        return Response(200, {"ok": True, "id": doc_id})

    @action("reconcile")
    def reconcile(req: Request) -> Response:
        """把请求里带来的文档与已存文档对齐（前端断线重连用）。"""
        body = req.json() if req.body else {}
        doc_id = str(body.get("id") or "")
        record = store.get(doc_id)
        if record is None:
            return Response.error(404, "not_found", "该项目不存在。")
        merged = dict(record["payload"].get("ecommerce259") or {})
        merged.update(body.get("document") or {})
        updated = store.update(doc_id, payload={**record["payload"], "ecommerce259": merged})
        return Response(200, {"ok": True, "document": updated})

    # ---------- 素材目录 ----------
    @action("catalog")
    def catalog(_req: Request) -> Response:
        rows: list[dict[str, Any]] = []
        root = files_root
        if root is not None and root.exists():
            for path in sorted(root.rglob("*")):
                if path.is_file() and path.suffix.lower() in (
                        ".png", ".jpg", ".jpeg", ".webp", ".mp4", ".webm"):
                    relative = path.relative_to(root).as_posix()
                    rows.append({"id": relative, "name": path.name,
                                 "media": "video" if path.suffix.lower() in (".mp4", ".webm")
                                 else "image",
                                 "url": f"/api/ecommerce/media?file={relative}",
                                 "size": path.stat().st_size})
        return Response(200, {"ok": True, "items": rows, "count": len(rows)})

    # ---------- 报价（对外免费） ----------
    def free_quote(_req: Request) -> Response:
        return Response(200, {"ok": True, "price": 0, "points": 0,
                              "estimatedPoints": 0.0, "pricingMode": "free",
                              "modelName": "免费", "message": "免费。"})

    for name in ("quote", "analyze-quote"):
        table[name] = free_quote

    # ---------- 需要模型的动作 ----------
    def _guard() -> Response | None:
        if assist is None or not assist.ready():
            return Response.error(503, "model_unconfigured",
                                  "LLM 未就绪：请在 data/llm-profiles.json 配置渠道。")
        return None

    def _llm_task(req: Request, kind: str, prompt_builder: Callable[[dict], str],
                  system: str) -> Response:
        problem = _guard()
        if problem:
            return problem
        if task_store is None:
            return Response.error(503, "unsupported", "任务队列未就绪。")
        body = req.json() if req.body else {}
        task = task_store.create(f"ecommerce.{kind}", "D5",
                                 {"keys": sorted(body.keys())[:12]})

        def work(task_id: str) -> None:
            try:
                task_store.start(task_id)
            except KeyError:
                return
            try:
                data = assist.json_call(system, prompt_builder(body))
                task_store.succeed(task_id, data)
            except Exception as exc:  # noqa: BLE001
                task_store.fail(task_id, str(getattr(exc, "code", "internal")),
                                str(getattr(exc, "message", exc)))

        threading.Thread(target=work, args=(task.id,), daemon=True).start()
        return Response(200, {"ok": True, "taskId": task.id})

    @action("analyze-start")
    def analyze_start(req: Request) -> Response:
        return _llm_task(
            req, "analyze",
            lambda body: (f"商品资料：{json.dumps(body, ensure_ascii=False)[:1500]}\n"
                          '输出 JSON：{"audience":"","sellingPoints":[""],"tone":"",'
                          '"keywords":[""]}'),
            "你是电商文案分析助手，只输出 JSON。")

    @action("generate")
    def generate(req: Request) -> Response:
        return _llm_task(
            req, "generate",
            lambda body: (f"商品与要求：{json.dumps(body, ensure_ascii=False)[:1500]}\n"
                          '输出 JSON：{"title":"","copy":"","hashtags":[""]}'),
            "你是电商营销文案写手，只输出 JSON。")

    @action("prepare")
    def prepare(req: Request) -> Response:
        return _llm_task(
            req, "prepare",
            lambda body: (f"项目：{json.dumps(body, ensure_ascii=False)[:1200]}\n"
                          '输出 JSON：{"steps":[{"name":"","action":""}]}'),
            "你是电商制作流程规划助手，只输出 JSON。")

    @action("observe")
    def observe(req: Request) -> Response:
        body = req.json() if req.body else {}
        task_id = str(body.get("taskId") or "")
        task = task_store.get(task_id) if (task_store and task_id) else None
        if task is None:
            return Response(200, {"ok": True, "taskId": task_id, "state": "idle",
                                  "message": "没有进行中的任务。"})
        return Response(200, {"ok": True, "task": task.public()})

    @action("bind-character")
    def bind_character(req: Request) -> Response:
        body = req.json() if req.body else {}
        doc_id = str(body.get("id") or body.get("canvasId") or "")
        record = store.get(doc_id)
        if record is None:
            return Response.error(404, "not_found", "项目不存在。")
        doc = dict(record["payload"].get("ecommerce259") or {})
        doc["character"] = body.get("character") or body.get("characterId") or ""
        updated = store.update(doc_id, payload={**record["payload"], "ecommerce259": doc})
        return Response(200, {"ok": True, "document": updated})

    # ---------- 批次（保存在文档 payload 里） ----------
    def _batch(req: Request, mutate: Callable[[dict, dict], dict]) -> Response:
        body = req.json() if req.body else {}
        doc_id = str(body.get("id") or body.get("canvasId") or "")
        record = store.get(doc_id)
        if record is None:
            return Response.error(404, "not_found", "项目不存在。")
        batch = dict(record["payload"].get("batch260") or {"items": [], "results": []})
        batch = mutate(batch, body)
        updated = store.update(doc_id, payload={**record["payload"], "batch260": batch})
        return Response(200, {"ok": True, "batch": batch, "document": updated})

    @action("batch/create")
    def batch_create(req: Request) -> Response:
        def mutate(batch: dict, body: dict) -> dict:
            items = list(batch.get("items") or [])
            items.append({"id": f"batch-{len(items) + 1}",
                          "settings": body.get("settings") or {}, "status": "draft"})
            return {**batch, "items": items}
        return _batch(req, mutate)

    @action("batch/settings")
    def batch_settings(req: Request) -> Response:
        def mutate(batch: dict, body: dict) -> dict:
            return {**batch, "settings": body.get("settings") or body}
        return _batch(req, mutate)

    @action("batch/design-state")
    def batch_design_state(req: Request) -> Response:
        def mutate(batch: dict, body: dict) -> dict:
            return {**batch, "design": body.get("design") or body.get("state") or {}}
        return _batch(req, mutate)

    @action("batch/pause")
    def batch_pause(req: Request) -> Response:
        def mutate(batch: dict, _body: dict) -> dict:
            return {**batch, "paused": True}
        return _batch(req, mutate)

    @action("batch/start")
    def batch_start(req: Request) -> Response:
        # 先校验输入（没有批次就是 400），再判断模型/队列是否就绪——
        # 否则用户看到的是 503，会误以为"服务没起来"。
        body = req.json() if req.body else {}
        doc_id = str(body.get("id") or body.get("canvasId") or "")
        record = store.get(doc_id)
        if record is None:
            return Response.error(404, "not_found", "项目不存在。")
        batch = dict(record["payload"].get("batch260") or {})
        items = batch.get("items") or []
        if not items:
            return Response.error(400, "invalid_input", "还没有可生成的批次。")
        problem = _guard()
        if problem:
            return problem
        if task_store is None:
            return Response.error(503, "unsupported", "任务队列未就绪。")
        task = task_store.create("ecommerce.batch", "D5", {"docId": doc_id,
                                                           "items": len(items)})

        def work(task_id: str) -> None:
            try:
                task_store.start(task_id)
            except KeyError:
                return
            try:
                results = []
                for index, item in enumerate(items, start=1):
                    task_store.set_progress(task_id, 0.05 + 0.9 * index / len(items),
                                            f"正在生成第 {index}/{len(items)} 张")
                    data = assist.json_call(
                        "你是电商主图文案助手，只输出 JSON。",
                        f"批次设置：{json.dumps(item.get('settings') or {}, ensure_ascii=False)[:800]}\n"
                        '输出 JSON：{"title":"","sellingPoints":[""]}')
                    results.append({"batchId": item.get("id"), **data})
                current = store.get(doc_id)
                if current is not None:
                    batch = dict(current["payload"].get("batch260") or {})
                    batch["results"] = list(batch.get("results") or []) + results
                    store.update(doc_id, payload={**current["payload"], "batch260": batch})
                task_store.succeed(task_id, {"results": len(results)})
            except Exception as exc:  # noqa: BLE001
                task_store.fail(task_id, str(getattr(exc, "code", "internal")), str(exc))

        threading.Thread(target=work, args=(task.id,), daemon=True).start()
        return Response(200, {"ok": True, "taskId": task.id})

    @action("batch/observe")
    def batch_observe(req: Request) -> Response:
        body = req.json() if req.body else {}
        task_id = str(body.get("taskId") or "")
        task = task_store.get(task_id) if (task_store and task_id) else None
        if task is None:
            return Response(200, {"ok": True, "state": "idle", "task": None})
        return Response(200, {"ok": True, "task": task.public()})

    @action("batch/quote")
    def batch_quote(req: Request) -> Response:
        return free_quote(req)

    @action("batch/reconcile")
    def batch_reconcile(req: Request) -> Response:
        def mutate(batch: dict, body: dict) -> dict:
            return {**batch, **({"results": body["results"]} if body.get("results") else {})}
        return _batch(req, mutate)

    @action("batch/export")
    def batch_export(req: Request) -> Response:
        body = req.json() if req.body else {}
        doc_id = str(body.get("id") or body.get("canvasId") or "")
        record = store.get(doc_id)
        if record is None:
            return Response.error(404, "not_found", "项目不存在。")
        return Response(200, {"ok": True, "url": "/api/ecommerce/batch/archive",
                              "results": (record["payload"].get("batch260") or {})
                              .get("results") or []})

    @action("batch/delete-items")
    def batch_delete_items(req: Request) -> Response:
        def mutate(batch: dict, body: dict) -> dict:
            drop = {str(item) for item in (body.get("ids") or [])}
            items = [row for row in (batch.get("items") or [])
                     if str(row.get("id")) not in drop]
            return {**batch, "items": items}
        return _batch(req, mutate)

    @action("batch/delete-results")
    def batch_delete_results(req: Request) -> Response:
        def mutate(batch: dict, body: dict) -> dict:
            drop = {str(item) for item in (body.get("batchIds") or body.get("ids") or [])}
            results = [row for row in (batch.get("results") or [])
                       if str(row.get("batchId")) not in drop]
            return {**batch, "results": results}
        return _batch(req, mutate)

    # ---------- 文件上传 / 取文件 ----------
    def _save_upload(req: Request, folder: str) -> Response:
        from urllib.parse import unquote

        if not req.body:
            return Response.error(400, "invalid_input", "上传内容为空。")
        name = unquote(req.headers.get("x-filename", "")) or "upload.bin"
        relative = store.save_file(folder, name, req.body)
        return Response(200, {"ok": True, "file": relative, "size": len(req.body)})

    @action("batch/upload")
    def batch_upload(req: Request) -> Response:
        return _save_upload(req, "ecommerce")

    @action("upload")
    def upload(req: Request) -> Response:
        return _save_upload(req, "ecommerce")

    def _serve(relative: str) -> Response:
        import mimetypes

        path = store.file_path(relative)
        if path is None:
            return Response.error(404, "not_found", "文件不存在。")
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        return Response(200, None, {}, raw=path.read_bytes(), content_type=mime)

    @action("media")
    def media(req: Request) -> Response:
        return _serve(req.q1("file") or "")

    @action("workbench/media")
    def workbench_media(req: Request) -> Response:
        return _serve(req.q1("file") or "")

    @action("workbench/catalog")
    def workbench_catalog(req: Request) -> Response:
        return catalog(req)

    @action("workbench")
    def workbench_root(_req: Request) -> Response:
        return Response(200, {"ok": True,
                              "workbench": store.get_setting("ecommerce.workbench", {})})

    @action("workbench/save")
    def workbench_save(req: Request) -> Response:
        body = req.json() if req.body else {}
        store.set_setting("ecommerce.workbench", body)
        return Response(200, {"ok": True, "workbench": body})

    # ---------- 分派 ----------
    @action("preferences")
    def preferences(req: Request) -> Response:
        saved = store.get_setting("ecommerce.preferences", {}) or {}
        media = req.q1("media") or ""
        if req.method == "POST" and req.body:
            saved = {**saved, **req.json()}
            store.set_setting("ecommerce.preferences", saved)
        return Response(200, {"ok": True, "preferences": saved, "media": media})

    def dispatch(req: Request) -> Response:
        # path 里可能带 query（内核把完整 path 传进来），先剥掉再匹配动作
        action_name = req.path.split("?", 1)[0].split("/api/ecommerce/", 1)[-1].strip("/")
        if not action_name:
            # /api/ecommerce/ 根路径就是列表（首页会拉它）
            action_name = "list"
        handler = table.get(action_name)
        if handler is None:
            return Response.error(404, "not_found",
                                  f"没有这个电商动作：{action_name}。可用："
                                  f"{', '.join(sorted(table))}")
        return handler(req)

    # methods 必须全放开：前端 create/save/delete 都是 POST，若只注册 GET，
    # 请求会落到路由兜底并返回 501 not_migrated（看起来像"没实现"）。
    router.register("D5", "/api/ecommerce/", dispatch,
                    methods=("GET", "POST", "PUT", "DELETE", "PATCH"))
