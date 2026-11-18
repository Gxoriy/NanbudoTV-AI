"""启动门控验证：未登录必须回登录页；登录后放行；进程重启后再次要求登录。

会话只在内存里（`_SESSIONS`），所以"关掉软件再打开"等价于丢掉 Cookie——
这里用"同一设备已激活但不带 Cookie"来模拟这一刻。
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
UA = "Mozilla/5.0 gate-check"
steps: list[bool] = []


def request(port: int, method: str, path: str, *, cookie: str = "",
            body: dict | None = None):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=20)
    payload = json.dumps(body).encode() if body is not None else None
    headers = {"User-Agent": UA}
    if cookie:
        headers["Cookie"] = cookie
    if payload is not None:
        headers["Content-Type"] = "application/json"
        headers["Content-Length"] = str(len(payload))
    conn.request(method, path, body=payload, headers=headers)
    resp = conn.getresponse()
    data = resp.read()
    conn.close()
    return resp.status, dict(resp.getheaders()), data


def check(name: str, expected: int, status: int, detail: str = "") -> None:
    ok = status == expected
    steps.append(ok)
    print(f"[{'OK  ' if ok else 'FAIL'}] {name:<38}{status:<4}期望 {expected}  {detail}")


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

        status, headers, _ = request(port, "GET", "/")
        check("未登录 GET /", 302, status, headers.get("Location", ""))
        status, headers, _ = request(port, "GET", "/index.html")
        check("未登录 GET /index.html", 302, status, headers.get("Location", ""))

        status, headers, body = request(port, "POST", "/api/session/login",
                                        body={"cardKey": CARD})
        cookie = ""
        raw_cookie = headers.get("Set-Cookie") or headers.get("set-cookie") or ""
        if raw_cookie:
            cookie = raw_cookie.split(";")[0]
        check("POST session/login", 200, status, f"cookie={'有' if cookie else '无'}")
        check("登录应下发会话 Cookie", 200, 200 if cookie else 500, cookie[:24])

        status, _, body = request(port, "GET", "/", cookie=cookie)
        check("已登录 GET /", 200, status, f"{len(body)}B")

        # 模拟"关掉软件再打开"：同一台已激活设备，但内存会话已清空（无 Cookie）
        status, headers, _ = request(port, "GET", "/")
        check("重启后（无 Cookie）GET /", 302, status, headers.get("Location", ""))

        status, _, _ = request(port, "GET", "/visual.html")
        check("深链 /visual.html 不拦", 200, status)
        status, _, _ = request(port, "GET", "/login.html")
        check("登录页自身可达", 200, status)

        request(port, "POST", "/api/shutdown", cookie=cookie, body={})
        failed = steps.count(False)
        print(f"\n合计 {len(steps)} 步，失败 {failed}")
        return 0 if not failed else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
