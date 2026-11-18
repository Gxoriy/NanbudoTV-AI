"""示例价格表（演示用）。

为什么需要它：前端 `credit_gate.js` 的判定是

    missing = !valid(cost) || cost === 0;

**价格为 0 会被当成"没有价格"**，于是按钮直接禁用并显示"尚无有效价格，暂不可用"。
原版是靠 `/api/client/config` 的 `textButtonBindings/textModelPricing` 与
`/api/visual/profile` 的 `videoPricing/imagePricing` 供价的（真实样本见
`spec/api-samples/api_client_config.json`），我们之前只返回了版本信息，所以这些按钮全灰。

这里给一版**示例价格**（数值取自原版样本量级，按次/按秒计价），
不改变"对外免费"的口径：余额依旧是 1,000,000，实际扣费恒为 0。
"""

from __future__ import annotations

from typing import Any

POINTS_PER_CNY = 1.0

# 文本类按钮：前端按 stage 取 binding.price，0 会被判为"无价格"，所以必须 > 0
TEXT_BUTTON_BINDINGS: dict[str, dict[str, Any]] = {
    "workflow-cut": {"model": "gt-6-sol", "billingMode": "per_call", "price": 0.1},
    "workflow-assets": {"model": "gt-6-sol", "billingMode": "per_call", "price": 0.1},
    "workflow-storyboard": {"model": "deepseek-v4.1-flash", "billingMode": "per_call",
                            "price": 0.1},
    "source-analyze": {"model": "gt-6-sol", "billingMode": "per_call", "price": 0.1},
    "breakdown-analyze": {"model": "gt-6-sol", "billingMode": "per_call", "price": 0.1},
    "rewrite-proposals": {"model": "gt-6-sol", "billingMode": "per_call", "price": 0.1},
    "rewrite-final": {"model": "gt-6-sol", "billingMode": "per_call", "price": 0.1},
    "original-final": {"model": "gt-6-sol", "billingMode": "per_call", "price": 0.1},
    "original-recommend": {"model": "gt-6-sol", "billingMode": "per_call", "price": 0.1},
    "original-trends": {"model": "gt-6-sol", "billingMode": "per_call", "price": 0.1},
}

TEXT_MODEL_PRICING: list[dict[str, Any]] = [
    {"model": "qwen3.8-flash", "resolution": "rewrite", "billingMode": "flat",
     "pricePerGeneration": 0.3},
    {"model": "qwen3.8-flash", "resolution": "original", "billingMode": "flat",
     "pricePerGeneration": 0.3},
    {"model": "qwen3.8-flash", "resolution": "refine", "billingMode": "flat",
     "pricePerGeneration": 0.1},
    {"model": "deepseek-v4.1-flash", "resolution": "rewrite", "billingMode": "flat",
     "pricePerGeneration": 0.2},
    {"model": "deepseek-v4.1-flash", "resolution": "original", "billingMode": "flat",
     "pricePerGeneration": 0.2},
    {"model": "gt-6-sol", "resolution": "rewrite", "billingMode": "flat",
     "pricePerGeneration": 0.1},
]

# 视频：按秒计价（前端 quote() 会乘时长）
VIDEO_PRICING: list[dict[str, Any]] = [
    {"model": "seedance-2.0-anci", "resolution": "480p", "billingMode": "per_second",
     "pricePerSecond": 1.0},
    {"model": "seedance-2.0-anci", "resolution": "720p", "billingMode": "per_second",
     "pricePerSecond": 2.0},
    {"model": "seedance-2.0-anci", "resolution": "1080p", "billingMode": "per_second",
     "pricePerSecond": 4.0},
]

# 图像：按张计价（resolution 用小写，前端会 normalized 到 1k/2k）
IMAGE_PRICING: list[dict[str, Any]] = [
    {"model": "google/nano-banana", "resolution": "1k", "billingMode": "flat",
     "pricePerImage": 0.5},
    {"model": "google/nano-banana", "resolution": "2k", "billingMode": "flat",
     "pricePerImage": 0.8},
    {"model": "banana-pro", "resolution": "1k", "billingMode": "flat",
     "pricePerImage": 0.6},
    {"model": "banana-pro", "resolution": "2k", "billingMode": "flat",
     "pricePerImage": 0.9},
    {"model": "google/nano-banana", "resolution": "4k", "billingMode": "flat",
     "pricePerImage": 1.2},
    {"model": "google/nano-banana", "resolution": "auto", "billingMode": "flat",
     "pricePerImage": 0.5},
    {"model": "banana-pro", "resolution": "4k", "billingMode": "flat",
     "pricePerImage": 1.4},
    {"model": "banana-pro", "resolution": "auto", "billingMode": "flat",
     "pricePerImage": 0.6},
]

BREAKDOWN_MODELS: dict[str, str] = {
    "imageModel": "google/nano-banana",
    "videoModel": "seedance-2.0-anci",
    "editModel": "",
}


def visual_profile_defaults() -> dict[str, Any]:
    """`/api/visual/profile` 的默认值：没有它前端算不出任何报价。"""
    return {
        "pointsPerCny": POINTS_PER_CNY,
        "videoModel": "seedance-2.0-anci",
        "imageModel": "google/nano-banana",
        "videoPricing": [dict(row) for row in VIDEO_PRICING],
        "imagePricing": [dict(row) for row in IMAGE_PRICING],
        # 不发布目录 → permittedModel() 直接放行（避免模型不在白名单时被拦）
        "visualCatalogPublished": False,
        # 模型下拉的数据源：为空时 #visualImageTier/#visualVideoTier 选不出值，
        # 前端就拿不到报价行 → 按钮显示"尚无有效价格"。
        "visualModels": [
            {"model": "google/nano-banana", "media": "image",
             "displayName": "Nano Banana", "enabled": True, "gatewayReady": True},
            {"model": "banana-pro", "media": "image",
             "displayName": "Banana Pro", "enabled": True, "gatewayReady": True},
            {"model": "seedance-2.0-anci", "media": "video",
             "displayName": "Seedance 2.0", "enabled": True, "gatewayReady": True},
        ],
    }


def client_config_pricing() -> dict[str, Any]:
    return {
        "pointsPerCny": POINTS_PER_CNY,
        "textButtonBindings": {key: dict(value)
                               for key, value in TEXT_BUTTON_BINDINGS.items()},
        "textModelPricing": [dict(row) for row in TEXT_MODEL_PRICING],
        "breakdownModels": dict(BREAKDOWN_MODELS),
        "textTaskCapabilities": {
            "workflow-outline-203": {"buttonId": "workflow-cut",
                                     "models": {"deepseek-v4.1-flash":
                                                {"contextWindowTokens": 1048576}}},
        },
    }
