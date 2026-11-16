"""配音流水线：阶段抽象 + 合成 + 时间轴装配（P3-01）。

阶段拆分（对齐 pyvideotrans 的"可插拔阶段"思路，代码自写）：
    prepare  → 解析对白/角色
    synth    → 逐段合成（provider 可换）
    assemble → 按 start_ms 叠到同一条时间轴（ffmpeg adelay + amix）
    retime   → 用真实音频时长重排 SRT

每个阶段只吃一个 Context、只改一个字段，便于替换与单测。
"""

from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
from dataclasses import dataclass, field
from typing import Protocol

from .srt import Subtitle, relayout, split_speaker
from .provider import TTSProvider, TTSError


@dataclass
class Line:
    index: int
    role: str
    text: str
    start: float
    end: float


@dataclass
class Segment:
    line: Line
    wav: pathlib.Path
    duration: float


@dataclass
class Context:
    lines: list[Line] = field(default_factory=list)
    segments: list[Segment] = field(default_factory=list)
    output: pathlib.Path | None = None
    srt: str = ""
    workdir: pathlib.Path | None = None


class Stage(Protocol):
    name: str

    def run(self, ctx: Context) -> Context: ...


def _probe_duration(path: pathlib.Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "json", str(path)], capture_output=True, check=True).stdout
    return float(json.loads(out)["format"]["duration"])


class PrepareStage:
    name = "prepare"

    def __init__(self, subtitles: list[Subtitle], voice_of: dict[str, str] | None = None) -> None:
        self.subtitles = subtitles
        self.voice_of = voice_of or {}

    def run(self, ctx: Context) -> Context:
        ctx.lines = []
        for item in self.subtitles:
            role, text = split_speaker(item.text)
            if not text:
                continue
            ctx.lines.append(Line(item.index, role or self.voice_of.get("_default", ""),
                                  text, item.start, item.end))
        return ctx


class SynthStage:
    name = "synth"

    def __init__(self, provider: TTSProvider, default_voice: str = "") -> None:
        self.provider = provider
        self.default_voice = default_voice

    def run(self, ctx: Context, role_voices: dict[str, str] | None = None) -> Context:
        workdir = ctx.workdir or pathlib.Path(".")
        role_voices = role_voices or {}
        ctx.segments = []
        for line in ctx.lines:
            out = workdir / f"line-{line.index:04d}.wav"
            voice = role_voices.get(line.role, self.default_voice)
            self.provider.synthesize(line.text, out, voice)
            ctx.segments.append(Segment(line, out, _probe_duration(out)))
        return ctx


class AssembleStage:
    name = "assemble"

    def __init__(self, pad: float = 0.0) -> None:
        self.pad = pad

    def run(self, ctx: Context) -> Context:
        if not ctx.segments:
            raise TTSError("没有可装配的音频段。")
        if ctx.output is None or ctx.workdir is None:
            raise TTSError("缺少输出路径或工作目录。")
        args = ["ffmpeg", "-v", "error", "-y"]
        filters = []
        for index, seg in enumerate(ctx.segments):
            args += ["-i", str(seg.wav)]
            delay = int(round(seg.line.start * 1000)) + int(round(self.pad * 1000))
            filters.append(f"[{index}:a]adelay={delay}|{delay}[a{index}]")
        mix = "".join(f"[a{i}]" for i in range(len(ctx.segments)))
        filter_graph = ";".join(filters) + f";{mix}amix=inputs={len(ctx.segments)}:normalize=0[out]"
        args += ["-filter_complex", filter_graph, "-map", "[out]",
                 "-ac", "2", "-ar", "44100", str(ctx.output)]
        subprocess.run(args, check=True)
        return ctx


class RetimeStage:
    name = "retime"

    def __init__(self, subtitles: list[Subtitle]) -> None:
        self.subtitles = subtitles

    def run(self, ctx: Context) -> Context:
        durations = [seg.duration for seg in ctx.segments]
        if not durations:
            return ctx
        ctx.srt = _to_srt_text(relayout(self.subtitles, durations))
        return ctx


def _to_srt_text(items: list[Subtitle]) -> str:
    from .srt import to_srt
    return to_srt(items)


class Pipeline:
    def __init__(self, stages: list) -> None:
        self.stages = stages

    def run(self, ctx: Context) -> Context:
        for stage in self.stages:
            ctx = stage.run(ctx)
        return ctx


def dub_dialogue(provider: TTSProvider, subtitles: list[Subtitle],
                 out_wav: pathlib.Path, workdir: pathlib.Path, *,
                 default_voice: str = "", role_voices: dict[str, str] | None = None) -> dict:
    """一步完成：解析 → 合成 → 装配 → 重排。返回 {wav, srt, segments, duration}。"""
    workdir.mkdir(parents=True, exist_ok=True)
    ctx = Context(workdir=workdir, output=out_wav)
    prepare = PrepareStage(subtitles)
    ctx = prepare.run(ctx)
    ctx = SynthStage(provider, default_voice).run(ctx, role_voices or {})
    ctx = AssembleStage().run(ctx)
    duration = _probe_duration(out_wav)
    ctx = RetimeStage(subtitles).run(ctx)
    return {
        "wav": str(out_wav),
        "srt": ctx.srt,
        "segments": [
            {"index": s.line.index, "role": s.line.role, "text": s.line.text,
             "start": s.line.start, "duration": round(s.duration, 3)}
            for s in ctx.segments
        ],
        "duration": round(duration, 3),
    }


def render_segments(provider: TTSProvider, segments: list[dict],
                    out_wav: pathlib.Path, workdir: pathlib.Path,
                    on_progress=None) -> dict:
    """按前端给的 start/end 直接配音（不做 SRT 重排）：逐段合成 → 定位置 → 混流。"""
    workdir.mkdir(parents=True, exist_ok=True)
    ctx = Context(workdir=workdir, output=out_wav)
    total = max(1, len(segments))
    for index, item in enumerate(segments, start=1):
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        wav = workdir / f"seg-{index:04d}.wav"
        provider.synthesize(text, wav, str(item.get("voiceId") or ""))
        line = Line(index, str(item.get("speakerName") or ""), text,
                    float(item.get("start") or 0), float(item.get("end") or 0))
        ctx.segments.append(Segment(line, wav, _probe_duration(wav)))
        if on_progress:
            on_progress(index / total * 0.8, f"已合成 {index}/{total} 段")
    if not ctx.segments:
        raise TTSError("没有可合成的对白段。")
    AssembleStage().run(ctx)
    if on_progress:
        on_progress(1.0, "混流完成")
    return {"wav": str(out_wav), "duration": round(_probe_duration(out_wav), 3),
            "segments": len(ctx.segments)}


def ffmpeg_ready() -> bool:
    # 服务进程可能拿不到新 PATH（计划任务/服务账户），这里统一补一次
    try:
        from ..subtitle.repair import _ensure_ffmpeg_on_path
        _ensure_ffmpeg_on_path()
    except Exception:  # noqa: BLE001
        pass
    return bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))
