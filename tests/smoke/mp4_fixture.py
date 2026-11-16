"""合成最小 MP4，供单测与契约检查共用（不含任何真实素材）。"""

from __future__ import annotations

import struct


def box(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I4s", 8 + len(payload), kind) + payload


def _mvhd(timescale: int, duration: int) -> bytes:
    payload = b"\x00\x00\x00\x00" + b"\x00" * 8 + struct.pack(">II", timescale, duration)
    return box(b"mvhd", payload)


def _tkhd(width: int, height: int, track_id: int) -> bytes:
    payload = b"\x00\x00\x00\x00" + b"\x00" * 8
    payload += struct.pack(">II", track_id, 0) + struct.pack(">I", 0)
    payload += b"\x00" * 8 + b"\x00" * 8 + b"\x00" * 36
    payload += struct.pack(">II", width << 16, height << 16)
    return box(b"tkhd", payload)


def _hdlr(handler: bytes) -> bytes:
    return box(b"hdlr", b"\x00\x00\x00\x00" + b"\x00" * 4 + handler + b"\x00" * 12)


def _stco(offsets: list[int]) -> bytes:
    payload = b"\x00\x00\x00\x00" + struct.pack(">I", len(offsets))
    payload += b"".join(struct.pack(">I", off) for off in offsets)
    return box(b"stco", payload)


def _trak(handler: bytes, chunk_offset: int, width: int = 0, height: int = 0,
          track_id: int = 1) -> bytes:
    minf = box(b"minf", box(b"stbl", _stco([chunk_offset])))
    return box(b"trak", _tkhd(width, height, track_id)
               + box(b"mdia", _hdlr(handler) + minf))


def build_mp4(*, with_subtitle: bool = True) -> bytes:
    ftyp = box(b"ftyp", b"isom" + b"\x00\x00\x02\x00" + b"isomiso2mp41")

    def make_moov(offset: int) -> bytes:
        kids = _mvhd(1000, 12000)
        kids += _trak(b"vide", offset, 1920, 1080, 1)
        kids += _trak(b"soun", offset, 0, 0, 2)
        if with_subtitle:
            kids += _trak(b"sbtl", offset, 0, 0, 3)
        return box(b"moov", kids)

    offset = len(ftyp) + len(make_moov(0)) + 8
    return ftyp + make_moov(offset) + box(b"mdat", b"\xaa" * 64)


def first_stco(data: bytes) -> int:
    payload = data.find(b"stco") + 4
    return struct.unpack(">I", data[payload + 8:payload + 12])[0]


def mdat_payload_offset(data: bytes) -> int:
    from domain.subtitle import mp4
    for candidate in mp4.iter_boxes(data, 0, len(data)):
        if candidate.type == b"mdat":
            return candidate.payload
    raise AssertionError("no mdat")
