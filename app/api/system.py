"""系统域（S3 / S5）已迁移路由：健康、任务快照、运行时信息、诊断、退出。

这一批是 P1 的"新代码先用"样本：它们全部走新内核，
老 exe 的同名路由行为作为对照基线（spec/smoke-baseline.json）。
"""

from __future__ import annotations

import json
import os
import time
from typing import Any, Callable

from .router import Request, Response, Router
from infra import llm
from infra.tasks import TaskStore


def _public(task) -> dict[str, Any]:
    """任务对外视图：字段名与进度刻度按前端契约（camelCase / 0~100 / state=done|error）。"""
    return task.public()


def build(router: Router, store: TaskStore, *, app_name: str, version: str,
          port_ref: dict[str, int], on_shutdown: Callable[[], None] | None = None,
          profiles: Any = None, health_registry: Any = None,
          workspace: Any = None, data_dir: Any = None) -> None:
    """把系统域路由挂到 router 上。

    `on_shutdown` 由入口注入：不能在这里 `from ..main import ...`，
    因为 `python -m app.main` 会把模块执行成 `__main__`，二次导入会得到
    另一个模块对象与另一份全局状态（Event 不共享，退出就永远不会触发）。
    """

    started_at = time.time()

    def health(_req: Request) -> Response:
        """旧契约四字段（ok/version/appName/channel）保持不变，其余为增量字段。"""
        payload: dict[str, Any] = {
            "ok": True,
            "version": version,
            "appName": app_name,
            "channel": "commercial",
            "kernel": "rebuild",
            "pid": os.getpid(),
            "port": port_ref.get("port", 0),
            "uptimeSeconds": round(time.time() - started_at, 1),
            "startedAt": started_at,
        }
        if health_registry is not None:
            # 注意：参数不能叫 health，否则被下面的同名 handler 覆盖（曾踩）
            snap = health_registry.snapshot()
            payload["ok"] = snap["ok"]
            payload["status"] = snap["status"]
            payload["components"] = snap["components"]
        return Response(200, payload)

    def runtime_status(_req: Request) -> Response:
        return Response(200, {
            "ok": True,
            "pid": os.getpid(),
            "port": port_ref.get("port", 0),
            "dataDir": str(store.path.parent),
            "python": os.sys.version.split()[0],
        })

    def tasks_snapshot(_req: Request) -> Response:
        """单一快照端点：`tasks` / `activeCount` 是旧前端读取的字段，必须保留。"""
        snap = store.snapshot()
        return Response(200, {
            "ok": True,
            "tasks": [_public(t) for t in store.list(limit=50)],
            "activeCount": snap["activeCount"],
            "interruptedCount": snap["interruptedCount"],
            "counts": snap["counts"],
            "active": [_public(t) for t in store.list(states=("running", "queued"))],
        })

    def tasks_list(req: Request) -> Response:
        states = req.query.get("state") or None
        domain = req.q1("domain")
        tasks = store.list(states=states, domain=domain, limit=int(req.q1("limit", "100") or 100))
        return Response.ok(tasks=[_public(t) for t in tasks])

    def task_item(req: Request) -> Response:
        tid = req.route_path.rsplit("/", 1)[-1]
        task = store.get(tid)
        if task is None:
            return Response.error(404, "not_found", "任务不存在", id=tid)
        return Response.ok(task=_public(task))

    def task_cancel(req: Request) -> Response:
        tid = req.route_path.rsplit("/", 1)[-1]
        task = store.cancel(tid)
        return Response.ok(task=_public(task))

    def routes_index(_req: Request) -> Response:
        return Response.ok(**router.index())

    def model_profiles(_req: Request) -> Response:
        if profiles is None:
            return Response.error(501, "not_migrated", "provider 注册表未注入")
        return Response(200, {"profiles": profiles.public_view()})

    def shutdown(_req: Request) -> Response:
        if on_shutdown is None:
            return Response.error(501, "not_migrated", "当前进程未注入退出回调")
        on_shutdown()
        return Response.ok(message="正在退出")

    # S3 运行时域
    router.register("S3", "/api/health", health)
    router.register("S3", "/api/runtime/status", runtime_status)
    router.register("S3", "/api/model-profiles", model_profiles)
    router.register("S3", "/api/_routes", routes_index)
    # S1 任务域（单一快照端点 + 明细查询）
    def profile_save(req: Request) -> Response:
        if profiles is None:
            return Response.error(501, "not_migrated", "provider 注册表未注入")
        body = req.json()
        name = str(body.get("provider") or body.get("name") or "").strip()
        if not name:
            return Response.error(400, "invalid_input", "缺少 provider。")
        try:
            profiles.save(name,
                          api_key=body.get("apiKey"),
                          base_url=body.get("baseUrl"),
                          model=body.get("model"),
                          protocol=body.get("protocol"))
        except (ValueError, KeyError) as exc:
            return Response.error(400, "invalid_input", str(exc))
        return Response(200, {"ok": True, "profiles": profiles.public_view()})

    def profile_test(req: Request) -> Response:
        """真发一次最小请求；失败也返回 200 + ok:false，便于前端展示原因。"""
        if profiles is None:
            return Response.error(501, "not_migrated", "provider 注册表未注入")
        body = req.json()
        name = str(body.get("provider") or body.get("name") or "").strip()
        if not name:
            return Response.error(400, "invalid_input", "缺少 provider。")
        try:
            provider = llm.get(name)
            effective = profiles.effective(name)
            started = time.perf_counter()
            reply = llm.complete(provider,
                                 [{"role": "user", "content": "只回复两个字：可用"}],
                                 api_key=profiles.api_key(name),
                                 base_url=effective["baseUrl"],
                                 model=effective["model"], retries=0, max_tokens=32)
            return Response(200, {"ok": True, "provider": name,
                                  "latencyMs": round((time.perf_counter() - started) * 1000),
                                  "reply": reply[:100]})
        except Exception as exc:  # noqa: BLE001
            return Response(200, {"ok": False, "provider": name, "error": repr(exc)[:200]})

    def download_file(req: Request) -> Response:
        """按相对路径下载 outputs 下的文件；越权一律 404。"""
        if workspace is None or data_dir is None:
            return Response.error(501, "not_migrated", "存储未注入")
        relative = req.q1("file") or ""
        path = workspace.file_path(relative)
        if path is None:
            candidate = (data_dir / "outputs" / relative).resolve()
            try:
                candidate.relative_to((data_dir / "outputs").resolve())
            except ValueError:
                return Response.error(404, "not_found", "文件不存在。")
            path = candidate if candidate.is_file() else None
        if path is None:
            return Response.error(404, "not_found", "文件不存在。")
        return Response(200, None, {}, raw=path.read_bytes(),
                        content_type="application/octet-stream")

    def tutorials(_req: Request) -> Response:
        items = []
        if data_dir is not None:
            index = data_dir / "tutorials.json"
            if index.exists():
                try:
                    body = json.loads(index.read_text(encoding="utf-8"))
                    items = body.get("tutorials") if isinstance(body, dict) else body
                except (json.JSONDecodeError, OSError):
                    items = []
        return Response(200, {"ok": True, "tutorials": items or []})

    def tutorial_video(req: Request) -> Response:
        if data_dir is None:
            return Response.error(501, "not_migrated", "存储未注入")
        name = req.q1("id") or req.q1("file") or ""
        target = (data_dir / "tutorials" / name).resolve() if name else None
        if target is None or not target.is_file():
            return Response.error(404, "not_found", "教程视频不存在。")
        try:
            target.relative_to((data_dir / "tutorials").resolve())
        except ValueError:
            return Response.error(404, "not_found", "教程视频不存在。")
        return Response(200, None, {}, raw=target.read_bytes(), content_type="video/mp4")

    def update_unsupported(_req: Request) -> Response:
        return Response.error(501, "unsupported",
                              "本地重建版不支持在线更新；请更新代码后重启。")

    router.register("S1", "/api/tasks", tasks_snapshot)
    router.register("S1", "/api/tasks/list", tasks_list)
    router.register("S1", "/api/tasks/", task_item)
    router.register("S1", "/api/tasks/cancel/", task_cancel, methods=("POST",))

    router.register("S3", "/api/model-profiles/save", profile_save, methods=("POST",))
    router.register("S3", "/api/model-profiles/test", profile_test, methods=("POST",))
    router.register("S3", "/api/test-model", profile_test, methods=("POST",))
    router.register("S3", "/api/download", download_file)

    router.register("S5", "/api/tutorials", tutorials)
    router.register("S5", "/api/tutorial-video", tutorial_video)
    router.register("S5", "/api/update/download", update_unsupported,
                    methods=("GET", "POST"))
    router.register("S5", "/api/update/install", update_unsupported,
                    methods=("GET", "POST"))
    router.register("S5", "/api/update/reveal", update_unsupported, methods=("POST",))

    def api_root(_req: Request) -> Response:
        """旧实现对 `/api/` 返回 404；这里保持一致，且必须 exact（不能吞子路由）。"""
        return Response.error(404, "not_found", "没有这个接口。")

    router.register("S5", "/api/", api_root, exact=True)
    # 注意：不要注册 "/api/" 这种前缀路由——它会把所有未迁移接口吞成 200，
    # 让"未迁移 = 501"的门禁失效（旧实现这个路径本身也是 404）。
    # S5 外壳
    router.register("S5", "/api/shutdown", shutdown, methods=("POST",))
