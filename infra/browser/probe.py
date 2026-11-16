"""Playwright 运行时探测（D6 采集域依赖）。

本机 Playwright 装在 `E:\\PublicWork\\Playwright`（Node 版，含 browsers/ 与 node_modules/），
不是 Python 包。所以这里只做"能不能用"的探测，并把目录暴露给采集实现：
  - 优先环境变量 NANBUDO_PLAYWRIGHT_DIR
  - 其次默认目录
  - 判定标准：node 可执行 + `node_modules/playwright` 存在 + `browsers` 目录非空

探测结果是**事实**，不做"看起来能用"的假设：缺哪一项就在状态里写清哪一项。
"""

from __future__ import annotations

import os
import pathlib
import shutil
from dataclasses import dataclass, field
from typing import Any

DEFAULT_DIR = pathlib.Path(r"E:\PublicWork\Playwright")


@dataclass
class PlaywrightStatus:
    root: pathlib.Path
    node: str | None = None
    has_package: bool = False
    has_browsers: bool = False
    browser_count: int = 0
    problems: list[str] = field(default_factory=list)

    @property
    def ready(self) -> bool:
        return bool(self.node and self.has_package and self.has_browsers)

    def public(self) -> dict[str, Any]:
        return {
            "ok": self.ready,
            "root": str(self.root),
            "node": self.node or "",
            "hasPackage": self.has_package,
            "hasBrowsers": self.has_browsers,
            "browserCount": self.browser_count,
            "problems": self.problems,
            "message": "" if self.ready else "；".join(self.problems) or "Playwright 未就绪",
        }


def detect(root: str | pathlib.Path | None = None) -> PlaywrightStatus:
    base = pathlib.Path(root or os.environ.get("NANBUDO_PLAYWRIGHT_DIR") or DEFAULT_DIR)
    status = PlaywrightStatus(root=base)
    status.node = shutil.which("node")
    if not status.node:
        status.problems.append("未找到 node（PATH 中没有）")

    package = base / "node_modules" / "playwright"
    status.has_package = package.exists()
    if not status.has_package:
        status.problems.append(f"缺少 {package}")

    browsers = base / "browsers"
    if browsers.exists():
        entries = [item for item in browsers.iterdir() if item.is_dir()]
        status.browser_count = len(entries)
        status.has_browsers = bool(entries)
    if not status.has_browsers:
        status.problems.append(f"缺少浏览器内核：{browsers}")
    return status


def require() -> PlaywrightStatus:
    """采集类接口调用前用它；不 ready 时由调用方返回 501 `browser_required`。"""
    status = detect()
    if not status.ready:
        raise RuntimeError(status.public()["message"])
    return status
