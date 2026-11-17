"""把原包提示词按用途导出成 Python 常量模块（verbatim，长度上限 800 字）。

来源：spec/extracted/core-clues.json（由 tools/pyz_core_dump.py 从 PYZ 里提取）。
产物：domain/prompts_original.py —— 供我们现有 8 个 LLM 接口直接引用。
"""

from __future__ import annotations

import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
CLUES = ROOT / "spec" / "extracted" / "core-clues.json"
TARGET = ROOT / "domain" / "prompts_original.py"

BUCKETS = {
    "storyboard": (("分镜", "镜头", "景别", "运镜"), 3),
    "normalize": (("整理", "格式", "只返回", "原文"), 3),
    "rewrite": (("改写", "改编", "保持", "原文"), 3),
    "marketing": (("卖点", "带货", "口播", "商品"), 3),
    "image_prompt": (("构图", "画面", "参考图", "出图"), 3),
    "hooks": (("钩子", "开头", "标题"), 2),
}

MAX_CHARS = 800


def pick(clues: dict, keys: tuple[str, ...], limit: int) -> list[dict]:
    scored: list[tuple[int, str, str]] = []
    for module, info in clues.items():
        for text in info.get("strings") or []:
            if len(text) < 60 or not re.search(r"[\u4e00-\u9fff]", text):
                continue
            if len(text) > 4000:
                continue
            score = sum(text.count(key) for key in keys)
            if score >= 2:
                scored.append((score, module, text))
    scored.sort(reverse=True, key=lambda item: (item[0], len(item[2])))
    chosen: list[dict] = []
    seen: set[str] = set()
    for score, module, text in scored:
        head = text[:40]
        if head in seen:
            continue
        seen.add(head)
        chosen.append({"module": module, "score": score, "text": text})
        if len(chosen) >= limit:
            break
    return chosen


def main() -> int:
    clues = json.loads(CLUES.read_text(encoding="utf-8"))
    lines = ['"""原包提示词（从 PYZ 提取，逐字保留；超长部分截断到 800 字）。',
             "",
             "由 tools/export_prompts.py 生成，勿手改；要调整挑选规则请改脚本。",
             '"""',
             "",
             "from __future__ import annotations",
             "",
             "PROMPTS: dict[str, list[dict[str, str]]] = {"]
    for bucket, (keys, limit) in BUCKETS.items():
        items = pick(clues, keys, limit)
        lines.append(f'    "{bucket}": [')
        for item in items:
            text = item["text"][:MAX_CHARS]
            lines.append("        {")
            lines.append(f'            "module": {item["module"]!r},')
            lines.append(f'            "text": {text!r},')
            lines.append("        },")
        lines.append("    ],")
    lines.append("}")
    lines.append("")
    lines.append("")
    lines.append("def system(bucket: str, index: int = 0) -> str:")
    lines.append('    """取某用途的第 index 条原文提示词；没有则返回空串。"""')
    lines.append("    items = PROMPTS.get(bucket) or []")
    lines.append("    if 0 <= index < len(items):")
    lines.append('        return items[index]["text"]')
    lines.append('    return ""')
    lines.append("")

    TARGET.write_text("\n".join(lines), encoding="utf-8")
    stats = {bucket: len(pick(clues, keys, limit))
             for bucket, (keys, limit) in BUCKETS.items()}
    print(f"[*] 已写 {TARGET.relative_to(ROOT)}（{TARGET.stat().st_size // 1024} KB）")
    print(f"[*] 各用途条数：{stats}")
    for bucket in BUCKETS:
        first = pick(clues, *BUCKETS[bucket])[:1]
        if first:
            snippet = first[0]["text"].replace("\n", " ")[:60]
            print(f"    {bucket:<13} {first[0]['module']:<32} {snippet}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
