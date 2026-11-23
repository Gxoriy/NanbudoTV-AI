"""单卡媒体报价的纯函数：把前端逐项校验所需字段补齐。"""

from __future__ import annotations

import time
import uuid
from typing import Any, Callable

from domain.pricing import IMAGE_PRICING, VIDEO_PRICING


def build_quote(body: dict[str, Any], macro: Callable[[str], dict],
                quotes: dict[str, dict],
                settings: dict[str, Any] | None = None) -> dict[str, Any]:
    project_id = str(body.get("projectId") or "")
    segment_id = str(body.get("segmentId") or "")
    card_number = int(body.get("cardNumber") or 1)
    action = str(body.get("action") or "video")
    model = str(body.get("model") or "")
    resolution = str(body.get("resolution") or "")
    ratio = str(body.get("ratio") or "")
    try:
        duration = int(body.get("duration") or body.get("durationSeconds") or 4)
    except (TypeError, ValueError):
        duration = 4

    rows = VIDEO_PRICING if action == "video" else IMAGE_PRICING
    price = 1.0
    for row in rows:
        if (str(row.get("model")) == model
                and str(row.get("resolution")).lower() == resolution.lower()):
            price = float(row.get("pricePerSecond")
                          or row.get("pricePerImage") or 1.0)
            if action == "video":
                price *= duration
            break
    price = max(1.0, round(price, 4))

    quote: dict[str, Any] = {
        "ok": True,
        "quoteId": uuid.uuid4().hex,
        "projectId": project_id,
        "action": action,
        "segmentId": segment_id,
        "cardNumber": card_number,
        "model": model,
        "resolution": resolution,
        "ratio": ratio,
        "duration": duration,
        "durationSeconds": duration,
        "maxCalls": 1,
        "unitCredits": price,
        "totalCredits": price,
        "estimatedPoints": price,
        "expiresAt": time.time() + 600,
        "pricingMode": "flat",
        "referenceAssetIds": list(body.get("referenceAssetIds") or []),
    }
    settings = dict(settings or {})
    state = dict(macro(project_id) or {})
    current_scene = None
    for scene in (state.get("scenes") or []):
        if str(scene.get("id")) == segment_id:
            current_scene = scene
            break
    cards = list((current_scene or {}).get("cards") or [])
    cards.sort(key=lambda row: int(row.get("number") or 0))
    index = card_number - 1

    def card_text(row: dict[str, Any] | None) -> str:
        return str((row or {}).get("storyboard") or (row or {}).get("prompt") or "")

    current = card_text(cards[index] if 0 <= index < len(cards) else None)
    previous = card_text(cards[index - 1] if 0 < index <= len(cards) else None)
    following = card_text(cards[index + 1] if 0 <= index + 1 < len(cards) else None)
    if not current:
        draft = (((state.get("cardDrafts") or {}).get(segment_id) or {})
                 .get(str(card_number)) or {})
        current = str(draft.get("prompt") or "")

    style_spec = dict(settings.get("styleSpec") or {})
    style = str(style_spec.get("prompt") or "").strip()
    title = str((current_scene or {}).get("title") or "").strip()
    parts = []
    if style:
        parts.append("统一美术风格：" + style)
    if title:
        parts.append("当前场次：" + title)
    parts.append("本镜头：" + current)
    if previous:
        parts.append("上一镜头：" + previous)
    if following:
        parts.append("下一镜头：" + following)
    parts.append("请保持人物造型、服装、场景布局、色板、材质与光线在相邻镜头间连续一致；"
                 "只生成本镜头画面，不添加剧情外元素。")
    quote["source"] = "\n".join(parts)[:4000]
    quotes[quote["quoteId"]] = quote
    return {key: value for key, value in quote.items() if key != "source"}
