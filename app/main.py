"""进程入口（P1-01）。

硬性要求（来自打包踩坑清单，缺一项就会在真机上翻车）：
  1. `multiprocessing.freeze_support()` 必须在最前面，且全部逻辑在 `if __name__ == "__main__"`
     —— 缺了它，冻结后子进程会无限重启并弹一堆窗口
  2. 端口必须动态分配（旧实现写死 8765，多开必冲突），并用回写文件告知端口
  3. 服务线程必须 daemon 化，否则退出时进程挂住
  4. 桌面壳 WebView 只做承载，业务一律走 HTTP（保证将来能去壳做 Web 版）
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import signal
import socket
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from app import APP_NAME, __version__
from app.api import Request, Response, Router, parse_query
from app.api import license as license_api
from app.api import commerce as commerce_api
from app.api import compat as compat_api
from app.api import hall as hall_api
from app.api import media_extra
from app.api import history as history_api
from app.api import rewrite as rewrite_api
from app.api import session as session_api
from app.api import storage as storage_api
from app.api import subtitle as subtitle_api
from app.api import system as system_api
from app.api import visual as visual_api
from app.api import visual_extra
from app.api import visual_stage
from app.api import visual_tail
from app.api import voice as voice_api
from domain.license import LicenseService, LicenseStore
from domain.subtitle import SubtitleService, SubtitleStore
from domain.ai import TextAssist
from domain.visual import VisualService
from domain.visual.assist import VisualAssist
from domain.visual.assets import AssetStore
from domain.visual.library import LibraryStore
from domain.visual.video import VideoPipeline
from domain.workspace import DocStore
from domain.visual.store import VisualStore
from domain.voice import VoiceService
from domain.voice.store import VoiceJobStore
from infra import llm
from infra.media.images import ImageConfig
from infra.media.videos import VideoConfig
from infra.obs import HealthRegistry, install as install_logging
from infra.tasks import TaskStore

ROOT = Path(__file__).resolve().parents[1]
LOG = logging.getLogger("app")
MAX_BODY_BYTES = 64 * 1024 * 1024      # 略高于 50MB 上限，留出协议开销

_shutdown = threading.Event()
_port_ref: dict[str, int] = {"port": 0}


def request_shutdown() -> None:
    """由 /api/shutdown 或桌面壳关闭事件调用。"""
    LOG.info("收到退出请求")
    _shutdown.set()


MIME_TYPES = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
    ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav",
    ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
}


class Handler(BaseHTTPRequestHandler):
    server_version = f"NanbudoKernel/{__version__}"
    protocol_version = "HTTP/1.1"
    router: Router
    static_dir: Path = ROOT / "static"

    def _serve_static(self, url_path: str) -> bool:
        """非 /api 请求交给 static/（桌面壳与浏览器直接用同一套前端）。

        前端页面里资源引用写的是绝对路径 `/static/xxx.js`（旧服务端就是这么挂的），
        所以这里要同时支持 `/static/x` 与 `/x` 两种写法，否则所有 JS/CSS 全 404。
        """
        path = url_path
        if path.startswith("/static/"):
            path = path[len("/static"):]
        rel = path.lstrip("/") or "index.html"
        if rel.endswith("/"):
            rel += "index.html"
        target = (self.static_dir / rel).resolve()
        try:
            target.relative_to(self.static_dir.resolve())
        except ValueError:
            return False
        if not target.is_file():
            return False
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type",
                         MIME_TYPES.get(target.suffix.lower(), "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)
        return True

    def _serve(self) -> None:
        from urllib.parse import urlparse
        parsed = urlparse(self.path)
        if self.command == "GET" and not parsed.path.startswith("/api/"):
            if self._serve_static(parsed.path):
                return
            # 静态资源缺失要明确 404，不能掉进 /api 的 501 兜底（前端会误判"未迁移"）
            body = b"404 Not Found"
            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY_BYTES:                 # 先挡体积，避免把内存读爆
            resp = Response.error(413, "too_large",
                                  "首版支持不超过50MB的原片，不会自动压缩。")
            body = b""
            length = 0
        else:
            body = self.rfile.read(length) if length else b""
            req = Request(
                method=self.command,
                path=self.path,
                query=parse_query(parsed.query),
                headers={k.lower(): v for k, v in self.headers.items()},
                body=body,
            )
            try:
                resp = self.router.dispatch(req)
            except Exception as exc:  # noqa: BLE001
                LOG.exception("未捕获异常")
                resp = Response.error(500, "internal", repr(exc))

        payload = resp.body_bytes()
        self.send_response(resp.status)
        self.send_header("Content-Type", resp.content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        for key, value in resp.headers.items():
            if key.lower() in ("content-type", "content-length"):
                continue
            self.send_header(key, value)
        self.end_headers()
        if payload:
            self.wfile.write(payload)

    do_GET = _serve
    do_POST = _serve
    do_PUT = _serve
    do_DELETE = _serve
    do_PATCH = _serve

    def log_message(self, fmt: str, *args: Any) -> None:      # noqa: A003
        LOG.debug("%s - %s", self.address_string(), fmt % args)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def bind_server(host: str, port: int, router: Router,
                static_dir: Path | None = None) -> Server:
    """绑定端口。port=0 时由系统分配，彻底消除多开冲突。"""
    handler = type("BoundHandler", (Handler,),
                   {"router": router, "static_dir": static_dir or ROOT / "static"})
    return Server((host, port), handler)


def pid_alive(pid: int) -> bool:
    """Windows/Unix 通用的存活探测，避免残留 runtime 文件误导前端连错端口。"""
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except PermissionError:
        return True                      # 存在但无权限
    except (OSError, ValueError):
        return False
    return True


def _writable(data_dir: Path) -> bool:
    """健康位用：真写一次再删，比 os.access 可靠（Windows ACL 会让 access 说谎）。"""
    probe = data_dir / f".health-{os.getpid()}.tmp"
    try:
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
        return True
    except OSError:
        return False


def cleanup_stale_runtime_files(data_dir: Path) -> int:
    removed = 0
    for path in data_dir.glob("runtime-*.json"):
        try:
            pid = int(json.loads(path.read_text(encoding="utf-8")).get("pid", 0))
        except (json.JSONDecodeError, OSError, ValueError):
            pid = 0
        if not pid_alive(pid):
            try:
                path.unlink()
                removed += 1
            except OSError:
                pass
    return removed


def write_runtime_file(data_dir: Path, port: int, host: str) -> Path:
    path = data_dir / f"runtime-{os.getpid()}.json"
    path.write_text(json.dumps({
        "pid": os.getpid(),
        "host": host,
        "port": port,
        "baseUrl": f"http://{host}:{port}",
        "version": __version__,
        "startedAt": time.time(),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def run_gui(url: str) -> bool:
    """尝试用 pywebview 承载；未安装则返回 False 由调用方降级。"""
    try:
        import webview  # type: ignore
    except Exception:  # noqa: BLE001
        LOG.warning("未安装 pywebview，桌面壳不可用（可用 --no-gui 显式声明）")
        return False

    window = webview.create_window(APP_NAME, url, width=1440, height=920, min_size=(1200, 800))

    def on_closed() -> None:
        request_shutdown()

    try:
        window.events.closed += on_closed
    except Exception:  # noqa: BLE001
        LOG.debug("窗口 closed 事件挂载失败，忽略")

    webview.start()      # 阻塞直到窗口关闭
    return True


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=f"{APP_NAME} {__version__}")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=0, help="0 = 由系统分配（推荐）")
    ap.add_argument("--data-dir", default=str(ROOT / "data"))
    ap.add_argument("--no-gui", action="store_true", help="只起 HTTP 服务，不开窗口")
    ap.add_argument("--static-dir", default=str(ROOT / "static"),
                    help="前端静态目录（默认项目内 static/）")
    ap.add_argument("--log-level", default="INFO")
    args = ap.parse_args(argv)

    install_logging(level=getattr(logging, args.log_level.upper(), logging.INFO),
                    fmt="%(asctime)s %(levelname)s %(name)s %(message)s")

    data_dir = Path(args.data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)

    removed = cleanup_stale_runtime_files(data_dir)
    if removed:
        LOG.info("清理残留运行时文件 %d 个", removed)

    store = TaskStore(data_dir / "state.db")
    interrupted = store.interrupt_running()
    if interrupted:
        LOG.warning("检测到 %d 个上次未完成的任务，已标记为 interrupted: %s",
                    len(interrupted), interrupted[:5])

    provider_count = llm.load_builtin()
    profiles = llm.ProfileStore(data_dir / "llm-profiles.json")
    LOG.info("LLM provider %d 家已注册: %s", provider_count,
             [p.name for p in llm.all_providers()])

    subtitle_store = SubtitleStore(data_dir / "subtitle.db")
    subtitle_service = SubtitleService(
        subtitle_store, data_dir / "subtitle-config.json",
        storage_root=data_dir / "subtitle", task_store=store)

    health = HealthRegistry()
    health.register("tasks", lambda: (store.snapshot()["activeCount"] >= 0, "任务表可读"),
                    critical=True)
    health.register("data_dir", lambda: (_writable(data_dir), str(data_dir)), critical=True)
    health.register("llm", lambda: (len(list(llm.all_providers())) > 0,
                                    f"{len(list(llm.all_providers()))} 家 provider"))
    license_store = LicenseStore(data_dir / "license.db")
    license_service = LicenseService(license_store)
    visual_service = VisualService(data_dir / "visual-styles.json",
                                   store=VisualStore(data_dir / "visual.db"),
                                   workspace=data_dir / "visual")
    visual_assets = AssetStore(data_dir / "assets.db")
    visual_library = LibraryStore(data_dir / "visual-library.db",
                                  files_root=data_dir / "visual" / "files")
    voice_service = VoiceService(
        store=VoiceJobStore(data_dir / "voice.db"), task_store=store,
        workspace=data_dir / "voice")
    _voice = voice_service.catalog()
    LOG.info("配音音色 %d 个（可用 %d）", _voice["systemCount"], _voice["readyCount"])

    health.register("license", lambda: (True, "卡密库可读"), critical=False)
    health.register("voice", lambda: (voice_service.available(),
                                      "本地语音引擎可用" if voice_service.available()
                                      else "本地语音引擎不可用（缺 PowerShell/语音包）"))
    health.register("subtitle", lambda: (
        True,
        ("云端已配置" if subtitle_service.is_configured() else "云端未配置，本地可用")
        + ("；像素修补可用" if subtitle_service.capabilities()["localRepair"][0]
           else "；像素修补不可用（缺 ffmpeg/numpy）")))

    workspace = DocStore(data_dir / "workspace.db", files_root=data_dir / "workspace")

    router = Router()
    system_api.build(router, store, app_name=APP_NAME, version=__version__,
                     port_ref=_port_ref, on_shutdown=request_shutdown,
                     profiles=profiles, health_registry=health,
                     workspace=workspace, data_dir=data_dir)
    subtitle_api.build(router, subtitle_service)
    license_api.build(router, license_service)
    session_api.build(router, license_service, workspace, version=__version__,
                      install_root=ROOT)
    voice_api.build(router, voice_service)
    media_extra.build(router, workspace, data_dir=data_dir,
                      voice_service=voice_service)
    visual_api.build(router, visual_service)
    video_pipeline = VideoPipeline(visual_library, store,
                                   VideoConfig.load(data_dir / "model-config.json"))
    visual_tail.build(router, visual_service, visual_library, store=workspace,
                      assist=TextAssist(data_dir / "llm-profiles.json"),
                      video_pipeline=video_pipeline, task_store=store)
    history_api.build(router, workspace, outputs_root=data_dir / "outputs")
    rewrite_api.build(router, workspace, video_pipeline=video_pipeline,
                      assist=TextAssist(data_dir / "llm-profiles.json"),
                      task_store=store)
    compat_api.build(router, workspace, assist=TextAssist(data_dir / "llm-profiles.json"),
                     task_store=store, files_root=data_dir / "workspace")
    commerce_api.build(router, workspace,
                       assist=TextAssist(data_dir / "llm-profiles.json"))
    hall_api.build(router, workspace, downloads_root=data_dir / "outputs" / "downloads")
    storage_api.build(router, workspace, data_dir=data_dir, install_root=ROOT)
    visual_stage.build(router, visual_service, visual_library,
                       assist=VisualAssist(profiles_path=data_dir / "llm-profiles.json"))
    visual_extra.build(router, visual_service, visual_library,
                       assets_store=visual_assets,
                       video_pipeline=video_pipeline,
                       images=ImageConfig.load(data_dir / "model-config.json"),
                       task_store=store,
                       assist=VisualAssist(profiles_path=data_dir / "llm-profiles.json"))

    server = bind_server(args.host, args.port, router, static_dir=Path(args.static_dir))
    port = server.server_address[1]
    _port_ref["port"] = port
    runtime_file = write_runtime_file(data_dir, port, args.host)
    LOG.info("%s %s 已启动 http://%s:%d", APP_NAME, __version__, args.host, port)
    LOG.info("运行时信息: %s", runtime_file)

    thread = threading.Thread(target=server.serve_forever, name="http", daemon=True)
    thread.start()

    def _sigterm(_signum, _frame) -> None:
        request_shutdown()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, _sigterm)
        except (ValueError, OSError):
            pass

    exit_code = 0
    try:
        if not args.no_gui and run_gui(f"http://{args.host}:{port}/index.html"):
            pass                                    # 窗口关闭后自然退出
        else:
            while not _shutdown.is_set():
                _shutdown.wait(0.5)
    finally:
        server.shutdown()
        server.server_close()
        workspace.close()
        visual_assets.close()
        visual_library.close()
        if visual_service.store is not None:
            visual_service.store.close()
        if voice_service.store is not None:
            voice_service.store.close()
        license_store.close()
        subtitle_store.close()
        store.close()
        try:
            runtime_file.unlink()
        except OSError:
            pass
        LOG.info("已退出")
    return exit_code


if __name__ == "__main__":
    from multiprocessing import freeze_support
    freeze_support()          # 必须在任何子进程逻辑之前
    sys.exit(main())
