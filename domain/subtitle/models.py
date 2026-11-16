"""字幕记录模型与阶段词汇（P2-01）。

阶段词表不是自拟的：`static/subtitle_removal245.js` 里 `active` 集合明写 11 个
进行中阶段，另有 `ready`/`quoted` 两个待操作阶段，前端据此决定按钮可用性。
多一个少一个都会让按钮状态错乱，所以这里逐一登记。
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

# 待操作（非进行中）
READY = "ready"            # 已导入、可检测/可报价
QUOTED = "quoted"          # 已出价、等确认提交
# 进行中（前端 active 集合）
PREPARING = "preparing"
DETECTING = "detecting"
UPLOADING = "uploading"
QUOTING = "quoting"
SUBMITTING = "submitting"
PROCESSING = "processing"
NEEDS_REVIEW = "needs_review"
PAUSED = "paused"
DOWNLOADING = "downloading"
LOCAL_PROCESSING = "local_processing"
LOCAL_PREPARING = "local_preparing"
# 终态
DONE = "done"
ERROR = "error"
CANCELED = "canceled"

ACTIVE_PHASES = frozenset({
    PREPARING, DETECTING, UPLOADING, QUOTING, SUBMITTING, PROCESSING,
    NEEDS_REVIEW, PAUSED, DOWNLOADING, LOCAL_PROCESSING, LOCAL_PREPARING,
})
TERMINAL_PHASES = frozenset({DONE, ERROR, CANCELED})
ALL_PHASES = ACTIVE_PHASES | TERMINAL_PHASES | {READY, QUOTED}


@dataclass
class SubtitleRecord:
    id: str
    name: str
    phase: str = READY
    progress: float = 0.0
    message: str = ""
    error: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)   # width/height/duration/hasAudio
    size: int = 0
    source_file: str = ""
    result_file: str = ""
    region: dict[str, int] | None = None
    quality: str = "standard"
    processing_mode: str = "cloud"      # cloud | local
    local_mode: str = ""                # strip | repair
    request_id: str | None = None
    quote: dict[str, Any] | None = None
    detection: dict[str, Any] | None = None
    history: list[dict[str, Any]] = field(default_factory=list)
    attempts: list[dict[str, Any]] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def public(self) -> dict[str, Any]:
        """字段名对齐前端：camelCase、progress 0~100、metadata 直出。"""
        return {
            "id": self.id,
            "name": self.name,
            "phase": self.phase,
            "progress": round(self.progress * 100, 1),
            "message": self.message,
            "error": self.error,
            "metadata": self.metadata,
            "size": self.size,
            "sourceFile": self.source_file,
            "resultFile": self.result_file,
            "region": self.region,
            "quality": self.quality,
            "processingMode": self.processing_mode,
            "localMode": self.local_mode,
            "requestId": self.request_id,
            "quote": self.quote,
            "detection": self.detection,
            "history": self.history,
            "attempts": self.attempts,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }


def assert_phase(phase: str) -> str:
    if phase not in ALL_PHASES:
        raise ValueError(f"未知阶段: {phase}")
    return phase
