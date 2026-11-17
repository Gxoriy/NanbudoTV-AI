"""按用途筛选原包提示词（用于替换我们现在的简版提示）。"""

from __future__ import annotations

import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
data = json.loads((ROOT / "spec" / "extracted" / "core-clues.json")
                  .read_text(encoding="utf-8"))

BUCKETS = {
    "storyboard": ("分镜", "镜头", "景别", "运镜", "时间轴"),
    "normalize": ("整理", "归一", "清洗", "结构化", "只返回"),
    "rewrite": ("改写", "重写", "保持", "原文"),
    "marketing": ("营销", "带货", "卖点", "口播", "转化"),
    "image_prompt": ("出图", "画面", "构图", "光线", "参考图"),
    "title": ("标题", "钩子", "开头"),
}

seen: set[str] = set()
for bucket, keys in BUCKETS.items():
    scored: list[tuple[int, str, str]] = []
    for module, info in data.items():
        for text in info.get("strings") or []:
            if len(text) < 40 or not re.search(r"[\u4e00-\u9fff]", text):
                continue
            score = sum(text.count(key) for key in keys)
            if score:
                scored.append((score, module, text))
    scored.sort(reverse=True, key=lambda item: (item[0], len(item[2])))
    print(f"\n===== {bucket} =====")
    for score, module, text in scored[:6]:
        snippet = text.replace("\n", " ")[:110]
        print(f"  [{score:>2}] {module:<34} {snippet}")
