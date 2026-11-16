"""P0-06 基线冒烟集：真实启动打包后的 exe，按域探测接口 + 校验 GUI 真实渲染。

两种模式：
  --record   记录当前行为为基线（spec/smoke-baseline.json）
  --check    与基线比对（迁移期门禁；默认模式）

判定口径（重要）：
  基线比对的是"状态码 + 顶层 JSON 结构 + 是否存在"，不比对业务数据本身。
  这样重启/换项目不会误报，而路由丢失/字段改名/返回结构变了会立刻失败。
"""

from __future__ import annotations

import argparse
import ctypes
import ctypes.wintypes as wt
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = ROOT / "spec"
BASELINE = SPEC / "smoke-baseline.json"

EXE_DEFAULT = pathlib.Path(r"F:\WorkAPP\短剧改写工作台\NanbudoTV·AI.exe")
NETSTAT_PID_RE = re.compile(r"\s+TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$")

# 每个域 3 条只读端点（只选明显无副作用的列表/状态类）
PROBES: dict[str, list[str]] = {
    "S3-核心": ["/api/health", "/api/model-profiles", "/api/runtime/status"],
    "S1-任务": ["/api/tasks", "/api/history", "/api/history/policy"],
    "S2-授权": ["/api/license/status", "/api/client/config", "/api/session/status"],
    "S4-存储": ["/api/storage/status", "/api/local-storage/settings", "/api/local-cache"],
    "S5-外壳": ["/api/tutorials", "/api/"],
    "D1-改写": ["/api/rewrite-projects", "/api/breakdown/projects", "/api/prompt-reverse/projects"],
    "D2-视觉": ["/api/visual/projects", "/api/visual/styles", "/api/canvas/list"],
    "D3-字幕": ["/api/subtitle/capabilities", "/api/subtitle/projects", "/api/subtitle/list"],
    "D4-配音": ["/api/voices/catalog", "/api/video-voice/status", "/api/video-voice/source"],
    "D5-电商": ["/api/store/projects", "/api/ecommerce-showcase", "/api/ecommerce/workflow/"],
    "D6-采集": ["/api/hall/rank", "/api/hall/downloads", "/api/hall/episodes"],
}

CORE_MUST_200 = ["/api/health", "/api/tasks", "/api/license/status",
                 "/api/client/config", "/api/model-profiles"]


def ports_of(pid: int) -> list[int]:
    try:
        out = subprocess.check_output(["netstat", "-ano", "-p", "TCP"],
                                      text=True, errors="replace")
    except subprocess.CalledProcessError:
        return []
    ports = set()
    for line in out.splitlines():
        m = NETSTAT_PID_RE.search(line)
        if m and int(m.group(2)) == pid:
            ports.add(int(m.group(1)))
    return sorted(ports)


def get(port: int, path: str, timeout: float = 5.0) -> dict:
    url = f"http://127.0.0.1:{port}{path}"
    try:
        with urllib.request.urlopen(urllib.request.Request(url), timeout=timeout) as resp:
            body = resp.read()
            return {"status": resp.status, "body": body}
    except urllib.error.HTTPError as exc:
        return {"status": exc.code, "body": exc.read()}
    except Exception as exc:  # noqa: BLE001
        return {"status": None, "error": repr(exc)}


def shape(body: bytes) -> dict:
    """提取响应结构指纹：顶层键集合 + 是否数组 + 长度区间，不保留数据。"""
    info = {"len_class": None, "json": False, "keys": [], "hash": None}
    info["hash"] = hashlib.sha256(body).hexdigest()[:16]
    try:
        obj = json.loads(body.decode("utf-8", "replace"))
        info["json"] = True
        if isinstance(obj, dict):
            info["keys"] = sorted(obj.keys())
        elif isinstance(obj, list):
            info["keys"] = ["<array>"]
    except Exception:  # noqa: BLE001
        info["keys"] = ["<non-json>"]
    size = len(body)
    info["len_class"] = "0" if size == 0 else "<1k" if size < 1024 else "<100k" if size < 102400 else ">=100k"
    return info


