"""HTTP 传输层：可替换实现，便于离线测试（不引入 httpx 依赖）。

重试策略只覆盖可重试错误（429/5xx/网络），4xx 一律不重试——避免把
"密钥错误"重试成一串无意义的请求。
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Protocol

from .base import LLMError

RETRY_STATUS = {408, 409, 425, 429, 500, 502, 503, 504}


@dataclass
class HttpResult:
    status: int
    body: dict[str, Any] = field(default_factory=dict)
    raw: bytes = b""


class Transport(Protocol):
    def post_json(self, url: str, headers: dict[str, str],
                  payload: dict[str, Any], timeout: float) -> HttpResult: ...


class UrllibTransport:
    def post_json(self, url: str, headers: dict[str, str],
                  payload: dict[str, Any], timeout: float) -> HttpResult:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(url, data=data, method="POST",
                                     headers={"Content-Type": "application/json", **headers})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
                return HttpResult(resp.status, _maybe_json(raw), raw)
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            return HttpResult(exc.code, _maybe_json(raw), raw)
        except Exception as exc:  # noqa: BLE001
            raise LLMError("network", f"请求失败: {exc}") from exc


def _maybe_json(raw: bytes) -> dict[str, Any]:
    try:
        obj = json.loads(raw.decode("utf-8", "replace"))
        return obj if isinstance(obj, dict) else {"_data": obj}
    except json.JSONDecodeError:
        return {"_raw": raw.decode("utf-8", "replace")[:2000]}


def post_with_retry(transport: Transport, url: str, headers: dict[str, str],
                    payload: dict[str, Any], *, timeout: float = 60.0,
                    retries: int = 2, backoff: float = 1.5) -> HttpResult:
    last: LLMError | None = None
    for attempt in range(retries + 1):
        result = transport.post_json(url, headers, payload, timeout)
        if result.status < 400:
            return result
        if result.status not in RETRY_STATUS:
            raise LLMError(_classify(result.status), _error_message(result),
                           status=result.status, detail=result.body)
        last = LLMError(_classify(result.status), _error_message(result),
                        status=result.status, detail=result.body)
        if attempt < retries:
            time.sleep(backoff ** attempt)
    raise last or LLMError("internal", "未知请求失败")


def _classify(status: int) -> str:
    if status == 401 or status == 403:
        return "auth"
    if status == 429:
        return "rate_limit"
    if status in (402, 451):
        return "quota"
    if status in (400, 404, 422):
        return "invalid_input"
    if status >= 500:
        return "internal"
    return "network"


def _error_message(result: HttpResult) -> str:
    body = result.body
    for key in ("error", "message", "msg", "detail"):
        value = body.get(key) if isinstance(body, dict) else None
        if isinstance(value, str) and value:
            return value
        if isinstance(value, dict):
            nested = value.get("message")
            if isinstance(nested, str) and nested:
                return nested
    return f"HTTP {result.status}"
