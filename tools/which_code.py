"""确认"现在跑的是不是新代码"。

读 local git HEAD + 源码指纹，和所有 data/runtime-*.json 对应的在线内核
的 /api/health 对比，输出 MATCH / STALE / OFFLINE。

用法：
    .\\.venv\\Scripts\\python.exe tools\\which_code.py
"""

from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import build_info  # noqa: E402


def _health(base_url: str, timeout: float = 2.0) -> dict:
    req = urllib.request.Request(base_url.rstrip("/") + "/api/health",
                                 headers={"User-Agent": "which-code"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode() or "{}")
    except (OSError, urllib.error.URLError, json.JSONDecodeError,
            TimeoutError) as exc:
        return {"error": str(exc)[:80]}


def _processes() -> list[str]:
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" "
             "| Where-Object { $_.CommandLine -like '*app.main*' } "
             "| ForEach-Object { \"$($_.ProcessId): $($_.CommandLine)\" }"],
            cwd=str(ROOT), capture_output=True, text=True, timeout=10,
            check=False)
        return [line.strip() for line in result.stdout.splitlines() if line.strip()]
    except (OSError, subprocess.SubprocessError):
        return []


def main() -> int:
    kill_stale = "--kill-stale" in sys.argv
    local_commit = build_info.COMMIT
    local_hash = build_info.CODE_HASH
    print(f"本地工作区  commit={local_commit}  codeHash={local_hash}")

    runtimes = sorted((ROOT / "data").glob("runtime-*.json"))
    if not runtimes:
        print("\n[!] data/ 下没有 runtime-*.json —— 当前没有通过本仓库启动的内核。")
    verdicts: list[str] = []
    for path in runtimes:
        try:
            info = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        pid = info.get("pid", 0)
        base = info.get("baseUrl") or f"http://{info.get('host')}:{info.get('port')}"
        live = _health(base)
        running_commit = live.get("commit") or info.get("commit") or "?"
        running_hash = live.get("codeHash") or info.get("codeHash") or "?"
        online = not live.get("error")
        same = online and running_hash == local_hash
        verdict = "MATCH" if same else ("STALE" if online else "OFFLINE")
        verdicts.append(verdict)
        started = info.get("startedAt") or 0
        age = f"{(time.time() - started) / 60:.1f} 分钟" if started else "?"
        print(f"\n[{verdict}] pid={pid}  {base}")
        print(f"       运行 commit={running_commit} codeHash={running_hash}")
        print(f"       本地 commit={local_commit} codeHash={local_hash}")
        print(f"       已运行 {age}  健康接口={live.get('error') or '正常'}")

    if kill_stale:
        for path, verdict in zip(runtimes, verdicts):
            if verdict == "MATCH":
                continue
            try:
                pid = json.loads(path.read_text(encoding="utf-8")).get("pid", 0)
            except (OSError, json.JSONDecodeError):
                continue
            if not pid:
                continue
            result = subprocess.run(["taskkill", "/PID", str(pid), "/F"],
                                    cwd=str(ROOT), capture_output=True,
                                    text=True, check=False)
            print(f"[kill] pid={pid} rc={result.returncode}")

    procs = _processes()
    if procs:
        print("\n当前 app.main 进程：")
        for line in procs:
            print("  ", line[:160])

    if not verdicts:
        return 2
    if all(v == "MATCH" for v in verdicts):
        print("\n结论：全部运行实例与当前代码一致。")
        return 0
    print("\n结论：存在 STALE/OFFLINE 实例。重启后再验："
          " .\\scripts\\start.ps1（或 .\\[NoGui]），然后重跑本脚本。")
    return 3


if __name__ == "__main__":
    raise SystemExit(main())
