"""调用 node 采集驱动（`driver.js`）并解析结果。

为什么用 Node：本机 Playwright 是 JS 版（`E:\\PublicWork\\Playwright/node_modules`），
Python 侧只负责拉起进程、传参、解析 JSON，以及把退出码翻译成可用错误。
"""

from __future__ import annotations

import json
import pathlib
import subprocess
import tempfile
from dataclasses import dataclass, field
from typing import Any

from . import probe

DRIVER = pathlib.Path(__file__).with_name("driver.js")


class BrowseError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class AnalyzeResult:
    url: str = ""
    title: str = ""
    description: str = ""
    cover: str = ""
    videos: list[str] = field(default_factory=list)
    images: list[str] = field(default_factory=list)

    def public(self) -> dict[str, Any]:
        return {"ok": True, "url": self.url, "title": self.title,
                "description": self.description, "cover": self.cover,
                "videos": self.videos, "images": self.images}


def download_bytes(url: str, timeout: float = 300.0, referer: str = "") -> bytes:
    """下载媒体直链。

    不少 CDN 会校验 Referer/UA，直接用 urllib 裸请求会 403，
    所以带上浏览器式头，并允许传入来源页作为 Referer。
    """
    import urllib.error
    import urllib.request

    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                             "AppleWebKit/537.36 (KHTML, like Gecko) "
                             "Chrome/124.0 Safari/537.36",
               "Accept": "*/*"}
    if referer:
        headers["Referer"] = referer
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"HTTP {exc.code} {url[:120]}") from exc


def download_media(url: str, *, timeout_ms: int = 45000,
                   status: probe.PlaywrightStatus | None = None) -> dict[str, Any]:
    """打开页面 → 找到视频直链 → 下载字节。

    采集页的地址多半是二次跳转的，所以不能只靠 <video src>：
    同时监听网络响应里以 .mp4/.m3u8 结尾的 URL，两者合并后取第一个可下载的。
    """
    if not url.startswith(("http://", "https://")):
        raise BrowseError("invalid_input", "只支持 http/https 链接。")
    state = status or probe.detect()
    if not state.ready:
        raise BrowseError("browser_required", state.public()["message"])

    driver = DRIVER
    with tempfile.TemporaryDirectory() as tmp:
        out_path = pathlib.Path(tmp) / "media.bin"
        payload = json.dumps({"url": url, "timeoutMs": timeout_ms, "mode": "download",
                              "outPath": str(out_path)}, ensure_ascii=False)
        env = {"NANBUDO_PLAYWRIGHT_DIR": str(state.root)}
        import os

        proc = subprocess.run([state.node, str(driver), payload], capture_output=True,
                              text=True, timeout=timeout_ms / 1000 + 900,
                              encoding="utf-8", errors="replace",
                              env={**os.environ, **env})
        raw = (proc.stdout or "").strip()
        if not raw:
            raise BrowseError("browse_failed", "采集进程无输出")
        try:
            body = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise BrowseError("browse_failed", f"采集输出不是 JSON: {raw[:160]}") from exc
        if not body.get("ok"):
            raise BrowseError(str(body.get("code") or "browse_failed"),
                              str(body.get("message") or "采集失败"))
        data = body.get("data") or {}
        saved = pathlib.Path(str(data.get("filePath") or ""))
        if not saved.is_file():
            raise BrowseError("download_failed", "浏览器没有产出媒体文件。")
        media_bytes = saved.read_bytes()

    videos = [str(v) for v in (data.get("videos") or []) if str(v).startswith("http")]
    target = videos[0] if videos else url
    name = target.split("?")[0].rsplit("/", 1)[-1] or "video.mp4"
    return {"url": target, "bytes": media_bytes, "filename": name,
            "title": str(data.get("title") or ""), "page": str(data.get("url") or url)}


def analyze(url: str, *, timeout_ms: int = 45000, profile: str | None = None,
            status: probe.PlaywrightStatus | None = None) -> AnalyzeResult:
    if not url.startswith(("http://", "https://")):
        raise BrowseError("invalid_input", "只支持 http/https 链接。")
    state = status or probe.detect()
    if not state.ready:
        raise BrowseError("browser_required", state.public()["message"])
    if not state.node:
        raise BrowseError("browser_required", "未找到 node 可执行文件。")

    payload = json.dumps({"url": url, "timeoutMs": timeout_ms,
                          **({"profile": profile} if profile else {})},
                         ensure_ascii=False)
    env = {"NANBUDO_PLAYWRIGHT_DIR": str(state.root)}
    import os

    proc = subprocess.run([state.node, str(DRIVER), payload],
                          capture_output=True, text=True, timeout=timeout_ms / 1000 + 30,
                          encoding="utf-8", errors="replace",
                          env={**os.environ, **env})
    raw = (proc.stdout or "").strip()
    if not raw:
        detail = (proc.stderr or "").strip()[:300]
        raise BrowseError("browse_failed", f"采集进程无输出（exit={proc.returncode}）: {detail}")
    try:
        body = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise BrowseError("browse_failed", f"采集输出不是 JSON: {raw[:200]}") from exc
    if not body.get("ok"):
        raise BrowseError(str(body.get("code") or "browse_failed"),
                          str(body.get("message") or "采集失败"))
    data = body.get("data") or {}
    return AnalyzeResult(url=str(data.get("url") or url),
                         title=str(data.get("title") or ""),
                         description=str(data.get("description") or ""),
                         cover=str(data.get("cover") or ""),
                         videos=[str(v) for v in (data.get("videos") or [])],
                         images=[str(v) for v in (data.get("images") or [])])
