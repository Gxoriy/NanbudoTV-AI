"""抓取关键只读接口的真实响应样本，供 P1/P3 写 schema 时对照。

产出 spec/api-samples/<slug>.json（每个端点的完整响应 + 状态码）。
只调用 GET 只读端点，不触发任何扣费或写盘行为。
"""

from __future__ import annotations

import json
import pathlib
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "spec" / "api-samples"
EXE = pathlib.Path(r"F:\WorkAPP\短剧改写工作台\NanbudoTV·AI.exe")
NETSTAT_PID_RE = re.compile(r"\s+TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$")

ENDPOINTS = [
    "/api/health",
    "/api/model-profiles",
    "/api/runtime/status",
    "/api/tasks",
    "/api/history",
    "/api/license/status",
    "/api/client/config",
    "/api/session/status",
    "/api/storage/status",
    "/api/local-storage/settings",
    "/api/local-cache",
    "/api/rewrite-projects",
    "/api/breakdown/projects",
    "/api/prompt-reverse/projects",
    "/api/visual/projects",
    "/api/visual/styles",
    "/api/canvas/list",
    "/api/subtitle/capabilities",
    "/api/subtitle/projects",
    "/api/subtitle/list",
    "/api/voices/catalog",
    "/api/ecommerce-showcase",
    "/api/hall/downloads",
]


def ports_of(pid: int) -> list[int]:
    out = subprocess.check_output(["netstat", "-ano", "-p", "TCP"], text=True, errors="replace")
    ports = set()
    for line in out.splitlines():
        m = NETSTAT_PID_RE.search(line)
        if m and int(m.group(2)) == pid:
            ports.add(int(m.group(1)))
    return sorted(ports)


def fetch(port: int, path: str) -> dict:
    url = f"http://127.0.0.1:{port}{path}"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            raw = resp.read()
            status = resp.status
    except urllib.error.HTTPError as exc:
        raw, status = exc.read(), exc.code
    except Exception as exc:  # noqa: BLE001
        return {"path": path, "status": None, "error": repr(exc)}
    try:
        body = json.loads(raw.decode("utf-8", "replace"))
    except json.JSONDecodeError:
        body = {"_raw": raw[:2000].decode("utf-8", "replace")}
    return {"path": path, "status": status, "body": body}


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    proc = subprocess.Popen([str(EXE)], cwd=str(EXE.parent))
    port = None
    deadline = time.time() + 60
    while time.time() < deadline and port is None:
        if proc.poll() is not None:
            raise SystemExit("目标进程提前退出")
        for p in ports_of(proc.pid):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{p}/api/health", timeout=2) as r:
                    if r.status == 200:
                        port = p
                        break
            except Exception:  # noqa: BLE001
                continue
        time.sleep(1.5)

    if port is None:
        proc.terminate()
        raise SystemExit("未发现 HTTP 端口")

    print(f"[*] 端口 {port}")
    index = {}
    for path in ENDPOINTS:
        rec = fetch(port, path)
        slug = path.strip("/").replace("/", "_")
        (OUT / f"{slug}.json").write_text(
            json.dumps(rec, ensure_ascii=False, indent=2), encoding="utf-8")
        index[path] = rec["status"]
        size = len(json.dumps(rec.get("body", {}), ensure_ascii=False))
        print(f"    {path:<34} {rec['status']}  {size}B")

    (OUT / "_index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
    print(f"[*] 样本 {len(index)} 份 -> {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