def gui_visible(pid: int) -> dict:
    """枚举该进程的可见顶层窗口，证明 GUI 真的渲染出来了（headless 自检不算）。"""
    user32 = ctypes.windll.user32
    found: list[dict] = []

    @ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)
    def cb(hwnd, _):
        wpid = wt.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(wpid))
        if wpid.value != pid or not user32.IsWindowVisible(hwnd):
            return True
        n = user32.GetWindowTextLengthW(hwnd)
        buf = ctypes.create_unicode_buffer(n + 1)
        user32.GetWindowTextW(hwnd, buf, n + 1)
        if buf.value.strip():
            found.append({"title": buf.value, "hwnd": int(hwnd)})
        return True

    user32.EnumWindows(cb, 0)
    titles = [w["title"] for w in found]
    ok = any(("Nanbudo" in t) or ("短剧" in t) for t in titles)
    return {"ok": ok, "windows": titles}


def probe_all(port: int) -> dict:
    out = {}
    for domain, paths in PROBES.items():
        out[domain] = []
        for p in paths:
            r = get(port, p)
            rec = {"path": p, "status": r["status"]}
            if r.get("body") is not None:
                rec["shape"] = shape(r["body"])
            else:
                rec["error"] = r.get("error")
            out[domain].append(rec)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--exe", default=str(EXE_DEFAULT))
    ap.add_argument("--mode", choices=["record", "check"], default="check")
    ap.add_argument("--wait", type=float, default=60.0)
    args = ap.parse_args()

    exe = pathlib.Path(args.exe)
    if not exe.exists():
        raise SystemExit(f"exe 不存在: {exe}")

    print(f"[*] 启动 {exe.name} ({args.mode})")
    proc = subprocess.Popen([str(exe)], cwd=str(exe.parent))

    port = None
    deadline = time.time() + args.wait
    while time.time() < deadline:
        if proc.poll() is not None:
            raise SystemExit(f"[!] 进程提前退出 code={proc.returncode}")
        for p in ports_of(proc.pid):
            r = get(p, "/api/health", timeout=2.0)
            if r.get("status") == 200:
                port = p
                break
        if port:
            break
        time.sleep(1.5)

    failures: list[str] = []
    if not port:
        failures.append("未发现 HTTP 端口（服务未起来）")
        result = {"error": "no-port"}
    else:
        print(f"[*] 端口 {port}")
        time.sleep(2.0)  # 等 GUI 首帧
        gui = gui_visible(proc.pid)
        print(f"[*] GUI: {gui}")
        if not gui["ok"]:
            failures.append(f"GUI 未渲染出主窗口: {gui['windows']}")

        domains = probe_all(port)
        for d, rows in domains.items():
            for r in rows:
                print(f"    {r['path']:<34} {r['status']}")

        for p in CORE_MUST_200:
            hit = [r for rows in domains.values() for r in rows if r["path"] == p]
            if hit and hit[0]["status"] != 200:
                failures.append(f"核心端点 {p} 期望 200，实际 {hit[0]['status']}")

        result = {"exe": str(exe), "port": port, "gui": gui,
                  "domains": domains, "failures": failures}

        if args.mode == "record":
            BASELINE.write_text(json.dumps(result, ensure_ascii=False, indent=2),
                                encoding="utf-8")
            print(f"[*] 已写入基线 {BASELINE}")
        else:
            if not BASELINE.exists():
                print("[!] 基线不存在，先跑 --mode record")
            else:
                old = json.loads(BASELINE.read_text(encoding="utf-8"))
                for d, rows in old["domains"].items():
                    new = {r["path"]: r for r in domains.get(d, [])}
                    for r in rows:
                        n = new.get(r["path"])
                        if not n:
                            failures.append(f"{r['path']} 消失")
                            continue
                        if n["status"] != r["status"]:
                            failures.append(f"{r['path']} 状态码 {r['status']} -> {n['status']}")
                        elif n.get("shape", {}).get("keys") != r.get("shape", {}).get("keys"):
                            failures.append(
                                f"{r['path']} 结构变化 {r.get('shape', {}).get('keys')} -> "
                                f"{n.get('shape', {}).get('keys')}")

    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()

    print()
    if failures:
        print(f"[FAIL] {len(failures)} 项")
        for f in failures:
            print(f"   - {f}")
        return 1
    print("[PASS] 冒烟集全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
