"""单卡媒体报价的纯函数：把前端逐项校验所需字段补齐。"""

from __future__ import annotations

import time
import uuid
from typing import Any, Callable

from domain.pricing import IMAGE_PRICING, VIDEO_PRICING


def build_quote(body: dict[str, Any], macro: Callable[[str], dict],
                quotes: dict[str, dict]) -> dict[str, Any]:
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
    state = dict(macro(project_id) or {})
    for scene in (state.get("scenes") or []):
        if str(scene.get("id")) != segment_id:
            continue
        for card in (scene.get("cards") or []):
            if int(card.get("number") or 0) == card_number:
                quote["source"] = str(card.get("storyboard")
                                      or card.get("prompt") or "")[:4000]
                break
        break
    if not quote.get("source"):
        draft = (((state.get("cardDrafts") or {}).get(segment_id) or {})
                 .get(str(card_number)) or {})
        quote["source"] = str(draft.get("prompt") or "")[:4000]
    quotes[quote["quoteId"]] = quote
    return {key: value for key, value in quote.items() if key != "source"}
