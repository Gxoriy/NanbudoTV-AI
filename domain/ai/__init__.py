"""通用 AI 辅助（文本/JSON）。"""

from .assist import AssistError, TextAssist, extract_json

__all__ = ["TextAssist", "AssistError", "extract_json"]
