"""豆包（火山方舟 ark）。协议为 responses，端点 /api/v3/responses。"""

from __future__ import annotations

from ..base import Provider
from ..registry import register

register(Provider(
    name="doubao",
    label="豆包（方舟）",
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    model="doubao-seed-2-0-lite-260215",
    protocol="responses",
    api_key_env="ARK_API_KEY",
    notes="实测基线来自旧版 /api/model-profiles；模型名需与方舟控制台的 endpoint/model 一致",
))
