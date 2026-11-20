"""把原版 exe 抓到的请求逐条回放至我们的内核，验证契约对齐。"""

from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
CAPTURE = ROOT / ".local" / "exe-capture-routes.json"
CARD = "DW-44HD-SU9H-NE6M-EZM4-ZUM2-PWGE-85HY-2MFB"


def replay(port: int, method: str, path: str, body: str, cookie: str) -> tuple[int, str]:
    headers = {"Content-Type": "application/json"}
    if cookie:
        headers["Cookie"] = cookie
    data = body.encode() if body and method == "POST" else None
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data,
                                 method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")[:160]
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")[:160]
    except (OSError, TimeoutError) as exc:
        return 0, str(exc)[:100]


def main() -> int:
    data = json.loads(CAPTURE.read_text(encoding="utf-8"))
    calls = [c for c in data["calls"] if not c["url"].startswith("/api/session/login")]
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="replay-exe-"))
    for name in ("llm-profiles.json", "model-config.json"):
        s = ROOT / "data" / name
        if s.exists():
            shutil.copy2(s, tmp / name)
    sys.path.insert(0, str(ROOT))
    from domain.license import LicenseStore
    from domain.license.service import DEFAULT_FEATURES

    store = LicenseStore(tmp / "license.db")
    store.import_card(CARD, days=0, features=DEFAULT_FEATURES, note="replay")
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
        print("[*] 内核端口", port)

        login_req = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/session/login",
            data=json.dumps({"cardKey": CARD}).encode(), method="POST",
            headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(login_req, timeout=20) as resp:
            cookie = (resp.headers.get("Set-Cookie") or "").split(";")[0]
        print("[*] 登录 cookie", cookie[:24])

        mismatches = []
        for call in calls:
            method = call.get("method") or "GET"
            path = call.get("url") or ""
            code, body = replay(port, method, path, call.get("body") or "", cookie)
            ok = code == int(call.get("status") or 0)
            print(f"[{'OK  ' if ok else 'DIFF'}] {method:<5} {path[:54]:<54} "
                  f"exe={call.get('status')} ours={code}")
            if not ok:
                mismatches.append({"path": path, "exe": call.get("status"),
                                   "ours": code, "body": body})
        print(f"\n回放 {len(calls)} 条，差异 {len(mismatches)}")
        (ROOT / ".local" / "exe-replay.json").write_text(
            json.dumps(mismatches, ensure_ascii=False, indent=1), encoding="utf-8")
        return 0 if not mismatches else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
