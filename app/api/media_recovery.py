"""从已完成任务回补宏快照的 media 记录（旧任务没有 segmentId/cardNumber）。"""

from __future__ import annotations

import re
from typing import Any


def recover_media(project_id: str, saved_media: dict[str, Any],
                  scenes: list[dict[str, Any]],
                  tasks: list[Any]) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    media = {key: dict(value) for key, value in (saved_media or {}).items()}
    cards: dict[str, dict[str, Any]] = {}
    for task in tasks or []:
        try:
            if str(getattr(task, "state", "")) != "done":
                continue
            result = dict(getattr(task, "result", None) or {})
            payload = dict(getattr(task, "payload", None) or {})
            file_value = str(result.get("file") or "")
            if not file_value.lower().endswith(".mp4"):
                continue
            if payload.get("projectId") and str(payload["projectId"]) != project_id:
                continue
            prompt = str(payload.get("prompt") or "")
            segment = str(result.get("segmentId") or "")
            if not segment:
                for scene in scenes:
                    title = str(scene.get("title") or "")
                    if title and title[:12] in prompt:
                        segment = str(scene.get("id") or "")
                        break
            if not segment and scenes:
                segment = str(scenes[0].get("id") or "")
            if not segment:
                continue
            number = result.get("cardNumber")
            if number is None:
                match = re.search(r"【镜头】\s*(\d+)", prompt)
                number = int(match.group(1)) if match else 1
            slots = dict(cards.get(segment) or {})
            slots.setdefault(str(number), {
                "number": int(number), "storyboard": prompt[:400],
                "sourceText": prompt[:400], "complete": True,
                "durationSeconds": 4,
            })
            cards[segment] = slots

            scene = dict(media.get(segment) or {})
            row = dict(scene.get(str(number)) or {})
            if row.get("videoFile"):
                continue
            history = list(row.get("history") or [])
            history.append({"file": file_value,
                            "assetId": result.get("assetId"),
                            "upstreamTaskId": result.get("upstreamTaskId"),
                            "taskId": getattr(task, "id", "")})
            row.update({"videoFile": file_value, "assetId": result.get("assetId"),
                        "upstreamTaskId": result.get("upstreamTaskId"),
                        "taskId": getattr(task, "id", ""), "status": "done",
                        "history": history[-20:]})
            scene[str(number)] = row
            media[segment] = scene
        except (AttributeError, TypeError, ValueError):
            continue
    return media, cards
