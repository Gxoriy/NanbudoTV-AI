"""调用 node 采集驱动（`driver.js`）并解析结果。

为什么用 Node：本机 Playwright 是 JS 版（`E:\\PublicWork\\Playwright/node_modules`），
Python 侧只负责拉起进程、传参、解析 JSON，以及把退出码翻译成可用错误。
"""

from __future__ import annotations

import json
import pathlib
import subprocess
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
