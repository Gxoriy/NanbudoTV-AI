"""视觉阶段路由的纯文本小工具（从 visual_stage.py 拆出以满足行数门禁）。"""

from __future__ import annotations

import re
from typing import Any


def tiny_hash(text: str) -> str:
    value = 2166136261
    for char in text:
        value = ((value ^ ord(char)) * 16777619) & 0xFFFFFFFF
    return f"{value:08x}"


def scene_directory(text: str) -> list[dict[str, Any]]:
    """按"第 N 场/集/章"切分；没有标记就整段作为一场。"""
    pattern = re.compile(r"^\s*(第[一二三四五六七八九十百0-9]+[场集章节])[^\n]*", re.M)
    marks = list(pattern.finditer(text or ""))
    rows: list[dict[str, Any]] = []
    if not marks:
        if (text or "").strip():
            rows.append({"id": "scene-1", "number": 1,
                         "title": "全文", "source": text.strip()})
        return rows
    for index, mark in enumerate(marks, start=1):
        end = marks[index].start() if index < len(marks) else len(text)
        rows.append({"id": f"scene-{index}", "number": index,
                     "title": mark.group(0).strip()[:60],
                     "source": text[mark.start():end].strip()})
    return rows


def local_asset_guess(source: str) -> dict[str, list[dict[str, Any]]]:
    """LLM 超时兜底：按标题/对白行做保守提取。"""
    people: list[dict[str, Any]] = []
    scenes: list[dict[str, Any]] = []
    props: list[dict[str, Any]] = []
    seen: set[str] = set()
    prop_words = ("芯片", "眼镜", "义肢", "台灯", "手机", "钥匙", "剧本", "代码", "门")
    for line in source.splitlines():
        value = line.strip()
        if not value:
            continue
        if value.startswith("第") and ("场" in value[:12] or "集" in value[:12]):
            scenes.append({"name": value[:60], "description": value[:120]})
            continue
        match = re.match(r"^([\u4e00-\u9fa5A-Za-z0-9]{1,8})[：:]", value)
        if match:
            name = match.group(1)
            if name not in seen:
                seen.add(name)
                people.append({"name": name, "aliases": [], "role": "角色"})
        for word in prop_words:
            if word in value and word not in seen:
                seen.add(word)
                props.append({"name": word, "description": value[:80]})
    return {"people": people[:30], "scenes": scenes[:30], "props": props[:30]}
