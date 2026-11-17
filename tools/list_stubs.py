"""列出仍走统一兜底（501/不可用）路由的处理清单。"""

from __future__ import annotations

import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
NAMES = ("commerce", "hall", "media_extra", "rewrite", "system",
         "visual_extra", "visual_tail", "visual", "voice")

for name in NAMES:
    path = ROOT / "app" / "api" / f"{name}.py"
    text = path.read_text(encoding="utf-8")
    paths: list[str] = []
    for match in re.finditer(r"for path in \(([^)]*)\)", text, re.S):
        paths += re.findall(r'"(/api/[^"]+)"', match.group(1))
    if paths:
        print(f"\n{name} ({len(paths)}):")
        for item in paths:
            print("  ", item)
