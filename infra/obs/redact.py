"""日志与上报脱敏（P1-06）。

旧实现把完整请求体、API Key、卡密直接打进日志，用户把日志发给客服就等于交出密钥。
这里在 logging 层做一次"出口过滤"：无论谁写的日志，出去前都被洗一遍。
"""

from __future__ import annotations

import logging
import re
from typing import Any

# 顺序重要：先匹配结构化更强的（Bearer / sk-），再兜底裸 hex
PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}", re.I), r"\1***"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{6,}", re.I), "sk-***"),
    # 卡密：DW-XXXXX-... 连续 5 段以上
    (re.compile(r"\bDW(?:-[A-Z0-9]{4,6}){3,}", re.I), "DW-***"),
    (re.compile(r"\b(?:ARK|DASHSCOPE|CUSTOM_LLM)_API_KEY\b\s*[=:]\s*\S+", re.I),
     lambda m: m.group(0).split("=")[0].split(":")[0] + "=***"),
    (re.compile(r"(['\"]?(?:api[_-]?key|token|secret|password|authorization)['\"]?\s*[:=]\s*)"
                r"['\"]?([^'\"\s,}]{4,})['\"]?", re.I), r"\1***"),
    (re.compile(r"\b[a-f0-9]{32,}\b", re.I), "hex:***"),
)

SENSITIVE_KEYS = re.compile(
    r"api[_-]?key|apikey|authorization|token|secret|password|passwd|cardkey|card_key|"
    r"cookie|session[_-]?id", re.I)
KEEP_TAIL = 4        # 掩码保留末 4 位，便于人眼比对"是不是同一把 key"


def scrub(text: str) -> str:
    if not text:
        return text
    out = text
    for pattern, repl in PATTERNS:
        out = pattern.sub(repl, out)
    return out


def mask_value(value: str) -> str:
    if not value:
        return ""
    if len(value) <= KEEP_TAIL * 2:
        return "*" * len(value)
    return f"***{value[-KEEP_TAIL:]}"


def scrub_obj(obj: Any, _depth: int = 0) -> Any:
    """递归脱敏：按 key 名命中直接掩码，字符串值再过一遍正则。"""
    if _depth > 6:
        return "<深度截断>"
    if isinstance(obj, dict):
        out: dict[str, Any] = {}
        for key, value in obj.items():
            if isinstance(key, str) and SENSITIVE_KEYS.search(key) and isinstance(value, str):
                out[key] = mask_value(value)
            else:
                out[key] = scrub_obj(value, _depth + 1)
        return out
    if isinstance(obj, (list, tuple)):
        return [scrub_obj(v, _depth + 1) for v in obj]
    if isinstance(obj, str):
        return scrub(obj)
    return obj


class RedactionFilter(logging.Filter):
    """挂在 handler 上；对消息与参数都做脱敏。"""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:  # noqa: BLE001
            message = str(record.msg)
        record.msg = scrub(message)
        record.args = ()
        if record.exc_text:
            record.exc_text = scrub(record.exc_text)
        return True


def install(level: int = logging.INFO, fmt: str | None = None) -> None:
    """统一日志出口：所有 handler 都带脱敏过滤器。"""
    root = logging.getLogger()
    root.setLevel(level)
    for handler in root.handlers:
        if not any(isinstance(f, RedactionFilter) for f in handler.filters):
            handler.addFilter(RedactionFilter())
    if not root.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(
            fmt or "%(asctime)s %(levelname)s %(name)s %(message)s"))
        handler.addFilter(RedactionFilter())
        root.addHandler(handler)
