"""字幕域路由（P2-01）：只做参数校验与转发，业务在 `domain/subtitle`。

前端调用形态（`static/subtitle_removal245.js`）：
  api('capabilities') / api('list') / api('record?id=…')  → GET
  api('quote', {id, region, quality}) / api('submit', …)  → POST JSON
响应约定：成功体直接使用；失败体带 `error` 字符串，前端据此抛错展示。
"""

from __future__ import annotations

import re
from urllib.parse import unquote

from .router import Request, Response, Router
from domain.subtitle import SubtitleService

RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


def _range_response(path, range_header: str) -> Response:
    """视频预览需要 Range，否则 <video> 拖动进度条会整段重下。"""
    total = path.stat().st_size
    start, end = 0, total - 1
    status = 200
    match = RANGE_RE.match(range_header or "")
    if match and total:
        first, last = match.group(1), match.group(2)
        if first:
            start = int(first)
            end = int(last) if last else total - 1
        elif last:                                  # bytes=-N 表示最后 N 字节
            start = max(0, total - int(last))
        end = min(end, total - 1)
        if start > end:
            return Response.error(416, "invalid_input", "请求范围无效。")
        status = 206
    with path.open("rb") as handle:
        handle.seek(start)
        raw = handle.read(end - start + 1)
    headers = {"Accept-Ranges": "bytes"}
    if status == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{total}"
    return Response(status, None, headers, raw=raw, content_type="video/mp4")


def build(router: Router, service: SubtitleService) -> None:
    def capabilities(_req: Request) -> Response:
        return Response(200, service.capabilities())

    def records_list(_req: Request) -> Response:
        return Response(200, {"records": service.store.brief(limit=100)})

    def projects(_req: Request) -> Response:
        # 旧版 projects 与 list 同源，仅筛云端记录；空库时两者都是空数组
        cloud = [r for r in service.store.list(limit=200) if r.processing_mode == "cloud"]
        return Response(200, {"projects": [
            {"id": r.id, "name": r.name, "phase": r.phase, "updatedAt": r.updated_at}
            for r in cloud
        ]})

    def record_item(req: Request) -> Response:
        record = service.store.get(req.q1("id") or "")
        if record is None:
            return Response.error(404, "not_found", "记录不存在，请重新导入原片。")
        return Response(200, {"record": record.public()})

    def quote(req: Request) -> Response:
        body = req.json()
        record = service.quote(str(body.get("id") or ""), body.get("region"),
                               str(body.get("quality") or "standard"))
        return Response(200, {"record": record.public()})

    def submit(req: Request) -> Response:
        body = req.json()
        record = service.submit(
            str(body.get("id") or ""), body.get("region"),
            str(body.get("quality") or "standard"), str(body.get("quoteId") or ""),
            bool(body.get("confirmed")))
        return Response(200, {"record": record.public()})

    router.register("D3", "/api/subtitle/capabilities", capabilities)
    router.register("D3", "/api/subtitle/list", records_list)
    router.register("D3", "/api/subtitle/projects", projects)
    router.register("D3", "/api/subtitle/record", record_item)
    def upload(req: Request) -> Response:
        filename = unquote(req.headers.get("x-filename", ""))
        if not filename:
            return Response.error(400, "invalid_input", "缺少文件名（X-Filename）。")
        record = service.upload(filename, req.body)
        return Response(200, {"record": record.public()})

    def media(req: Request) -> Response:
        path = service.media_path(req.q1("id") or "", req.q1("file") or "")
        return _range_response(path, req.headers.get("range", ""))

    def local_start(req: Request) -> Response:
        body = req.json()
        if not body.get("confirmed"):
            return Response.error(400, "invalid_input", "未确认，不能开始本地处理。")
        record = service.local_start(str(body.get("id") or ""),
                                     str(body.get("mode") or "strip"),
                                     body.get("region"))
        return Response(200, {"record": record.public()})

    def local_stop(req: Request) -> Response:
        body = req.json()
        record = service.local_stop(str(body.get("id") or ""))
        return Response(200, {"record": record.public()})

    def detect(req: Request) -> Response:
        body = req.json()
        record = service.detect(str(body.get("id") or ""))
        return Response(200, {"record": record.public()})

    router.register("D3", "/api/subtitle/detect", detect, methods=("POST",))
    router.register("D3", "/api/subtitle/quote", quote, methods=("POST",))
    router.register("D3", "/api/subtitle/submit", submit, methods=("POST",))
    router.register("D3", "/api/subtitle/upload", upload, methods=("POST",))
    router.register("D3", "/api/subtitle/media", media)
    router.register("D3", "/api/subtitle/local-start", local_start, methods=("POST",))
    router.register("D3", "/api/subtitle/local-stop", local_stop, methods=("POST",))
