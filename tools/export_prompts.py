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
    "storyboard": (("分镜", "镜头", "景别", "运镜"), 5),
    "normalize": (("整理", "格式", "只返回", "原文"), 4),
    "rewrite": (("改写", "改编", "保持", "原文"), 5),
    "marketing": (("卖点", "带货", "口播", "商品"), 5),
    "image_prompt": (("构图", "画面", "参考图", "出图"), 5),
    "hooks": (("钩子", "开头", "标题"), 3),
    # 下面三个桶对应原版的"承接/运镜/资产识别"规则，之前完全没移植
    "continuity": (("人物关系", "空间", "左右", "轴线", "承接"), 4),
    "video_prompt": (("首帧", "尾帧", "时长", "运镜", "运动"), 3),
    "asset_analysis": (("资产", "人物", "场景", "标注", "识别"), 3),
}

MAX_CHARS = 800


# 明显不是提示词的常量：正则、格式串、代码片段、纯符号
_NOISE = re.compile(r"(\^\(|\\\\[dswSDW]|%[sd]|\{\}|__|\bself\b|==|!=|return |def )")


def _is_prompt(text: str) -> bool:
    """过滤掉正则/格式串这类"看起来像中文"的常量。"""
    if len(text) < 60 or len(text) > 4000:
        return False
    if len(re.findall(r"[\u4e00-\u9fff]", text)) < 20:
        return False
    if _NOISE.search(text[:120]):
        return False
    return True


def pick(clues: dict, keys: tuple[str, ...], limit: int,
         used: set[str] | None = None) -> list[dict]:
    """按关键字挑选；`used` 做**跨桶**去重，避免同一条提示词填满多个桶。"""
    used = used if used is not None else set()
    scored: list[tuple[int, str, str]] = []
    for module, info in clues.items():
        for text in info.get("strings") or []:
            if not _is_prompt(text):
                continue
            score = sum(text.count(key) for key in keys)
            if score >= 2 and text[:40] not in used:
                scored.append((score, module, text))
    scored.sort(reverse=True, key=lambda item: (item[0], len(item[2])))
    chosen: list[dict] = []
    for score, module, text in scored:
        head = text[:40]
        if head in used:
            continue
        used.add(head)
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
    used: set[str] = set()
    for bucket, (keys, limit) in BUCKETS.items():
        items = pick(clues, keys, limit, used)
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
