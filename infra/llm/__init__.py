"""LLM 网关（P1-03）。

用法：
    from infra.llm import registry, client
    registry.load_builtin()
    store = registry.ProfileStore(data_dir / "llm-profiles.json")
    text = client.complete(registry.get("qwen"), [{"role": "user", "content": "hi"}],
                           api_key=store.api_key("qwen"))
"""

from .base import PROTOCOLS, LLMError, Provider, mask_key
from .client import build_payload, complete, endpoint_of, extract_text
from .registry import ProfileStore, all_providers, get, load_builtin, register
from .transport import HttpResult, Transport, UrllibTransport, post_with_retry

__all__ = [
    "Provider", "LLMError", "PROTOCOLS", "mask_key",
    "register", "load_builtin", "get", "all_providers", "ProfileStore",
    "complete", "build_payload", "extract_text", "endpoint_of",
    "post_with_retry", "Transport", "UrllibTransport", "HttpResult",
]
