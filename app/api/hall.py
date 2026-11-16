"""D6 素材大厅 / 采集域。

离线可做：下载记录列表、封面与视频流、剧集/榜单查询（空库如实返回）。
依赖浏览器的：链接解析、导入、观看窗口，返回 501 `browser_required`，
并在消息里写清 Playwright 缺什么（目录 `E:\\PublicWork\\Playwright` 已在探测）。
"""

from __future__ import annotations

import mimetypes
import pathlib
import re

from .router import Request, Response, Router
from domain.workspace.store import DocStore
from infra.browser import probe as browser_probe
from infra.browser.runner import BrowseError, analyze as _default_analyze

KIND_DOWNLOAD = "download"
RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


def _range_response(path: pathlib.Path, range_header: str) -> Response:
    total = path.stat().st_size
    start, end, status = 0, total - 1, 200
    match = RANGE_RE.match(range_header or "")
    if match and total:
        first, last = match.group(1), match.group(2)
        if first:
            start = int(first)
            end = int(last) if last else total - 1
        elif last:
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
    ctype = mimetypes.guess_type(path.name)[0] or "video/mp4"
    return Response(status, None, headers, raw=raw, content_type=ctype)


def build(router: Router, store: DocStore, *, downloads_root: pathlib.Path,
          analyze_runner=None) -> None:
    def downloads(_req: Request) -> Response:
        records = []
        for record in store.list(KIND_DOWNLOAD, limit=500):
            item = {"id": record["id"], "name": record["name"],
                    "createdAt": record["createdAt"]}
            item.update({k: record["payload"][k] for k in
                         ("seriesId", "episode", "file", "cover", "size", "status")
                         if k in record["payload"]})
            records.append(item)
        return Response(200, {"ok": True, "records": records,
                              "storagePath": str(downloads_root)})

    def _record_file(req: Request, key: str) -> Response:
        record = store.get(req.q1("id") or "")
        if record is None or record["kind"] != KIND_DOWNLOAD:
            return Response.error(404, "not_found", "下载记录不存在。")
        relative = str(record["payload"].get(key) or "")
        path = store.file_path(relative)
        if path is None:
            return Response.error(404, "not_found", "文件不存在。")
        if key == "file":
            return _range_response(path, req.headers.get("range", ""))
        return Response(200, None, {}, raw=path.read_bytes(),
                        content_type=mimetypes.guess_type(path.name)[0]
                        or "application/octet-stream")

    def cover(req: Request) -> Response:
        return _record_file(req, "cover")

    def stream(req: Request) -> Response:
        return _record_file(req, "file")

    def episodes(req: Request) -> Response:
        series = req.q1("seriesId") or req.q1("id")
        if not series:
            return Response.error(400, "invalid_input", "缺少 seriesId。")
        return Response(200, {"ok": True, "seriesId": series, "episodes": []})

    def rank(req: Request) -> Response:
        kind = req.q1("type") or req.q1("rank")
        if not kind:
            return Response.error(400, "invalid_input", "缺少榜单类型（type）。")
        return Response(200, {"ok": True, "type": kind, "items": []})

    def browser_required(_req: Request) -> Response:
        status = browser_probe.detect()
        detail = status.public()["message"]
        return Response.error(501, "browser_required",
                              f"该功能需要浏览器采集（Playwright）：{detail}")

    def link_analyze(req: Request) -> Response:
        url = str(req.json().get("url") or req.q1("url") or "").strip()
        if not url:
            return Response.error(400, "invalid_input", "缺少 url。")
        runner = analyze_runner or _default_analyze
        try:
            result = runner(url)
        except BrowseError as exc:
            status = {"browser_required": 501, "invalid_input": 400, "busy": 409}.get(
                exc.code, 502)
            return Response.error(status, exc.code, exc.message)
        return Response(200, result.public())

    router.register("D6", "/api/hall/downloads", downloads)
    router.register("D6", "/api/hall/downloads/cover", cover)
    router.register("D6", "/api/hall/downloads/stream", stream)
    router.register("D6", "/api/hall/episodes", episodes)
    router.register("D6", "/api/hall/rank", rank)
    router.register("D6", "/api/link/analyze", link_analyze, methods=("GET", "POST"))
    for path in ("/api/hall/series/download", "/api/hall/series/transcribe",
                 "/api/link/download", "/api/link/import",
                 "/api/link/cover", "/api/link/stream", "/api/watch/open",
                 "/api/watch/start", "/api/watch/status", "/api/watch/stop",
                 "/api/watch/discard"):
        router.register("D6", path, browser_required, methods=("GET", "POST"))
