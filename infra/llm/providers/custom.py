"""自定义 OpenAI 兼容端点。base_url / model 必须由用户填写后才能调用。"""

from __future__ import annotations

from ..base import Provider
from ..registry import register

register(Provider(
    name="custom",
    label="自定义（OpenAI 兼容）",
    base_url="",
    model="",
    protocol="chat_completions",
    api_key_env="CUSTOM_LLM_API_KEY",
    notes="base_url 留空时必须由 ProfileStore 覆盖，否则调用直接报 invalid_input",
))
