"""协议适配：把统一的 messages 转成各家 payload，并把响应解析回文本。

实测基线（spec/api-samples/api_model-profiles.json）：
  豆包  ark  /api/v3            protocol=responses
  千问  dashscope compatible    protocol=chat_completions
因此只实现这两种，其它家一律通过 custom + 任一协议接入，不新增协议分支。
"""

from __future__ import annotations

from typing import Any, Mapping, Sequence

from .base import LLMError, Provider
from .transport import Transport, UrllibTransport, post_with_retry

Message = Mapping[str, str]


def endpoint_of(base_url: str, protocol: str) -> str:
    base = (base_url or "").rstrip("/")
    if protocol == "responses":
        return f"{base}/responses"
    return f"{base}/chat/completions"


def build_payload(protocol: str, model: str,
                  messages: Sequence[Message], **options: Any) -> dict[str, Any]:
    normalised = [{"role": m["role"], "content": str(m["content"])} for m in messages]
    if protocol == "responses":
        payload: dict[str, Any] = {
            "model": model,
            "input": [
                {"role": m["role"],
                 "content": [{"type": "input_text", "text": m["content"]}]}
                for m in normalised
            ],
        }
    elif protocol == "chat_completions":
        payload = {"model": model, "messages": normalised}
    else:
        raise LLMError("unsupported", f"不支持的协议: {protocol}")
    payload.update({k: v for k, v in options.items() if v is not None})
    return payload


def extract_text(protocol: str, body: dict[str, Any]) -> str:
    if protocol == "chat_completions":
        choices = body.get("choices") or []
        if not choices:
            raise LLMError("internal", "响应缺少 choices", detail=body)
        content = (choices[0].get("message") or {}).get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):        # 多模态分段返回
            return "".join(
                part.get("text", "") for part in content if isinstance(part, dict))
        raise LLMError("internal", "响应 content 结构未知", detail=choices[0])

    if protocol == "responses":
        parts: list[str] = []
        for item in body.get("output") or []:
            for chunk in item.get("content") or []:
                if isinstance(chunk, dict) and isinstance(chunk.get("text"), str):
                    parts.append(chunk["text"])
        if not parts and isinstance(body.get("output_text"), str):
            parts.append(body["output_text"])
        if not parts:
            raise LLMError("internal", "响应缺少 output 文本", detail=body)
        return "".join(parts)

    raise LLMError("unsupported", f"不支持的协议: {protocol}")


def complete(provider: Provider, messages: Sequence[Message], *,
             api_key: str, transport: Transport | None = None,
             base_url: str | None = None, model: str | None = None,
             timeout: float = 60.0, retries: int = 2,
             **options: Any) -> str:
    if not api_key:
        raise LLMError("auth", f"{provider.label} 未配置 API Key")
    effective_base = base_url or provider.base_url
    if not effective_base:
        raise LLMError("invalid_input", f"{provider.label} 未配置 baseUrl")
    url = endpoint_of(effective_base, provider.protocol)
    payload = build_payload(provider.protocol, model or provider.model, messages, **options)
    headers = {
        "Authorization": f"Bearer {api_key}",
        **provider.extra_headers,
    }
    result = post_with_retry(transport or UrllibTransport(), url, headers, payload,
                             timeout=timeout, retries=retries)
    return extract_text(provider.protocol, result.body)
