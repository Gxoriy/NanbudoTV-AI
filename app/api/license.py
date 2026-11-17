"""授权域路由（/api/license/{status,activate,refresh}）。

设备码来源优先级：请求头 `X-Device-Code`（客户端持久化）> 由 IP+UA 派生。
派生只用于网页版首次访问，保证同一浏览器稳定，不落 Cookie。
"""

from __future__ import annotations

from .router import Request, Response, Router
from domain.license import LicenseError, LicenseService, device_from


def build(router: Router, service: LicenseService) -> None:
    def device_of(req: Request) -> str:
        header = (req.headers.get("x-device-code") or "").strip()
        if header:
            return header[:64]
        ip = (req.headers.get("x-real-ip") or req.headers.get("x-forwarded-for")
              or "127.0.0.1").split(",")[0].strip()
        agent = req.headers.get("user-agent", "")
        return device_from(f"{ip}|{agent}")

    def status(req: Request) -> Response:
        return Response(200, service.status(device_of(req)))

    def activate(req: Request) -> Response:
        body = req.json()
        key = str(body.get("cardKey") or body.get("key") or "").strip()
        if not key:
            return Response.error(400, "invalid_input", "请输入卡密。")
        try:
            return Response(200, service.activate(device_of(req), key))
        except LicenseError as exc:
            return Response.auth_error(400, exc.code, exc.message)

    def refresh(req: Request) -> Response:
        return Response(200, service.status(device_of(req)))

    router.register("S2", "/api/license/status", status)
    router.register("S2", "/api/license/activate", activate, methods=("POST",))
    router.register("S2", "/api/license/refresh", refresh, methods=("POST",))
