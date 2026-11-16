"""配音域（D4）：SRT 重排、分段合成、时间轴装配。"""

from .pipeline import (
    AssembleStage, Context, Line, Pipeline, PrepareStage, RetimeStage, Segment,
    SynthStage, dub_dialogue, ffmpeg_ready,
)
from .provider import SapiProvider, TTSError, TTSProvider, VoiceInfo
from .service import VoiceService
from .srt import Subtitle, parse, relayout, split_speaker, to_srt

__all__ = [
    "VoiceService", "SapiProvider", "TTSProvider", "TTSError", "VoiceInfo",
    "Subtitle", "parse", "to_srt", "relayout", "split_speaker",
    "Pipeline", "PrepareStage", "SynthStage", "AssembleStage", "RetimeStage",
    "Context", "Line", "Segment", "dub_dialogue", "ffmpeg_ready",
]
