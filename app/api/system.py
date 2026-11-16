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
from infra.tasks import TaskStore


def _public(task) -> dict[str, Any]:
    """任务对外视图：字段名与进度刻度按前端契约（camelCase / 0~100 / state=done|error）。"""
    return task.public()


def build(router: Router, store: TaskStore, *, app_name: str, version: str,
          port_ref: dict[str, int], on_shutdown: Callable[[], None] | None = None,
          profiles: Any = None, health_registry: Any = None) -> None:
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
    router.register("S1", "/api/tasks", tasks_snapshot)
    router.register("S1", "/api/tasks/list", tasks_list)
    router.register("S1", "/api/tasks/", task_item)
    router.register("S1", "/api/tasks/cancel/", task_cancel, methods=("POST",))
    # S5 外壳
    router.register("S5", "/api/shutdown", shutdown, methods=("POST",))
