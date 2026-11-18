"""首页可用性门禁：起一次内核，按首页真实调用顺序打一遍接口。

判定：200 = 可用；501 = 明确未迁移/未接入（可接受）；其它 = 异常。
用法：python tools/check_homepage.py
"""

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
CARD = "DW-PWMB-AXYU-ASP8-C8H8-5X4P-ZSZW-RQ7G-QGTJ"
CHECK_DEVICE = "homepage-check-device"


def _seed_license(data: pathlib.Path) -> None:
    """首页检查跑在"已登录"状态：导入卡并激活固定设备。"""
    sys.path.insert(0, str(ROOT))
    from domain.license import LicenseStore
    from domain.license.service import LicenseService, DEFAULT_FEATURES

    store = LicenseStore(data / "license.db")
    try:
        store.import_card(CARD, days=0, features=DEFAULT_FEATURES, note="homepage gate")
        LicenseService(store).activate(CHECK_DEVICE, CARD)
    finally:
        store.close()
CHECKS = [
    ("GET", "/"), ("GET", "/api/health"), ("GET", "/api/runtime/status"),
    ("GET", "/api/session/status"), ("GET", "/api/license/status"),
    ("GET", "/api/client/config"), ("GET", "/api/tasks"), ("GET", "/api/history"),
    ("GET", "/api/history/policy"), ("GET", "/api/model-profiles"),
    ("GET", "/api/subtitle/capabilities"), ("GET", "/api/subtitle/list"),
    ("GET", "/api/voices/catalog"), ("GET", "/api/visual/projects"),
    ("GET", "/api/visual/styles"), ("GET", "/api/rewrite-projects"),
    ("GET", "/api/breakdown/projects"), ("GET", "/api/prompt-reverse/projects"),
    ("GET", "/api/ecommerce-showcase"), ("GET", "/api/ecommerce/"),
    ("GET", "/api/store/projects"), ("GET", "/api/hall/downloads"),
    ("GET", "/api/canvas/list"), ("GET", "/api/asset-library/"),
    ("GET", "/api/tutorials"), ("GET", "/api/local-cache"),
    ("GET", "/api/storage/status"), ("GET", "/api/local-storage/settings"),
]


COOKIE: dict[str, str] = {}


def call(port: int, method: str, path: str):
    headers = {"X-Device-Code": CHECK_DEVICE, "User-Agent": "homepage-check"}
    if COOKIE.get("value"):
        headers["Cookie"] = COOKIE["value"]
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", method=method,
                                 headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.headers.get("content-type", ""), len(resp.read())
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get("content-type", ""), len(exc.read())
    except Exception as exc:  # noqa: BLE001
        return 0, repr(exc)[:60], 0


def main() -> int:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        data = pathlib.Path(tmp) / "data"
        data.mkdir()
        for name in ("model-config.json", "llm-profiles.json"):
            source = ROOT / "data" / name
            if source.exists():
                (data / name).write_bytes(source.read_bytes())
        _seed_license(data)
        proc = subprocess.Popen([sys.executable, "-m", "app.main", "--no-gui", "--port", "0",
                                 "--data-dir", str(data)], cwd=str(ROOT),
                                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        try:
            port = None
            for _ in range(80):
                files = list(data.glob("runtime-*.json"))
                if files:
                    port = json.loads(files[0].read_text(encoding="utf-8"))["port"]
                    break
                time.sleep(0.3)
            if port is None:
                print("内核未启动", (proc.stderr.read() or b"")[-400:])
                return 1
            print(f"[*] 内核端口 {port}")
            # 启动门控要求会话 Cookie：先登录，否则 GET / 会是 302
            login = urllib.request.Request(
                f"http://127.0.0.1:{port}/api/session/login",
                data=json.dumps({"cardKey": CARD}).encode(), method="POST",
                headers={"Content-Type": "application/json",
                         "X-Device-Code": CHECK_DEVICE,
                         "User-Agent": "homepage-check"})
            try:
                with urllib.request.urlopen(login, timeout=30) as resp:
                    raw = resp.headers.get("Set-Cookie") or ""
                    if raw:
                        COOKIE["value"] = raw.split(";")[0]
            except urllib.error.HTTPError:
                pass
            print(f"[*] 会话 Cookie {'已获取' if COOKIE.get('value') else '缺失'}")
            bad = []
            for method, path in CHECKS:
                status, ctype, size = call(port, method, path)
                mark = "OK " if status == 200 else ("501" if status == 501 else "!! ")
                print(f"  {mark} {method:<4} {path:<32} {status:<4} {size}B")
                if status not in (200, 501):
                    bad.append((path, status))
            print(f"\n合计 {len(CHECKS)} 项；异常 {len(bad)} 项")
            urllib.request.urlopen(urllib.request.Request(
                f"http://127.0.0.1:{port}/api/shutdown", data=b"{}", method="POST"),
                timeout=10)
            return 0 if not bad else 2
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait(timeout=5)


if __name__ == "__main__":
    sys.exit(main())
