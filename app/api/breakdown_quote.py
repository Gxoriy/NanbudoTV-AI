"""爆款拆解报价：前端要求 plan.quote.estimatedPoints > 0。"""

from __future__ import annotations

import time
from typing import Any


def quote_response(body: dict[str, Any]) -> dict[str, Any]:
    try:
        duration = int(body.get("duration") or 5)
    except (TypeError, ValueError):
        duration = 5
    return {
        "ok": True,
        "modelName": str(body.get("model") or "Seedance 2.0"),
        "duration": duration,
        "creativeSimilarity": None,
        "quote": {
            "quoteId": f"bd-{int(time.time() * 1000)}",
            "estimatedPoints": 1.0,
            "unitCredits": 1.0,
            "totalCredits": 1.0,
            "maxCalls": 1,
            "pricingMode": "flat",
            "expiresAt": time.time() + 600,
        },
    }
