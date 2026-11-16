"""字幕域（D3）：选区契约、记录存储、能力与报价。"""

from . import region
from .models import ACTIVE_PHASES, ALL_PHASES, QUOTED, READY, SubtitleRecord
from .service import SubtitleError, SubtitleService
from .store import SubtitleStore

__all__ = [
    "region", "SubtitleStore", "SubtitleService", "SubtitleError", "SubtitleRecord",
    "READY", "QUOTED", "ACTIVE_PHASES", "ALL_PHASES",
]
