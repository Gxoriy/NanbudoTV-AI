"""交付验收：一条命令跑完所有门禁，输出 PASS/FAIL 汇总。

分两类：
  核心（默认跑，约 4 分钟）  单测 / 规则 / 首页 28 项 / 前端契约 / 300 路由实盘 / 8 域通道
  外延（--with-ui，需 Playwright + ffmpeg）  18 页点击审计 / 登录→视觉场景

用法：
  python tools/verify_all.py
  python tools/verify_all.py --with-ui
  python tools/verify_all.py --with-media      # 通道巡检连出图一起跑
"""

from __future__ import annotations

import os
import pathlib
import shutil
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
PY = sys.executable
WITH_UI = "--with-ui" in sys.argv
WITH_MEDIA = "--with-media" in sys.argv

results: list[dict] = []


def run(name: str, cmd: list[str], *, timeout: int = 1200,
        env_extra: dict[str, str] | None = None) -> bool:
    env = dict(os.environ)
    env.setdefault("PYTHONIOENCODING", "utf-8")
    if env_extra:
        env.update(env_extra)
    started = time.perf_counter()
    print(f"\n=== {name} ===")
    try:
        proc = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True,
                              encoding="utf-8", errors="replace", timeout=timeout,
                              env=env)
    except subprocess.TimeoutExpired:
        results.append({"name": name, "ok": False, "ms": timeout * 1000,
                        "tail": "超时"})
        print(f"[FAIL] {name} 超时")
        return False
    elapsed = (time.perf_counter() - started) * 1000
    tail = "\n".join(line for line in (proc.stdout or "").strip().splitlines()[-6:])
    ok = proc.returncode == 0
    results.append({"name": name, "ok": ok, "ms": round(elapsed), "tail": tail})
    print(tail)
    print(("[OK] " if ok else "[FAIL] ") + name)
    return ok


def has_playwright() -> bool:
    root = pathlib.Path(os.environ.get("NANBUDO_PLAYWRIGHT_DIR", r"E:\PublicWork\Playwright"))
    return (root / "node_modules" / "playwright").exists()


def has_ffmpeg() -> bool:
    if shutil.which("ffmpeg"):
        return True
    return pathlib.Path(r"E:\PublicWork\ffmpeg\bin\ffmpeg.exe").exists()


def main() -> int:
    started = time.perf_counter()
    # ---------- 核心门禁 ----------
    run("单元测试", [PY, "-m", "unittest", "discover", "-s", "tests"])
    run("代码规则 R1-R5", [PY, "tools/check_rules.py"])
    run("首页 28 项", [PY, "tools/check_homepage.py"])
    run("前端契约（页面会调的内核接口）", [PY, "tools/front_contract_check.py"])
    run("旧路由覆盖", [PY, "tools/audit_coverage.py"])
    run("300 路由实盘审计", [PY, "tools/route_audit.py"])

    lane_cmd = [PY, "tools/lane_smoke.py"]
    if WITH_MEDIA:
        lane_cmd.append("--with-media")
    run("8 域通道巡检", lane_cmd, timeout=1800)

    # ---------- 外延（真浏览器） ----------
    if WITH_UI:
        if not has_playwright():
            results.append({"name": "18 页点击审计", "ok": False, "ms": 0,
                            "tail": "缺 Playwright：设置 NANBUDO_PLAYWRIGHT_DIR"})
            print("\n[SKIP] 18 页点击审计：未找到 Playwright")
        else:
            run("18 页点击审计", [PY, ".local/deploy/run_click_audit.py"], timeout=1800)
            if has_ffmpeg():
                run("登录→视觉链路场景", [PY, ".local/deploy/run_ui_scenario.py"],
                    timeout=1200)

    total = time.perf_counter() - started
    failed = [row for row in results if not row["ok"]]
    print("\n" + "=" * 46)
    print(f"{'门禁':<34}{'结果':>6}{'耗时':>8}")
    for row in results:
        print(f"{row['name']:<34}{('PASS' if row['ok'] else 'FAIL'):>6}"
              f"{row['ms'] / 1000:>7.1f}s")
    print("=" * 46)
    print(f"总计 {len(results)} 项，失败 {len(failed)} 项，{total / 60:.1f} 分钟")
    if failed:
        for row in failed:
            print(f"  - {row['name']}: {row['tail'][:160]}")
        return 1
    print("[OK] 全部门禁通过，可交付。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
