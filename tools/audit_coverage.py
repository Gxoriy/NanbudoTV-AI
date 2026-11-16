"""覆盖率审计：已迁移路由 vs 旧版 route-spec。

判定口径：
  已迁移 = 新内核注册了同路径，或注册了同前缀（以 / 结尾的路由用于前缀分派）
  未迁移 = 落到 501 兜底

用途：每次阶段收口跑一遍，避免"自我感觉迁移了很多"。
"""

from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = ROOT / "spec" / "route-spec.json"


def start_kernel(data_dir: pathlib.Path) -> tuple[subprocess.Popen, int]:
    proc = subprocess.Popen([sys.executable, "-m", "app.main", "--no-gui", "--port", "0",
                             "--data-dir", str(data_dir)], cwd=str(ROOT),
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    for _ in range(80):
        files = list(data_dir.glob("runtime-*.json"))
        if files:
            return proc, json.loads(files[0].read_text(encoding="utf-8"))["port"]
        if proc.poll() is not None:
            raise SystemExit("内核启动失败: " + (proc.stderr.read() or b"").decode()[-400:])
        time.sleep(0.3)
    raise SystemExit("等待端口超时")


def main() -> int:
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        data_dir = pathlib.Path(tmp)
        proc, port = start_kernel(data_dir)
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/_routes", timeout=10) as resp:
                index = json.loads(resp.read().decode("utf-8"))
        finally:
            try:
                urllib.request.urlopen(
                    urllib.request.Request(f"http://127.0.0.1:{port}/api/shutdown",
                                           data=b"{}", method="POST"), timeout=10)
            except Exception:  # noqa: BLE001
                pass
            proc.wait(timeout=10)

    registered = {item["path"] for item in index["routes"]}
    prefixes = [p for p in registered if p.endswith("/")]

    def covered(path: str) -> bool:
        if path in registered:
            return True
        return any(path.startswith(p) for p in prefixes)

    by_domain: dict[str, list[bool]] = {}
    for route in spec["routes"]:
        by_domain.setdefault(route["domain"], []).append(covered(route["path"]))

    total = sum(len(v) for v in by_domain.values())
    done = sum(sum(v) for v in by_domain.values())
    print(f"旧版路由 {total} 条，已注册 {len(registered)} 条，覆盖 {done} 条 "
          f"({done / total * 100:.1f}%)")
    print(f"{'域':<6}{'已迁':>6}{'总数':>6}  覆盖率")
    for domain in sorted(by_domain):
        flags = by_domain[domain]
        print(f"{domain:<6}{sum(flags):>6}{len(flags):>6}  {sum(flags) / len(flags) * 100:5.1f}%")

    missing = [r["path"] for r in spec["routes"] if not covered(r["path"])]
    print(f"\n未迁移 {len(missing)} 条，按域取样：")
    for domain in sorted(by_domain):
        sample = [p for p in missing if p in {r["path"] for r in spec["routes"]
                                              if r["domain"] == domain}][:4]
        if sample:
            print(f"  {domain}: " + "、".join(sample))
    return 0


if __name__ == "__main__":
    sys.exit(main())
