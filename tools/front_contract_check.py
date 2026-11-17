"""前端调用面 vs 内核路由表：找出"页面会调、内核没有"的接口。

前端 JS 里的路径是从页面上扒的（写死 + 模板拼接），比 route-spec 更贴近真实使用。
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

ROOT = pathlib.Path(__file__).resolve().parents[1]
PAGES = ("visual_page.js", "app.js", "subtitle_removal245.js", "video_voice.js",
         "ecommerce259.js", "login.js", "user_guide247.js")


def front_paths() -> dict[str, set[str]]:
    found: dict[str, set[str]] = {}
    for name in PAGES:
        path = ROOT / "static" / name
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        items = set(re.findall(r"/api/[A-Za-z0-9_\-/]+", text))
        found[name] = {item.rstrip("/") for item in items}
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
        # 只有"以 / 结尾且不是 exact"的注册才是前缀匹配；exact 路由必须完全相等
        prefixes = [row["path"] for row in rows
                    if row["path"].endswith("/") and not row.get("exact")]

        def covered(path: str) -> bool:
            if path in exact:
                return True
            if any(path.startswith(item) for item in prefixes):
                return True
            # 前端常见写法：'/api/local-storage/' + ('settings'|'retry')
            # 正则只能抓到基路径，只要内核有以它开头的精确路由就算覆盖
            return any(item.startswith(path + "/") for item in exact)

        total_missing = 0
        ignore = {"/api/v1", "/api/v2", "/api/v3"}      # 模型渠道的 baseUrl，不是内核路由
        for page, paths in front_paths().items():
            # 去掉"只是别的前缀"的伪路径（如 /api/original 来自 /api/original/recommend）
            pseudo = {p for p in paths if p not in ignore
                      and any(other != p and other.startswith(p + "/") for other in paths)}
            missing = sorted(p for p in paths
                             if p.startswith("/api/") and p not in ignore
                             and p not in pseudo and not covered(p))
            if missing:
                total_missing += len(missing)
                print(f"\n{page} 缺失 {len(missing)}:")
                for item in missing:
                    print("  ", item)
        print(f"\n合计缺失 {total_missing} 条")
        urllib.request.urlopen(urllib.request.Request(
            f"http://127.0.0.1:{port}/api/shutdown", data=b"{}", method="POST"), timeout=10)
        return 0
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
