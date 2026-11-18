"""演示彩排：用 data/ 的**副本**跑一遍现场流程，真实数据保持零改动。

为什么用副本而不是直接跑 data/：
  授权卡有设备绑定（`activations` 表）。真卡现在 0 条绑定，彩排一旦登录就会
  占掉那一次绑定，现场用别的浏览器登录可能被判"已在其他设备激活"。
  所以彩排复制一份数据，读的仍是导师给的原始内容，写只写副本。

流程：
  复制 data/ → 起内核 → 卡密登录 → 读真实项目/素材 → 关键域各取一次 → 关内核
"""

from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data"
TARGET = ROOT / ".local" / "rehearsal-data"
CARD = "DW-PWMB-AXYU-ASP8-C8H8-5X4P-ZSZW-RQ7G-QGTJ"

steps: list[dict] = []


DEMO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) demo-rehearsal"


def http(port: int, path: str, method: str = "GET", body: dict | None = None,
         headers: dict[str, str] | None = None, timeout: float = 60.0):
    data = json.dumps(body).encode() if body is not None else None
    # 设备码由 User-Agent 派生：整场必须用同一个 UA，否则登录后再查状态会"未激活"
    merged = {"User-Agent": DEMO_UA, **(headers or {})}
    if body is not None:
        merged.setdefault("Content-Type", "application/json")
    request = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data,
                                     method=method, headers=merged)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            raw = resp.read()
            if "json" in (resp.headers.get("content-type") or ""):
                return resp.status, json.loads(raw.decode() or "{}")
            return resp.status, {"_bytes": len(raw)}
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw.decode() or "{}")
        except json.JSONDecodeError:
            return exc.code, {"_bytes": len(raw)}
    except Exception as exc:  # noqa: BLE001
        return 0, {"_error": repr(exc)[:120]}


def step(name: str, status: int, detail="", ok: bool | None = None) -> None:
    passed = ok if ok is not None else 200 <= status < 300
    steps.append({"name": name, "status": status, "ok": passed})
    print(f"[{'OK  ' if passed else 'FAIL'}] {name:<26} {status:<4} {detail}")


def main() -> int:
    if TARGET.exists():
        shutil.rmtree(TARGET)
    shutil.copytree(SOURCE, TARGET)
    # 清掉可能复制过来的 runtime 文件，避免端口串味
    for stale in TARGET.glob("runtime-*.json"):
        stale.unlink()
    print(f"[*] 彩排数据: {TARGET}（源: {SOURCE}）")

    proc = subprocess.Popen([sys.executable, "-m", "app.main", "--no-gui", "--port", "0",
                             "--data-dir", str(TARGET)], cwd=str(ROOT),
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        port = None
        for _ in range(120):
            files = list(TARGET.glob("runtime-*.json"))
            if files:
                port = json.loads(files[0].read_text(encoding="utf-8"))["port"]
                break
            time.sleep(0.3)
        if port is None:
            print("[!] 内核未启动")
            return 1
        print(f"[*] 端口 {port}\n")

        step("health", *http(port, "/api/health"))
        status, body = http(port, "/api/license/status")
        step("license/status（未激活）", status, str(body.get("licensed")))

        # 用真实卡登录：会写 activations，但只写副本
        status, body = http(port, "/api/session/login", "POST", {"cardKey": CARD},
                            headers={"User-Agent": DEMO_UA})
        step("session/login（真实卡）", status, f"authenticated={body.get('authenticated')}")
        status, body = http(port, "/api/license/status")
        features = body.get("features") or body.get("license", {}).get("features")
        step("license/status（已激活）", status, f"features={features}")

        # 真实数据里的项目与素材
        status, body = http(port, "/api/visual/projects")
        projects = body.get("projects") or []
        names = [str(item.get("name")) for item in projects[:3]]
        step("visual/projects（真实项目）", status, f"{len(projects)} 个: {names}")
        if projects:
            pid = projects[0].get("id")
            status, body = http(port,
                                f"/api/visual/project?id={pid}&view=workspace")
            project = body.get("project") or {}
            step("visual/project（工作区）", status,
                 f"name={project.get('name')} scenes={len(project.get('scenes') or [])}")
        status, body = http(port, "/api/asset-library/?q=%E6%B5%8B%E8%AF%95")
        step("asset-library（真实素材库）", status,
             f"store={body.get('store')} count={body.get('count')}")

        # 其余域各取一次，确认现场不会 5xx
        for path, name in (("/api/visual/styles", "visual/styles"),
                           ("/api/voices/catalog", "voices/catalog"),
                           ("/api/subtitle/capabilities", "subtitle/capabilities"),
                           ("/api/ecommerce/", "ecommerce 列表"),
                           ("/api/history", "history"),
                           ("/api/tasks", "tasks 快照"),
                           ("/api/runtime/status", "runtime/status"),
                           ("/api/tutorials", "tutorials")):
            status, body = http(port, path)
            step(name, status, str(body.get("count") or body.get("ok") or "")[:20])

        failed = [row for row in steps if not row["ok"]]
        print(f"\n合计 {len(steps)} 步，失败 {len(failed)}")
        http(port, "/api/shutdown", "POST", {})
        return 0 if not failed else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
