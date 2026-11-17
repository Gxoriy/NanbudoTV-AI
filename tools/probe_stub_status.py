"""实测兜底路由的真实状态码（起内核走 HTTP，避免猜）。"""

from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

PATHS = [
    ("POST", "/api/marketing/analyze"),
    ("POST", "/api/marketing/generate"),
    ("GET", "/api/link/cover?url=https%3A%2F%2Fexample.com"),
    ("GET", "/api/link/stream?url=https%3A%2F%2Fexample.com"),
    ("POST", "/api/breakdown/motion"),
    ("POST", "/api/breakdown/motion-runtime"),
    ("POST", "/api/breakdown/reference-workflow"),
    ("GET", "/api/visual/project/source?id=x"),
    ("POST", "/api/visual/project/prepare"),
    ("POST", "/api/visual/project/scenes"),
    ("POST", "/api/visual/assets/analyze"),
    ("POST", "/api/visual/assets/delete"),
    ("POST", "/api/visual/cut-storyboard"),
    ("POST", "/api/visual/episode-cut"),
    ("POST", "/api/visual/script-storyboard"),
    ("POST", "/api/visual/episode/video/reset"),
    ("POST", "/api/visual/episode/settings"),
    ("GET", "/api/visual/episode/state?projectId=p1"),
    ("POST", "/api/visual/episode/prompt"),
    ("POST", "/api/visual/episode/references"),
    ("GET", "/api/visual/video-preview?id=x"),
    ("POST", "/api/visual/archive"),
    ("GET", "/api/visual/download?id=x"),
    ("GET", "/api/visual/macro/state?projectId=p1"),
    ("POST", "/api/visual/macro/quote"),
    ("POST", "/api/visual/macro/submit"),
    ("POST", "/api/visual/macro/card/draft"),
    ("POST", "/api/visual/macro/recover"),
    ("POST", "/api/visual/macro/media/detach"),
]


def call(port: int, method: str, path: str):
    body = b"{}" if method == "POST" else None
    request = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=body,
                                     method=method,
                                     headers={"Content-Type": "application/json"}
                                     if body else {})
    try:
        with urllib.request.urlopen(request, timeout=30) as resp:
            raw = resp.read()
            try:
                return resp.status, json.loads(raw.decode() or "{}")
            except (json.JSONDecodeError, UnicodeDecodeError):
                return resp.status, {"_bytes": len(raw)}
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw.decode() or "{}")
        except (json.JSONDecodeError, UnicodeDecodeError):
            return exc.code, {"_bytes": len(raw)}


def main() -> int:
    data_dir = pathlib.Path(tempfile.mkdtemp(prefix="stub-probe-"))
    proc = subprocess.Popen([sys.executable, "-m", "app.main", "--no-gui", "--port", "0",
                             "--data-dir", str(data_dir)], cwd=str(ROOT),
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        port = None
        for _ in range(100):
            files = list(data_dir.glob("runtime-*.json"))
            if files:
                port = json.loads(files[0].read_text(encoding="utf-8"))["port"]
                break
            time.sleep(0.3)
        if port is None:
            print("内核未启动")
            return 1
        for method, path in PATHS:
            status, payload = call(port, method, path)
            print(f"{status:<4} {method:<5} {path:<48} "
                  f"{payload.get('error') or 'ok':<22} {str(payload.get('message') or '')[:36]}")
        urllib.request.urlopen(urllib.request.Request(
            f"http://127.0.0.1:{port}/api/shutdown", data=b"{}", method="POST"), timeout=10)
        return 0
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
