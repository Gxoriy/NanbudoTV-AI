"""配音域路由：音色目录 / 免费报价 / 整片配音任务（P3-01）。

`/api/voices/media`（试听音频）尚未迁移，仍 501。
"""

from __future__ import annotations

from .router import Request, Response, Router
from domain.voice import VoiceService


def build(router: Router, service: VoiceService) -> None:
    def catalog(_req: Request) -> Response:
        return Response(200, service.catalog())

    def quote(req: Request) -> Response:
        body = req.json()
        if isinstance(body.get("segments"), list):
            return Response(200, service.quote_segments(
                str(body.get("projectId") or ""), str(body.get("file") or ""),
                body["segments"]))
        return Response(200, service.quote(str(body.get("text") or "")))

    def status(_req: Request) -> Response:
        return Response(200, service.status())

    def job_status(req: Request) -> Response:
        return Response(200, service.job_status(req.q1("projectId") or "",
                                                req.q1("file") or ""))

    def source(req: Request) -> Response:
        return Response(200, service.source(req.q1("projectId") or "",
                                            req.q1("file") or "",
                                            req.q1("scope") or ""))

    def generate(req: Request) -> Response:
        body = req.json()
        result = service.generate(
            str(body.get("projectId") or ""), str(body.get("file") or ""),
            body.get("segments") or [], intent_hash=str(body.get("intentHash") or ""),
            rights_confirmed=bool(body.get("rightsConfirmed")))
        return Response(200, result)

    def observe(req: Request) -> Response:
        body = req.json()
        return Response(200, service.observe(str(body.get("projectId") or "")))

    router.register("D4", "/api/voices/catalog", catalog)
    router.register("D4", "/api/voices/quote", quote, methods=("POST",))
    router.register("D4", "/api/video-voice/status", job_status)
    router.register("D4", "/api/video-voice/source", source)
    router.register("D4", "/api/video-voice/quote", quote, methods=("POST",))
    router.register("D4", "/api/video-voice/generate", generate, methods=("POST",))
    router.register("D4", "/api/video-voice/observe", observe, methods=("POST",))
