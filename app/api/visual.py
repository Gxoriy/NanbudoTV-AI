"""视觉域路由（P3-02 第一片）：样式目录 + 节点自省。

`/api/visual/*` 的其余路由（projects/macro/preview…）尚未迁移，仍 501。
节点自省是新增的调试接口（旧版没有），用于确认"新增环节只加节点"这条约束。
"""

from __future__ import annotations

from .router import Request, Response, Router
from domain.visual import VisualService


def build(router: Router, service: VisualService) -> None:
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

    def project_scenes(req: Request) -> Response:
        return Response(200, service.scenes(req.json()))

    router.register("D2", "/api/visual/styles", styles)
    router.register("D2", "/api/visual/style", style_item)
    router.register("D2", "/api/visual/_nodes", nodes)
    router.register("D2", "/api/visual/projects", projects)
    router.register("D2", "/api/visual/project", project_item)
    router.register("D2", "/api/visual/project/create", project_create, methods=("POST",))
    router.register("D2", "/api/visual/settings", project_settings, methods=("POST",))
    router.register("D2", "/api/visual/project/delete", project_delete, methods=("POST",))
    router.register("D2", "/api/visual/project/scenes", project_scenes, methods=("POST",))
