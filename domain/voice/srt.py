"""SRT 解析、生成与"按配音时长重排时间轴"。

旧实现的对白配音最容易出问题的地方就是时间轴：逐句合成后句子变长，
原字幕时间就会重叠/提前。这里把重排规则写死成可测的东西：
  - 每句起点接上一句终点 + 原间隙（钳制在 0.05~0.80s）
  - 句内时长 = 该句音频实际时长（不拉伸、不压缩，保证音画同步）
"""

from __future__ import annotations

import re
from dataclasses import dataclass

TIME_RE = re.compile(r"(\d+):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d+):(\d{2}):(\d{2})[,.](\d{3})")
MIN_GAP = 0.05
MAX_GAP = 0.80


@dataclass
class Subtitle:
    index: int
    start: float
    end: float
    text: str

    @property
    def duration(self) -> float:
        return max(0.0, self.end - self.start)


def _seconds(h: str, m: str, s: str, ms: str) -> float:
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0


def _stamp(value: float) -> str:
    value = max(0.0, value)
    whole = int(value)
    ms = int(round((value - whole) * 1000))
    if ms == 1000:
        whole += 1
        ms = 0
    return f"{whole // 3600:02d}:{whole % 3600 // 60:02d}:{whole % 60:02d},{ms:03d}"


def parse(text: str) -> list[Subtitle]:
    blocks = re.split(r"\r?\n\r?\n", text.strip()) if text.strip() else []
    result: list[Subtitle] = []
    for block in blocks:
        lines = [line for line in block.splitlines() if line.strip()]
        if len(lines) < 2:
            continue
        match = TIME_RE.search(lines[1] if len(lines) > 1 else "")
        offset = 1
        if match is None:
            match = TIME_RE.search(lines[0])
            offset = 0
        if match is None:
            continue
        start = _seconds(*match.groups()[:4])
        end = _seconds(*match.groups()[4:])
        body = "\n".join(lines[offset + 1:]).strip()
        result.append(Subtitle(len(result) + 1, start, end, body))
    return result


def to_srt(items: list[Subtitle]) -> str:
    blocks = []
    for item in items:
        blocks.append(f"{item.index}\n{_stamp(item.start)} --> {_stamp(item.end)}\n{item.text}")
    return "\n\n".join(blocks) + ("\n" if blocks else "")


def relayout(items: list[Subtitle], durations: list[float]) -> list[Subtitle]:
    """按每句音频时长重排；保持原间隙节奏，越界则顺延，绝不重叠。"""
    if len(items) != len(durations):
        raise ValueError("字幕条数与音频时长数量不一致")
    out: list[Subtitle] = []
    cursor: float | None = None
    for index, (item, duration) in enumerate(zip(items, durations)):
        if cursor is None:
            start = item.start
        else:
            original_gap = item.start - items[index - 1].end
            gap = min(MAX_GAP, max(MIN_GAP, original_gap))
            start = max(cursor + gap, item.start if cursor < item.start else cursor + gap)
        end = start + max(0.08, duration)
        out.append(Subtitle(item.index, round(start, 3), round(end, 3), item.text))
        cursor = end
    return out


def split_speaker(text: str) -> tuple[str, str]:
    """`角色A：台词` → ("角色A", "台词")；没有前缀时角色为空。"""
    for sep in ("：", ":"):
        if sep in text:
            head, _, tail = text.partition(sep)
            if 0 < len(head) <= 12 and not head.endswith(("http", "https")):
                return head.strip(), tail.strip()
    return "", text.strip()
