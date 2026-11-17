"""前端调用面 vs 内核路由表：找出"页面会调、内核没有"的接口。

扫描 static/ 下**所有** html 与 js（页面可能各自加载不同脚本），
再和内核 /api/_routes 比对：精确路由要求全等，只有"非 exact 且以 / 结尾"才算前缀。
"""

from __future__ import annotations

import json
import pathlib
import re
import subprocess
import sys
import tempfile
import time
import urllib.request
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[1]
STATIC = ROOT / "static"


def front_paths() -> dict[str, set[str]]:
    """逐文件收集 /api/... 字面量（去掉 query 与结尾斜杠）。"""
    found: dict[str, set[str]] = {}
    for path in sorted(STATIC.glob("*")):
        if path.suffix.lower() not in (".js", ".html"):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        items = set()
        for raw in re.findall(r"/api/[A-Za-z0-9_\-/]*", text):
            clean = raw.split("?")[0].rstrip("/")
            if clean and clean != "/api":
                items.add(clean)
        if items:
            found[path.name] = items
    return found


def main() -> int:
    data_dir = pathlib.Path(tempfile.mkdtemp(prefix="front-contract-"))
    proc = subprocess.Popen([sys.executable, "-m", "app.main", "--no-gui", "--port", "0",
                             "--data-dir", str(data_dir)], cwd=str(ROOT),
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        port = None
        for _ in range(100):
            files = list(data_dir.glob("runtime-*.json"))
            if files:
                port = json.loads(files[0].read_text(encoding="utf-8"))["port"]
                break
            time.sleep(0.3)
        if port is None:
            print("内核未启动")
            return 1
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/_routes", timeout=15) as resp:
            rows = json.loads(resp.read())["routes"]
        exact = {row["path"].rstrip("/") for row in rows}
        prefixes = [row["path"] for row in rows
                    if row["path"].endswith("/") and not row.get("exact")]

        def covered(path: str) -> bool:
            if path in exact:
                return True
            if any(path.startswith(item) for item in prefixes):
                return True
            # 前端常见写法：'/api/voices/' + 'import'
            return any(item.startswith(path + "/") for item in exact)

        ignore = {"/api/v1", "/api/v2", "/api/v3"}
        missing: dict[str, set[str]] = defaultdict(set)
        for name, paths in front_paths().items():
            pseudo = {p for p in paths if p not in ignore
                      and any(other != p and other.startswith(p + "/") for other in paths)}
            for item in paths:
                if item in ignore or item in pseudo:
                    continue
                if not covered(item):
                    missing[item].add(name)

        if not missing:
            print("\n合计缺失 0 条")
        else:
            print(f"\n合计缺失 {len(missing)} 条：")
            for path in sorted(missing):
                print(f"  {path:<46} 出现在 {', '.join(sorted(missing[path]))[:70]}")
        urllib.request.urlopen(urllib.request.Request(
            f"http://127.0.0.1:{port}/api/shutdown", data=b"{}", method="POST"), timeout=10)
        return 0
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
