"""有头采集窗口的进程管理（供 /api/watch/* 使用）。

为什么单独一个进程：Playwright 的有头窗口必须活在一个常驻进程里，
内核是 HTTP 服务、不适合直接持有浏览器上下文；所以用子进程 + stdio 握手。
"""

from __future__ import annotations

import pathlib
import subprocess
import threading
import time
from dataclasses import dataclass, field
from typing import Any

from . import probe

WATCH_SCRIPT = pathlib.Path(__file__).resolve().parents[2] / "tools" / "watch_window.js"


@dataclass
class WatchState:
    proc: subprocess.Popen | None = None
    url: str = ""
    started_at: float = 0.0
    error: str = ""
    lock: threading.Lock = field(default_factory=threading.Lock)

    def public(self) -> dict[str, Any]:
        running = self.proc is not None and self.proc.poll() is None
        return {"ok": True, "running": running, "url": self.url,
                "pid": self.proc.pid if self.proc else 0,
                "startedAt": self.started_at, "error": self.error}


STATE = WatchState()


def start(url: str, *, profile: str | None = None,
          timeout: float = 30.0) -> dict[str, Any]:
    if not url.startswith(("http://", "https://")):
        return {"ok": False, "code": "invalid_input", "message": "只支持 http/https 链接。"}
    status = probe.detect()
    if not status.ready:
        return {"ok": False, "code": "browser_required", "message": status.public()["message"]}
    with STATE.lock:
        if STATE.proc is not None and STATE.proc.poll() is None:
            stop()
        args = ["node", str(WATCH_SCRIPT), url]
        if profile:
            args.append(profile)
        try:
            proc = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                    stderr=subprocess.DEVNULL, text=True,
                                    encoding="utf-8", errors="replace",
                                    env={**dict(__import__("os").environ),
                                         "NANBUDO_PLAYWRIGHT_DIR": str(status.root)})
        except OSError as exc:
            return {"ok": False, "code": "internal", "message": f"无法启动浏览器: {exc}"}
        deadline = time.time() + timeout
        line = ""
        while time.time() < deadline:
            if proc.poll() is not None:
                break
            line = (proc.stdout.readline() or "").strip()
            if line:
                break
        if not line.startswith("READY"):
            proc.kill()
            return {"ok": False, "code": "browser_failed",
                    "message": f"采集窗口启动失败: {line or '无响应'}"}
        STATE.proc = proc
        STATE.url = url
        STATE.started_at = time.time()
        STATE.error = ""
        return STATE.public()


def stop() -> dict[str, Any]:
    with STATE.lock:
        proc = STATE.proc
        STATE.proc = None
        STATE.url = ""
        if proc is None:
            return {"ok": True, "running": False, "message": "没有运行中的采集窗口。"}
        try:
            if proc.stdin:
                proc.stdin.write("stop\n")
                proc.stdin.flush()
            proc.wait(timeout=8)
        except (OSError, ValueError, subprocess.TimeoutExpired):
            proc.kill()
        return {"ok": True, "running": False, "message": "采集窗口已关闭。"}


def status() -> dict[str, Any]:
    return STATE.public()
