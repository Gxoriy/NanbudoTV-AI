"""LLM 网关的公共类型（P1-03）。

旧实现的问题：三家 provider 硬编码在 `app.js` 的 `providerPresets` 里，
base_url / 模型名 / 协议全写死，加第 4 家要同时改前端与后端。
这里把它变成"provider 声明 + 协议适配"两件事，新增一家只加一个文件。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

Protocol = Literal["responses", "chat_completions"]
PROTOCOLS: tuple[str, ...] = ("responses", "chat_completions")


@dataclass(frozen=True)
class Provider:
    """一家 provider 的声明。`api_key_env` 让密钥可以走环境变量而不是明文落盘。"""

    name: str
    label: str
    base_url: str
    model: str
    protocol: Protocol
    api_key_env: str = ""
    extra_headers: dict[str, str] = field(default_factory=dict)
    notes: str = ""

    def __post_init__(self) -> None:
        if self.protocol not in PROTOCOLS:
            raise ValueError(f"{self.name}: 不支持的协议 {self.protocol}")

    def profile(self) -> dict[str, Any]:
        return {
            "provider": self.name,
            "label": self.label,
            "baseUrl": self.base_url,
            "model": self.model,
            "protocol": self.protocol,
        }


class LLMError(RuntimeError):
    """带分类的网关错误，前端可直接据此决定"重试/换卡/改输入"。"""

    def __init__(self, code: str, message: str, status: int | None = None,
                 detail: Any = None) -> None:
        super().__init__(message)
        self.code = code
        self.status = status
        self.detail = detail


def mask_key(key: str | None) -> str:
    """密钥掩码：只留前 4 位与后 4 位，且长度不足时全掩。"""
    if not key:
        return ""
    if len(key) <= 12:
        return "*" * len(key)
    return f"{key[:4]}{'*' * 6}{key[-4:]}"
