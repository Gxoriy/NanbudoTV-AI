"""视觉域路由（P3-02）：样式目录、项目 CRUD、节点自省与流水线执行。

- `/api/visual/_nodes`：节点注册表自省（阶段 / 输入输出 / 依赖能力 / 流水线预设）
- `/api/visual/_pipeline/run`：按预设跑一遍节点，返回逐步 trace
- 其余 `/api/visual/*` 分布在 visual_extra / visual_stage / visual_tail
"""

from __future__ import annotations

from .router import Request, Response, Router
from domain.visual import VisualService
from domain.visual.nodes import NodeError
from domain.visual.service import VisualError


def build(router: Router, service: VisualService, *,
          pipeline_services: dict | None = None) -> None:
    def styles(_req: Request) -> Response:
        return Response(200, service.styles())

    def style_item(req: Request) -> Response:
        style_id = req.q1("id") or ""
        try:
            item = service.style(style_id)
        except KeyError as exc:
            return Response.error(404, "not_found", str(exc))
        return Response(200, {"ok": True, "style": item})

    def nodes(_req: Request) -> Response:
        return Response(200, service.nodes())

    def projects(_req: Request) -> Response:
        return Response(200, service.projects())

    def project_item(req: Request) -> Response:
        return Response(200, service.project(req.q1("id") or ""))

    def project_create(req: Request) -> Response:
        return Response(200, service.create_project(req.json()))

    def project_settings(req: Request) -> Response:
        return Response(200, service.save_settings(req.json()))

    def project_delete(req: Request) -> Response:
        return Response(200, service.delete_project(req.json()))

    # 分镜生成已移至 visual_stage.py（需要 LLM），这里不再注册，
    # 否则同路径的兜底实现会抢在真实实现之前命中。

    router.register("D2", "/api/visual/styles", styles)
    router.register("D2", "/api/visual/style", style_item)
    def pipeline_run(req: Request) -> Response:
        """按预设流水线跑一遍节点，返回逐步 trace（前端可画进度）。

        context 只回白名单字段；`_services` 里是 assist/video/assets，
        调用方无法通过请求体注入任意对象。
        """
        body = req.json() if req.body else {}
        name = str(body.get("pipeline") or "inspect")
        context = body.get("context") or {}
        if not isinstance(context, dict):
            return Response.error(400, "invalid_input", "context 必须是对象。")
        if "projectId" in body and "projectId" not in context:
            context["projectId"] = str(body["projectId"])
        try:
            result = service.run_pipeline(name, context, services=pipeline_services)
        except VisualError as exc:
            return Response.error(exc.status, exc.code, exc.message)
        if not result.get("ok"):
            return Response(422, {"ok": False, "error": result["error"],
                                  "message": result.get("message", ""),
                                  "trace": result.get("trace") or [],
                                  "pipeline": result.get("pipeline", name)})
        return Response(200, result)

    router.register("D2", "/api/visual/_nodes", nodes)
    router.register("D2", "/api/visual/_pipeline/run", pipeline_run,
                    methods=("GET", "POST"))
    router.register("D2", "/api/visual/projects", projects)
    router.register("D2", "/api/visual/project", project_item)
    router.register("D2", "/api/visual/project/create", project_create, methods=("POST",))
    router.register("D2", "/api/visual/settings", project_settings, methods=("POST",))
    router.register("D2", "/api/visual/project/delete", project_delete, methods=("POST",))
    # project/scenes 由 visual_stage.py 注册（需要 LLM 规划）
