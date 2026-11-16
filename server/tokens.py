"""访问令牌：HMAC-SHA256 自签，纯标准库。

格式：`base64url(payload_json) + "." + base64url(hmac_sha256(secret, payload))`

为什么不用 JWT 库：服务端要能在只有标准库的 Windows 机器上直接跑，
而这里需要的只是"签名 + 过期 + 用户名"，不需要 JWT 的算法协商。
签名覆盖 payload 原文，改一个字节就失效。
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any


class TokenError(ValueError):
    """令牌无效/过期。"""


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _unb64(text: str) -> bytes:
    padding = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + padding)


def issue(secret: str, username: str, *, ttl_seconds: int = 30 * 24 * 3600,
          now: float | None = None) -> str:
    issued = int(now if now is not None else time.time())
    payload = {"u": username, "iat": issued, "exp": issued + ttl_seconds,
               "n": base64.urlsafe_b64encode(hashlib.sha256(
                   f"{username}:{issued}".encode()).digest()[:9]).decode("ascii")}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(secret.encode("utf-8"), body.encode("ascii"),
                         hashlib.sha256).digest()
    return f"{body}.{_b64(signature)}"


def verify(secret: str, token: str, *, now: float | None = None) -> dict[str, Any]:
    if not token or token.count(".") != 1:
        raise TokenError("令牌格式错误")
    body, signature = token.split(".", 1)
    expected = hmac.new(secret.encode("utf-8"), body.encode("ascii"),
                        hashlib.sha256).digest()
    try:
        given = _unb64(signature)
    except (ValueError, base64.binascii.Error) as exc:   # type: ignore[attr-defined]
        raise TokenError("令牌签名不可解码") from exc
    if not hmac.compare_digest(expected, given):
        raise TokenError("令牌签名不匹配")
    try:
        payload = json.loads(_unb64(body))
    except (ValueError, json.JSONDecodeError) as exc:
        raise TokenError("令牌负载不可解析") from exc
    if int(payload.get("exp", 0)) <= int(now if now is not None else time.time()):
        raise TokenError("令牌已过期")
    return payload
