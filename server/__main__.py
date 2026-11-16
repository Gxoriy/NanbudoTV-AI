"""启动云端服务：python -m server --port 8787

默认只监听 127.0.0.1，由 nginx 做 TLS 终止与 64MB 上传限制；
证书与私钥在 F:\\Note\\服务器（不入库）。
"""

from __future__ import annotations

import argparse
import logging
import pathlib
import secrets
import signal
import sys
import threading
import time

from infra.obs import install as install_logging
from server.app import Config, build_server

ROOT = pathlib.Path(__file__).resolve().parents[1]


def ensure_secret(path: pathlib.Path) -> str:
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    path.parent.mkdir(parents=True, exist_ok=True)
    value = secrets.token_urlsafe(48)
    path.write_text(value, encoding="utf-8")
    print(f"[*] 已生成服务端签名密钥: {path}")
    return value


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="server")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--config-dir", default=str(ROOT / "server-config"))
    ap.add_argument("--allow-anonymous", action="store_true",
                    help="不校验令牌（仅本机自测；公网禁止）")
    ap.add_argument("--log-level", default="INFO")
    args = ap.parse_args(argv)

    install_logging(level=getattr(logging, args.log_level.upper(), logging.INFO))
    log = logging.getLogger("server")

    config_dir = pathlib.Path(args.config_dir)
    secret = ensure_secret(config_dir / "secret.txt")
    config = Config(
        secret=secret,
        accounts_path=config_dir / "accounts.json",
        data_dir=config_dir / "data",
        allow_anonymous=args.allow_anonymous,
    )
    config.data_dir.mkdir(parents=True, exist_ok=True)

    server = build_server(args.host, args.port, config)
    port = server.server_address[1]
    log.info("云端服务已启动 http://%s:%d", args.host, port)
    stop = threading.Event()

    def _stop(_sig, _frame) -> None:
        stop.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, _stop)
        except (ValueError, OSError):
            pass

    threading.Thread(target=server.serve_forever, name="http", daemon=True).start()
    try:
        while not stop.is_set():
            stop.wait(0.5)
    finally:
        server.shutdown()
        server.server_close()
        log.info("云端服务已退出")
    return 0


if __name__ == "__main__":
    from multiprocessing import freeze_support
    freeze_support()
    sys.exit(main())
