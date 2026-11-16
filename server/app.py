"""自建云端服务（Windows 单机，纯标准库 + ffmpeg + cv2）。

职责边界：
  - 只做"本地搞不定的高频背景擦除"，算法与客户端 B 档同源（`domain/subtitle/repair.py`）
  - 不存用户视频：请求→临时文件→处理→返回字节→删除（`finally` 保证）
  - 不收费：没有任何计费/订单字段，ADR-008

并发模型：单 worker（CPU 推理，多开只会互相拖慢），队列满直接 503 busy。
"""

from __future__ import annotations

import json
import logging
import pathlib
import queue
import tempfile
import threading
import time
import traceback
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from domain.subtitle import region as region_rules
from domain.subtitle.repair import RepairUnavailable, repair_video
from server.accounts import AccountStore
from server.tokens import TokenError, issue, verify

LOG = logging.getLogger("server")
MAX_BODY = 64 * 1024 * 1024
VERSION = "1.0.0"


@dataclass
class Config:
    secret: str
    accounts_path: pathlib.Path
    data_dir: pathlib.Path
    token_ttl: int = 30 * 24 * 3600
    queue_limit: int = 8
    max_body: int = MAX_BODY
    allow_anonymous: bool = False
    extra: dict[str, Any] = field(default_factory=dict)


class Busy(RuntimeError):
    pass


class Worker:
    """单线程任务执行器：提交任务 → 等待结果，超时/异常显式返回。"""

    def __init__(self, limit: int = 8) -> None:
        self.limit = limit
        self._queue: queue.Queue = queue.Queue()
        self._thread = threading.Thread(target=self._loop, name="worker", daemon=True)
        self._thread.start()

    @property
    def pending(self) -> int:
        return self._queue.qsize()

    def submit(self, func, *args, timeout: float = 900.0):
        if self.pending >= self.limit:
            raise Busy("队列已满，请稍后重试。")
        box: dict[str, Any] = {}
        done = threading.Event()
        self._queue.put((func, args, box, done))
        if not done.wait(timeout):
            raise TimeoutError("处理超时。")
        if "error" in box:
            raise box["error"]
        return box.get("result")

    def _loop(self) -> None:
        while True:
            func, args, box, done = self._queue.get()
            try:
                box["result"] = func(*args)
            except Exception as exc:  # noqa: BLE001
                box["error"] = exc
            finally:
                done.set()


def _json(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(raw)))
    handler.end_headers()
    handler.wfile.write(raw)


def _bytes(handler: BaseHTTPRequestHandler, status: int, data: bytes,
           content_type: str = "video/mp4") -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


