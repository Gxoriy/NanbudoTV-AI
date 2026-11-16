"""P4 基线：把旧安装的 static/ 复制进新项目，并生成内容指纹清单。

用途：
  - 前端基线（老页面一行不改，只做接口适配）
  - 指纹清单用于 P4 期间检测"老页面是否被误改"

产出：
  static/                  复制的全部前端资产
  spec/static-manifest.json 每个文件的 sha256 + 大小 + 类别统计
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import shutil
import sys
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = ROOT / "spec"
DST = ROOT / "static"
SRC = pathlib.Path(r"F:\WorkAPP\短剧改写工作台\_internal\static")


def sha256(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    if not SRC.exists():
        raise SystemExit(f"源目录不存在: {SRC}")

    if DST.exists():
        shutil.rmtree(DST)
    shutil.copytree(SRC, DST)
    print(f"[*] 已复制 -> {DST}")

    files = []
    total = 0
    for p in sorted(DST.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(DST).as_posix()
        size = p.stat().st_size
        total += size
        files.append({"path": rel, "size": size, "sha256": sha256(p)})

    kinds = Counter(p.suffix.lower() or "<none>" for p in DST.rglob("*") if p.is_file())
    manifest = {
        "source": str(SRC),
        "dest": str(DST),
        "file_count": len(files),
        "total_bytes": total,
        "by_extension": dict(sorted(kinds.items(), key=lambda kv: -kv[1])),
        "code_files": sum(v for k, v in kinds.items() if k in (".js", ".css", ".html")),
        "files": files,
    }
    (SPEC / "static-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[*] 文件 {len(files)} 个，合计 {total / 1048576:.1f} MB")
    print(f"[*] 代码文件(js/css/html) {manifest['code_files']} 个")
    print(f"[*] 指纹清单 -> {SPEC / 'static-manifest.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
