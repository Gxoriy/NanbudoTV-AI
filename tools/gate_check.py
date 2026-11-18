"""验证启动门控：未激活访问 / 必须 302 到 /login.html，登录后同一 UA 放行。

用 http.client 而不是 urllib：需要看到 302 本身（urllib 会自动跟随）。
"""

from __future__ import annotations

import http.client
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
CARD = "DW-PWMB-AXYU-ASP8-C8H8-5X4P-ZSZW-RQ7G-QGTJ"
UA_A = "Mozilla/5.0 gate-check-A"
UA_B = "Mozilla/5.0 gate-check-B"


def request(port: int, method: str, path: str, ua: str,
            body: dict | None = None):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=20)
    payload = json.dumps(body).encode() if body is not None else None
    headers = {"User-Agent": ua}
    if payload is not None:
        headers["Content-Type"] = "application/json"
        headers["Content-Length"] = str(len(payload))
    conn.request(method, path, body=payload, headers=headers)
    resp = conn.getresponse()
    data = resp.read()
    conn.close()
    return resp.status, dict(resp.getheaders()), data


def main() -> int:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="gate-"))
    for name in ("llm-profiles.json", "model-config.json"):
        source = ROOT / "data" / name
        if source.exists():
            shutil.copy2(source, tmp / name)
    sys.path.insert(0, str(ROOT))
    from domain.license import LicenseStore
    from domain.license.service import DEFAULT_FEATURES

    store = LicenseStore(tmp / "license.db")
    store.import_card(CARD, days=0, features=DEFAULT_FEATURES, note="gate check")
    store.close()

    proc = subprocess.Popen([sys.executable, "-m", "app.main", "--no-gui", "--port", "0",
                             "--data-dir", str(tmp)], cwd=str(ROOT),
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        port = None
        for _ in range(120):
            files = list(tmp.glob("runtime-*.json"))
            if files:
                port = json.loads(files[0].read_text(encoding="utf-8"))["port"]
                break
            time.sleep(0.3)
        if port is None:
            print("[!] 内核未启动")
            return 1
        print(f"[*] 端口 {port}\n")

        steps = []

        def check(name: str, expected: int, status: int, detail: str = "") -> None:
            ok = status == expected
            steps.append(ok)
            print(f"[{'OK  ' if ok else 'FAIL'}] {name:<34}{status:<4}期望 {expected}  {detail}")

        status, headers, _ = request(port, "GET", "/", UA_A)
        check("未激活 GET /", 302, status, headers.get("Location", ""))
        status, headers, _ = request(port, "GET", "/index.html", UA_A)
        check("未激活 GET /index.html", 302, status, headers.get("Location", ""))

        status, _, body = request(port, "POST", "/api/session/login", UA_A,
                                  {"cardKey": CARD})
        check("POST session/login（UA-A）", 200, status,
              str(json.loads(body or b"{}").get("authenticated")))

        status, _, body = request(port, "GET", "/", UA_A)
        check("已激活 GET /（同一 UA）", 200, status, f"{len(body)}B")

        status, headers, _ = request(port, "GET", "/", UA_B)
        check("未登录 UA-B GET /", 302, status, "设备码不同仍拦")

        status, _, _ = request(port, "GET", "/visual.html", UA_B)
        check("深链 /visual.html 不拦", 200, status, "自动化审计需要直达")

        status, _, _ = request(port, "GET", "/login.html", UA_A)
        check("登录页自身可达", 200, status)

        request(port, "POST", "/api/shutdown", UA_A, {})
        failed = steps.count(False)
        print(f"\n合计 {len(steps)} 步，失败 {failed}")
        return 0 if not failed else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