class ApiHandler(BaseHTTPRequestHandler):
    server_version = f"NanbudoCloud/{VERSION}"
    protocol_version = "HTTP/1.1"
    config: Config
    accounts: AccountStore
    worker: Worker
    started_at: float = time.time()

    # ---------- 路由 ----------
    def do_GET(self) -> None:                        # noqa: N802
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path == "/api/v1/health":
            return _json(self, 200, {"ok": True, "version": VERSION,
                                     "queue": self.worker.pending,
                                     "uptimeSeconds": round(time.time() - self.started_at, 1)})
        if path == "/api/v1/whoami":
            return self._whoami()
        _json(self, 404, {"error": "not_found", "message": "无此接口"})

    def do_POST(self) -> None:                       # noqa: N802
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path == "/api/v1/auth/token":
            return self._login()
        if path == "/api/v1/subtitle/remove":
            return self._remove()
        _json(self, 404, {"error": "not_found", "message": "无此接口"})

    # ---------- 处理 ----------
    def _read_body(self) -> bytes:
        length = int(self.headers.get("Content-Length") or 0)
        if length > self.config.max_body:
            raise ValueError("视频超过服务端上限（64MB）。")
        return self.rfile.read(length) if length else b""

    def _identity(self) -> str | None:
        if self.config.allow_anonymous:
            return "anonymous"
        header = self.headers.get("Authorization", "")
        if not header.lower().startswith("bearer "):
            return None
        try:
            payload = verify(self.config.secret, header[7:].strip())
        except TokenError as exc:
            LOG.info("令牌校验失败: %s", exc)
            return None
        username = str(payload.get("u") or "")
        record = self.accounts.get(username)
        if not record or not record.get("enabled", True):
            return None
        return username

    def _whoami(self) -> None:
        who = self._identity()
        if not who:
            return _json(self, 401, {"error": "auth", "message": "缺少或无效的访问令牌"})
        _json(self, 200, {"ok": True, "username": who})

    def _login(self) -> None:
        try:
            body = json.loads(self._read_body().decode("utf-8") or "{}")
        except (ValueError, json.JSONDecodeError):
            return _json(self, 400, {"error": "invalid_input", "message": "请求体必须是 JSON"})
        username = str(body.get("username") or "")
        password = str(body.get("password") or "")
        if not self.accounts.authenticate(username, password):
            LOG.warning("登录失败: %s", username[:32])
            return _json(self, 401, {"error": "auth", "message": "用户名或口令错误"})
        token = issue(self.config.secret, username, ttl_seconds=self.config.token_ttl)
        _json(self, 200, {"ok": True, "token": token, "username": username,
                          "expiresIn": self.config.token_ttl})

    def _remove(self) -> None:
        who = self._identity()
        if not who:
            return _json(self, 401, {"error": "auth", "message": "缺少或无效的访问令牌"})
        try:
            region = json.loads(self.headers.get("X-Region") or "{}")
            region_rules.require_canonical(region)
        except (json.JSONDecodeError, region_rules.RegionError) as exc:
            return _json(self, 400, {"error": "invalid_input",
                                     "message": f"选区非法: {exc}"})
        quality = (self.headers.get("X-Quality") or "standard").lower()
        if quality not in ("standard", "fine"):
            return _json(self, 400, {"error": "invalid_input", "message": "quality 非法"})
        try:
            data = self._read_body()
        except ValueError as exc:
            return _json(self, 413, {"error": "invalid_input", "message": str(exc)})
        if not data:
            return _json(self, 400, {"error": "invalid_input", "message": "请求体为空"})

        try:
            result = self.worker.submit(self._process, data, region, quality)
        except Busy as exc:
            return _json(self, 503, {"error": "busy", "message": str(exc)})
        except RepairUnavailable as exc:
            return _json(self, 503, {"error": "unconfigured", "message": str(exc)})
        except TimeoutError as exc:
            return _json(self, 504, {"error": "internal", "message": str(exc)})
        except Exception as exc:  # noqa: BLE001
            LOG.error("处理失败: %s\n%s", exc, traceback.format_exc(limit=3))
            return _json(self, 500, {"error": "internal", "message": repr(exc)})
        _bytes(self, 200, result)

    def _process(self, data: bytes, region: dict[str, int], quality: str) -> bytes:
        """临时文件落地 → 修补 → 读回 → 立刻删除（不留存用户素材）。"""
        with tempfile.TemporaryDirectory(prefix="nanbudo-job-") as tmp:
            src = pathlib.Path(tmp) / "src.mp4"
            dst = pathlib.Path(tmp) / "out.mp4"
            src.write_bytes(data)
            crf = 20 if quality == "standard" else 16
            repair_video(src, dst, region, crf=crf)
            return dst.read_bytes()

    def log_message(self, fmt: str, *args: Any) -> None:      # noqa: A003
        LOG.debug("%s - %s", self.address_string(), fmt % args)


class CloudServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def build_server(host: str, port: int, config: Config) -> CloudServer:
    accounts = AccountStore(config.accounts_path)
    worker = Worker(limit=config.queue_limit)
    handler = type("BoundApiHandler", (ApiHandler,),
                   {"config": config, "accounts": accounts, "worker": worker,
                    "started_at": time.time()})
    return CloudServer((host, port), handler)
