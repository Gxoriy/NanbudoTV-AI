"""启动目标程序并探测其本地 HTTP 端口（只读探测）。

用法：
  python scripts/discover_port.py --exe "...NanbudoTV·AI.exe" [--wait 40] [--keep]
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

NETSTAT_PID_RE = re.compile(r"\s+TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$")


def ports_of(pid: int) -> list[int]:
    try:
        out = subprocess.check_output(["netstat", "-ano", "-p", "TCP"],
                                      text=True, errors="replace")
    except subprocess.CalledProcessError:
        return []
    ports = []
    for line in out.splitlines():
        m = NETSTAT_PID_RE.search(line)
        if m and int(m.group(2)) == pid:
            ports.append(int(m.group(1)))
    return sorted(set(ports))


def probe(port: int, path: str, timeout: float = 3.0) -> dict:
    url = f"http://127.0.0.1:{port}{path}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read(400)
            return {"path": path, "status": resp.status, "body": body.decode("utf-8", "replace")}
    except urllib.error.HTTPError as exc:
        return {"path": path, "status": exc.code,
                "body": exc.read(200).decode("utf-8", "replace")}
    except Exception as exc:  # noqa: BLE001
        return {"path": path, "status": None, "error": repr(exc)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--exe", required=True)
    ap.add_argument("--wait", type=float, default=45.0)
    ap.add_argument("--keep", action="store_true", help="探测后保留进程")
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    exe = pathlib.Path(args.exe)
    if not exe.exists():
        raise SystemExit(f"exe 不存在: {exe}")

    print(f"[*] 启动 {exe.name}")
    proc = subprocess.Popen([str(exe)], cwd=str(exe.parent))
    print(f"[*] pid={proc.pid}")

    open_port = None
    deadline = time.time() + args.wait
    while time.time() < deadline:
        if proc.poll() is not None:
            print(f"[!] 进程已退出，returncode={proc.returncode}")
            return 2
        for port in ports_of(proc.pid):
            r = probe(port, "/api/health")
            if r.get("status") is not None:
                open_port = port
                print(f"[*] 命中端口 {port}: {r['status']} {r['body'][:200]}")
                break
        if open_port:
            break
        time.sleep(1.5)

    if not open_port:
        print("[!] 未发现 HTTP 端口")
        if not args.keep:
            proc.terminate()
        return 3

    result = {"pid": proc.pid, "port": open_port,
              "probes": [probe(open_port, p) for p in
                         ("/api/health", "/api/client/config", "/api/tasks",
                          "/api/license/status", "/api/model-profiles")]}
    for r in result["probes"]:
        print(f"  {r['path']} -> {r.get('status')} {str(r.get('body'))[:160]}")

    if args.out:
        pathlib.Path(args.out).write_text(
            json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    if not args.keep:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        print("[*] 已退出目标进程")
    return 0


if __name__ == "__main__":
    sys.exit(main())
