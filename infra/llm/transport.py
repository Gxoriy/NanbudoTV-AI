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

    # 可选：支持流式的传输层实现它即可（当前只有 UrllibTransport）
    # def post_stream(self, url, headers, payload, timeout) -> Iterator[str]: ...


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

    def post_stream(self, url: str, headers: dict[str, str],
                    payload: dict[str, Any], timeout: float):
        """SSE 流式：逐块 yield `delta.content`。

        非流式 + 长输出会被部分中转直接掐断（实测 lk666 / new.api.edu 均如此），
        流式则稳定；因此上层优先走这里，失败再回落普通请求。
        """
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            url, data=data, method="POST",
            headers={"Content-Type": "application/json", "Accept": "text/event-stream",
                     **headers})
        try:
            resp = urllib.request.urlopen(req, timeout=timeout)
        except urllib.error.HTTPError as exc:
            raise LLMError("internal", f"流式请求返回 {exc.code}",
                           detail=_maybe_json(exc.read()))
        except Exception as exc:  # noqa: BLE001
            raise LLMError("network", f"流式请求失败: {exc}") from exc

        try:
            with resp:
                for raw in resp:
                    line = raw.decode("utf-8", "replace").strip()
                    if not line or not line.startswith("data:"):
                        continue
                    chunk = line[5:].strip()
                    if chunk in ("", "[DONE]"):
                        continue
                    try:
                        body = json.loads(chunk)
                    except json.JSONDecodeError:
                        continue
                    for choice in body.get("choices") or []:
                        delta = choice.get("delta") or {}
                        content = delta.get("content")
                        if isinstance(content, str) and content:
                            yield content
        finally:
            try:
                resp.close()
            except Exception:  # noqa: BLE001
                pass


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
