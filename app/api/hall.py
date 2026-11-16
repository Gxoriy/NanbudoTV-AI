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
from infra.browser import watcher
from infra.browser.runner import (BrowseError, analyze, download_bytes,
                                  download_media)

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
        runner = analyze_runner or analyze
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
    def watch_start(req: Request) -> Response:
        body = req.json() if req.body else {}
        url = str(body.get("url") or req.q1("url") or "").strip()
        result = watcher.start(url)
        if not result.get("ok"):
            code = str(result.get("code") or "internal")
            status = {"browser_required": 501, "invalid_input": 400}.get(code, 502)
            return Response.error(status, code, str(result.get("message") or "启动失败"))
        return Response(200, result)

    def watch_stop(_req: Request) -> Response:
        return Response(200, watcher.stop())

    def watch_status(_req: Request) -> Response:
        return Response(200, watcher.status())

    def _browse_call(fn, *args, **kwargs):
        """返回 (成功?, 结果)；失败时结果是 Response。"""
        try:
            return True, fn(*args, **kwargs)
        except BrowseError as exc:
            status = {"browser_required": 501, "invalid_input": 400, "not_found": 404,
                      "busy": 409}.get(exc.code, 502)
            return False, Response.error(status, exc.code, exc.message)

    def link_download(req: Request) -> Response:
        body = req.json() if req.body else {}
        url = str(body.get("url") or req.q1("url") or "").strip()
        if not url:
            return Response.error(400, "invalid_input", "缺少 url。")
        media = _browse_call(download_media, url)
        if not media[0]:
            return media[1]
        info = media[1]
        relative = store.save_file("downloads", info["filename"], info["bytes"])
        return Response(200, {"ok": True, "file": relative, "bytes": len(info["bytes"]),
                              "url": info["url"], "title": info["title"]})

    def link_import(req: Request) -> Response:
        body = req.json() if req.body else {}
        url = str(body.get("url") or "").strip()
        if not url:
            return Response.error(400, "invalid_input", "缺少 url。")
        media = _browse_call(download_media, url)
        if not media[0]:
            return media[1]
        info = media[1]
        relative = store.save_file("downloads", info["filename"], info["bytes"])
        record = store.create("download", info["title"] or info["filename"],
                              {"file": relative, "size": len(info["bytes"]),
                               "sourceUrl": url, "status": "done"})
        return Response(200, {"ok": True, "id": record["id"], "file": relative,
                              "bytes": len(info["bytes"])})

    def series_download(req: Request) -> Response:
        body = req.json() if req.body else {}
        url = str(body.get("url") or req.q1("url") or "").strip()
        limit = max(1, min(int(body.get("limit") or 1), 5))
        if not url:
            return Response.error(400, "invalid_input", "缺少 url。")
        analyzed = _browse_call(analyze, url)
        if not analyzed[0]:
            return analyzed[1]
        saved = []
        for index, target in enumerate(analyzed[1]["videos"][:limit], start=1):
            try:
                data = download_bytes(target)
            except Exception as exc:  # noqa: BLE001
                saved.append({"url": target, "error": str(exc)[:120]})
                continue
            relative = store.save_file("downloads", f"episode-{index}.mp4", data)
            record = store.create("download", f"第{index}集",
                                  {"file": relative, "size": len(data),
                                   "sourceUrl": target, "status": "done"})
            saved.append({"id": record["id"], "file": relative,
                          "bytes": len(data), "url": target})
        return Response(200, {"ok": True, "items": saved, "count": len(saved)})

    def series_transcribe(req: Request) -> Response:
        body = req.json() if req.body else {}
        relative = str(body.get("file") or "")
        if not relative:
            record_id = str(body.get("id") or "")
            record = store.get(record_id) if record_id else None
            if record is None:
                return Response.error(400, "invalid_input", "缺少 file 或 id。")
            relative = str(record["payload"].get("file") or "")
        path = store.file_path(relative)
        if path is None:
            return Response.error(404, "not_found", "媒体文件不存在。")
        from infra.asr import available, to_srt, transcribe as run_asr  # noqa: PLC0415

        ready, message = available()
        if not ready:
            return Response.error(501, "model_required", message)
        try:
            result = run_asr(path)
        except Exception as exc:  # noqa: BLE001
            return Response.error(502, "asr_failed", f"转写失败: {exc}")
        srt = to_srt(result.segments)
        srt_file = store.save_file("asr", "episode.srt", srt.encode("utf-8"))
        record = store.create("transcript", f"{path.stem}.srt",
                              {"sourceFile": relative, "srtFile": srt_file,
                               "language": result.language,
                               "segments": len(result.segments)})
        return Response(200, {**result.public(), "srt": srt, "srtFile": srt_file,
                              "id": record["id"]})

    router.register("D6", "/api/watch/open", watch_start, methods=("GET", "POST"))
    router.register("D6", "/api/watch/start", watch_start, methods=("GET", "POST"))
    router.register("D6", "/api/watch/stop", watch_stop, methods=("GET", "POST"))
    router.register("D6", "/api/watch/discard", watch_stop, methods=("GET", "POST"))
    router.register("D6", "/api/watch/status", watch_status)
    router.register("D6", "/api/link/download", link_download, methods=("GET", "POST"))
    router.register("D6", "/api/link/import", link_import, methods=("GET", "POST"))
    router.register("D6", "/api/hall/series/download", series_download,
                    methods=("GET", "POST"))
    router.register("D6", "/api/hall/series/transcribe", series_transcribe,
                    methods=("GET", "POST"))
    for path in ("/api/link/cover", "/api/link/stream"):
        router.register("D6", path, browser_required, methods=("GET", "POST"))
