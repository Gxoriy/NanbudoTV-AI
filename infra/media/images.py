"""图像生成客户端（OpenAI 兼容 `/images/generations`）。

协议取自参考实现 `musical-creation-rust-master/services/cover.rs`：
  POST {base}/v1/images/generations
  body: {"model": "...", "prompt": "...", "n": 1, "size": "1024x1024",
         "response_format": "b64_json"}
  返回: {"data": [{"b64_json": "..."} | {"url": "https://..."}]}

配置放 `data/model-config.json`（不入库），也支持环境变量：
  NANBUDO_IMAGE_BASE_URL / NANBUDO_IMAGE_API_KEY / NANBUDO_IMAGE_MODEL
未配置时调用方应返回 503 `model_unconfigured`，不要把空图当成功。
"""

from __future__ import annotations

import base64
import json
import os
import pathlib
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Protocol


class ImageError(RuntimeError):
    def __init__(self, code: str, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


@dataclass
class ImageConfig:
    base_url: str = ""
    api_key: str = ""
    model: str = "gpt_image_2.5"
    size: str = "1024x1024"
    timeout: float = 600.0          # 图像模型慢，最长等 10 分钟

    @property
    def enabled(self) -> bool:
        return bool(self.base_url.strip() and self.model.strip())

    @classmethod
    def load(cls, path: str | pathlib.Path) -> "ImageConfig":
        config = cls()
        file = pathlib.Path(path)
        if file.exists():
            try:
                data = json.loads(file.read_text(encoding="utf-8")).get("images") or {}
                config = cls(base_url=str(data.get("baseUrl") or ""),
                             api_key=str(data.get("apiKey") or ""),
                             model=str(data.get("model") or config.model),
                             size=str(data.get("size") or config.size),
                             timeout=float(data.get("timeout") or config.timeout))
            except (json.JSONDecodeError, TypeError, ValueError):
                pass
        config.base_url = (os.environ.get("NANBUDO_IMAGE_BASE_URL") or config.base_url).strip()
        config.api_key = (os.environ.get("NANBUDO_IMAGE_API_KEY") or config.api_key).strip()
        config.model = (os.environ.get("NANBUDO_IMAGE_MODEL") or config.model).strip()
        return config


class Transport(Protocol):
    def post_json(self, url: str, headers: dict[str, str],
                  payload: dict[str, Any], timeout: float) -> tuple[int, dict[str, Any]]: ...


class UrllibTransport:
    def post_json(self, url: str, headers: dict[str, str], payload: dict[str, Any],
                  timeout: float) -> tuple[int, dict[str, Any]]:
        request = urllib.request.Request(
            url, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            method="POST", headers={"Content-Type": "application/json", **headers})
        try:
            with urllib.request.urlopen(request, timeout=timeout) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            try:
                body = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                body = {"_raw": raw[:300].decode("utf-8", "replace")}
            return exc.code, body
        except (urllib.error.URLError, TimeoutError) as exc:
            raise ImageError("network", f"连接图像服务失败: {exc}") from exc


def endpoint(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/images/generations"):
        return base
    if base.endswith("/v1"):
        return f"{base}/images/generations"
    return f"{base}/v1/images/generations"


def generate(config: ImageConfig, prompt: str, *,
             transport: Transport | None = None, size: str | None = None) -> bytes:
    if not config.enabled:
        raise ImageError("model_unconfigured",
                         "图像模型未配置：请在 data/model-config.json 填 baseUrl/apiKey/model。")
    if not prompt.strip():
        raise ImageError("invalid_input", "提示词不能为空。")
    payload = {"model": config.model, "prompt": prompt, "n": 1,
               "size": size or config.size, "response_format": "b64_json"}
    headers = {"Authorization": f"Bearer {config.api_key}"} if config.api_key else {}
    status, body = (transport or UrllibTransport()).post_json(
        endpoint(config.base_url), headers, payload, config.timeout)
    if status >= 400:
        detail = str(body.get("error") or body.get("message") or "").strip()
        if not detail:
            detail = "上游空响应（多为服务端 502/网关错误）"
        raise ImageError("internal", f"图像服务返回 {status}: {detail[:200]}", status)
    data = (body.get("data") or [{}])[0]
    encoded = data.get("b64_json")
    if encoded:
        return base64.b64decode(encoded)
    url = data.get("url")
    if url:
        try:
            with urllib.request.urlopen(url, timeout=config.timeout) as resp:
                return resp.read()
        except (urllib.error.URLError, TimeoutError) as exc:
            raise ImageError("network", f"下载生成图失败: {exc}") from exc
    raise ImageError("internal", "图像服务未返回 b64_json 或 url。")
