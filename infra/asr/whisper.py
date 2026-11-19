"""本地语音识别（faster-whisper / CTranslate2，CPU 可跑）。

为什么用它：体积可控（tiny≈75MB、base≈145MB）、不依赖 torch、支持中文，
首次使用会从 HuggingFace 下载权重到用户缓存目录，之后离线可用。

`ASR` 是薄封装：只负责"加载一次模型、把音频转成分段文本"，
不掺业务（字幕时间轴对齐在 domain 层做）。
"""

from __future__ import annotations

import pathlib
import threading
import time
from dataclasses import dataclass, field
from typing import Any

DEFAULT_MODEL = "tiny"
_MODEL_CACHE: dict[str, Any] = {}
_LOCK = threading.Lock()
_LAST_ERROR = ""


def available() -> tuple[bool, str]:
    """能不能用：只看依赖装没装，不看权重有没有下载（首次调用才下）。"""
    try:
        import faster_whisper  # noqa: F401,PLC0415
    except ImportError:
        return False, "未安装 faster-whisper（pip install faster-whisper）"
    if _LAST_ERROR:
        return False, _LAST_ERROR
    return True, "faster-whisper 就绪"


def _model(size: str):
    global _LAST_ERROR
    with _LOCK:
        if size in _MODEL_CACHE:
            return _MODEL_CACHE[size]
        from faster_whisper import WhisperModel  # noqa: PLC0415

        started = time.perf_counter()
        try:
            # 先只用本地缓存：任务线程里同步联网会阻塞到连接超时（实测 WinError 10060
            # 要等数分钟），前端只看到"点了没反应"。
            model = WhisperModel(size, device="cpu", compute_type="int8",
                                 local_files_only=True)
        except Exception as exc:  # noqa: BLE001
            if size != DEFAULT_MODEL:
                _LAST_ERROR = f"weights_missing: {size}（本地未缓存，且未联网下载）"
                raise RuntimeError(_LAST_ERROR) from exc
            try:
                model = WhisperModel(size, device="cpu", compute_type="int8")
            except Exception as inner:  # noqa: BLE001
                _LAST_ERROR = f"模型加载失败: {inner}"
                raise
        _MODEL_CACHE[size] = model
        _MODEL_CACHE[f"{size}:loadSeconds"] = round(time.perf_counter() - started, 1)
        return model


@dataclass
class Transcript:
    text: str = ""
    language: str = ""
    duration: float = 0.0
    segments: list[dict[str, Any]] = field(default_factory=list)

    def public(self) -> dict[str, Any]:
        return {"ok": True, "text": self.text, "language": self.language,
                "duration": round(self.duration, 3), "segments": self.segments,
                "count": len(self.segments)}


def _decode_to_array(path: pathlib.Path):
    """自己解码成 16k 单声道 float32，绕开 av 版本兼容问题。

    faster-whisper 默认走 PyAV 解码，但 av 的 API 在不同版本间变过
    （`metadata_errors` 参数在旧版本不存在，直接 TypeError）。
    这里先用 ffmpeg 统一转 16k 单声道 wav，再用标准库 wave + numpy 读，
    依赖面更小、也不受 av 版本影响。
    """
    # 优先 PyAV：原版就是这么干的（_internal 里带的是 libav，不是 ffmpeg.exe）
    try:
        from infra.media import avio  # noqa: PLC0415

        return avio.decode_audio_16k(path)
    except Exception:  # noqa: BLE001
        pass

    import shutil  # noqa: PLC0415
    import subprocess  # noqa: PLC0415
    import tempfile  # noqa: PLC0415
    import wave  # noqa: PLC0415

    import numpy as np  # noqa: PLC0415

    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        from ..subtitle.repair import _ensure_ffmpeg_on_path  # noqa: PLC0415
        _ensure_ffmpeg_on_path()
        ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise RuntimeError("未找到 ffmpeg，无法解码音频。")

    with tempfile.TemporaryDirectory() as tmp:
        target = pathlib.Path(tmp) / "16k.wav"
        subprocess.run([ffmpeg, "-v", "error", "-y", "-i", str(path),
                        "-ac", "1", "-ar", "16000", "-f", "wav", str(target)],
                       check=True, capture_output=True)
        with wave.open(str(target), "rb") as handle:
            frames = handle.readframes(handle.getnframes())
    pcm = np.frombuffer(frames, np.int16).astype(np.float32) / 32768.0
    return pcm


def transcribe(audio: str | pathlib.Path, *, size: str | None = None,
               language: str | None = None) -> Transcript:
    path = pathlib.Path(audio)
    if not path.is_file():
        raise FileNotFoundError(f"音频不存在: {path}")
    model = _model(size or DEFAULT_MODEL)
    pcm = _decode_to_array(path)
    segments, info = model.transcribe(pcm, language=language, vad_filter=True)
    items: list[dict[str, Any]] = []
    pieces: list[str] = []
    for seg in segments:
        text = (seg.text or "").strip()
        if not text:
            continue
        items.append({"start": round(float(seg.start), 2), "end": round(float(seg.end), 2),
                      "text": text})
        pieces.append(text)
    return Transcript(text="".join(pieces), language=getattr(info, "language", "") or "",
                      duration=float(getattr(info, "duration", 0.0) or 0.0),
                      segments=items)


def to_srt(segments: list[dict[str, Any]]) -> str:
    """把分段转成 SRT（字幕域直接可用）。"""

    def stamp(seconds: float) -> str:
        ms = int(round(seconds * 1000))
        h, rest = divmod(ms, 3_600_000)
        m, rest = divmod(rest, 60_000)
        s, ms = divmod(rest, 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

    lines: list[str] = []
    for index, item in enumerate(segments, start=1):
        lines.append(str(index))
        lines.append(f"{stamp(item['start'])} --> {stamp(item['end'])}")
        lines.append(str(item["text"]))
        lines.append("")
    return "\n".join(lines)
