"""MP4 探测与"独立字幕轨"移除（纯标准库，P2-02）。

为什么要自己写：实测旧版 `_internal` 里**没有** ffmpeg / numpy / cv2（只有 stdlib 与
几个 .pyd），说明它的"本地移除字幕"本来就是用纯 Python 拆 MP4 box 完成的。
新内核沿用这条路线，好处是零外部依赖、可单测；代价是必须自己处理 stco 偏移。

`strip_subtitle_tracks` 只删独立字幕轨（handler 为 subt/sbtl/text/clcp），
不动烧进画面的像素——这与旧版文案"仅移除视频里的独立字幕轨，不会擦除烧进画面的文字"一致。
"""

from __future__ import annotations

import pathlib
import struct
from dataclasses import dataclass
from typing import Any, Iterator

SUBTITLE_HANDLERS = {b"subt", b"sbtl", b"text", b"clcp", b"subp"}


@dataclass(frozen=True)
class Box:
    type: bytes
    start: int
    size: int
    header: int

    @property
    def payload(self) -> int:
        return self.start + self.header

    @property
    def end(self) -> int:
        return self.start + self.size


def iter_boxes(buf: bytes, start: int, end: int) -> Iterator[Box]:
    pos = start
    while pos + 8 <= end:
        size, kind = struct.unpack(">I4s", buf[pos:pos + 8])
        header = 8
        if size == 1:                       # 64 位长度
            if pos + 16 > end:
                return
            size = struct.unpack(">Q", buf[pos + 8:pos + 16])[0]
            header = 16
        elif size == 0:                     # 延伸到文件末尾
            size = end - pos
        if size < header or pos + size > end:
            return
        yield Box(kind, pos, size, header)
        pos += size


def children(buf: bytes, box: Box) -> list[Box]:
    return list(iter_boxes(buf, box.payload, box.end))


def find_child(buf: bytes, box: Box, kind: bytes) -> Box | None:
    for child in children(buf, box):
        if child.type == kind:
            return child
    return None


def find_path(buf: bytes, box: Box, *kinds: bytes) -> Box | None:
    current: Box | None = box
    for kind in kinds:
        if current is None:
            return None
        current = find_child(buf, current, kind)
    return current


def _handler_type(buf: bytes, trak: Box) -> bytes | None:
    hdlr = find_path(buf, trak, b"mdia", b"hdlr")
    if hdlr is None:
        return None
    off = hdlr.payload + 8            # version/flags + pre_defined
    if off + 4 > hdlr.end:
        return None
    return buf[off:off + 4]


def _tkhd_size(buf: bytes, trak: Box) -> tuple[int, int] | None:
    tkhd = find_child(buf, trak, b"tkhd")
    if tkhd is None:
        return None
    version = buf[tkhd.payload]
    base = tkhd.payload + 4
    base += 16 if version == 1 else 8         # creation / modification
    base += 4 + 4                            # track_id + reserved
    base += 8 if version == 1 else 4          # duration
    base += 8 + 2 + 2 + 2 + 2 + 36            # reserved/layer/group/volume/…/matrix
    if base + 8 > tkhd.end:
        return None
    width, height = struct.unpack(">II", buf[base:base + 8])
    return width >> 16, height >> 16


def _mvhd_duration(buf: bytes, moov: Box) -> float:
    mvhd = find_child(buf, moov, b"mvhd")
    if mvhd is None:
        return 0.0
    version = buf[mvhd.payload]
    if version == 1:
        off = mvhd.payload + 4 + 16
        timescale, duration = struct.unpack(">IQ", buf[off:off + 12])
    else:
        off = mvhd.payload + 4 + 8
        timescale, duration = struct.unpack(">II", buf[off:off + 8])
    return float(duration) / timescale if timescale else 0.0


def probe(data: bytes) -> dict[str, Any]:
    """返回 {duration, width, height, hasAudio, hasSubtitle, tracks}。"""
    top = list(iter_boxes(data, 0, len(data)))
    moov = next((b for b in top if b.type == b"moov"), None)
    if moov is None:
        raise ValueError("不是有效的 MP4：缺少 moov")
    result: dict[str, Any] = {
        "duration": round(_mvhd_duration(data, moov), 3),
        "width": 0, "height": 0, "hasAudio": False, "hasSubtitle": False, "tracks": 0,
    }
    for trak in children(data, moov):
        if trak.type != b"trak":
            continue
        result["tracks"] += 1
        handler = _handler_type(data, trak)
        if handler == b"soun":
            result["hasAudio"] = True
        elif handler in SUBTITLE_HANDLERS:
            result["hasSubtitle"] = True
        elif handler == b"vide" and not result["width"]:
            size = _tkhd_size(data, trak)
            if size:
                result["width"], result["height"] = size
    return result


def _rebuild_moov(data: bytes, kids: list[Box]) -> bytes:
    payload = b"".join(data[box.start:box.end] for box in kids)
    return struct.pack(">I4s", 8 + len(payload), b"moov") + payload


def _shift_chunk_offsets(moov: bytearray, delta: int) -> None:
    """moov 变短 delta（负数）后 mdat 前移，保留轨的 stco/co64 必须同步加 delta。"""
    if delta == 0:
        return
    root = Box(b"moov", 0, len(moov), 8)
    for trak in children(moov, root):
        if trak.type != b"trak":
            continue
        stbl = find_path(moov, trak, b"mdia", b"minf", b"stbl")
        if stbl is None:
            continue
        for box in children(moov, stbl):
            if box.type == b"stco":
                width, fmt = 4, ">I"
                count_off = box.payload + 4
            elif box.type == b"co64":
                width, fmt = 8, ">Q"
                count_off = box.payload + 4
            else:
                continue
            count = struct.unpack(">I", moov[count_off:count_off + 4])[0]
            base = count_off + 4
            for index in range(count):
                pos = base + index * width
                value = struct.unpack(fmt, moov[pos:pos + width])[0] + delta
                if value < 0:
                    raise ValueError("MP4 偏移修补失败：stco 越界")
                struct.pack_into(fmt, moov, pos, value)


def strip_subtitle_tracks(data: bytes) -> tuple[bytes, int]:
    """移除独立字幕轨，返回 (新数据, 删除轨数)。无字幕轨时原样返回。

    moov 位于 mdat 之前时，moov 变短会让 mdat 前移，因此保留轨的
    stco/co64 必须减去相同位移；moov 在 mdat 之后则无需处理。
    """
    top = list(iter_boxes(data, 0, len(data)))
    moov = next((b for b in top if b.type == b"moov"), None)
    if moov is None:
        raise ValueError("不是有效的 MP4：缺少 moov")

    keep: list[Box] = []
    dropped = 0
    for child in children(data, moov):
        if child.type == b"trak" and _handler_type(data, child) in SUBTITLE_HANDLERS:
            dropped += 1
            continue
        keep.append(child)
    if dropped == 0:
        return data, 0

    new_moov = bytearray(_rebuild_moov(data, keep))
    delta = len(new_moov) - moov.size
    if delta and any(b.start > moov.start and b.type == b"mdat" for b in top):
        _shift_chunk_offsets(new_moov, delta)

    out = bytearray()
    for box in top:
        if box is moov:
            out += new_moov
        else:
            out += data[box.start:box.end]
    return bytes(out), dropped
