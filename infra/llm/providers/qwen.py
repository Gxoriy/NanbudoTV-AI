"""千问（DashScope 兼容模式）。协议为 chat_completions。"""

from __future__ import annotations

from ..base import Provider
from ..registry import register

register(Provider(
    name="qwen",
    label="千问（DashScope）",
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    model="qwen3.6-flash",
    protocol="chat_completions",
    api_key_env="DASHSCOPE_API_KEY",
))
