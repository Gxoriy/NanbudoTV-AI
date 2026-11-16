"""本地 ASR（faster-whisper）。"""

from .whisper import DEFAULT_MODEL, Transcript, available, to_srt, transcribe

__all__ = ["transcribe", "to_srt", "available", "Transcript", "DEFAULT_MODEL"]
