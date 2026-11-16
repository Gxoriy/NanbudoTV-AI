"""图像生成客户端，支持两种上游协议。

1) `openai`（默认）——OpenAI 兼容 `/v1/images/generations`
   POST {base}/v1/images/generations {"model","prompt","n","size","response_format":"b64_json"}
   → {"data":[{"b64_json"|"url"}]}
   协议取自参考实现 `musical-creation-rust-master/services/cover.rs`。

2) `kie`——异步任务制（实测 43.130.31.50:18813 这个中转只认这种）
   POST {base}/api/v1/jobs/createTask {"model":"google/nano-banana","input":{"prompt"}}
   GET  {base}/api/v1/jobs/recordInfo?taskId=...
   → {"data":{"state":"waiting|success|fail","resultJson":"{...resultUrls:[url]}"}}
   成功后再下载图片字节。

配置放 `data/model-config.json`（不入库），也支持环境变量：
  NANBUDO_IMAGE_PROTOCOL / NANBUDO_IMAGE_BASE_URL / NANBUDO_IMAGE_API_KEY / NANBUDO_IMAGE_MODEL
未配置时调用方应返回 503 `model_unconfigured`，不要把空图当成功。
"""

from __future__ import annotations

import base64
import json
import os
import pathlib
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Protocol

DONE_STATES = {"success", "succeed", "succeeded", "completed", "done"}
FAIL_STATES = {"fail", "failed", "error", "canceled", "cancelled"}


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
    protocol: str = "openai"        # openai | kie
    timeout: float = 600.0          # 单次 HTTP 超时
    poll_interval: float = 3.0      # kie 轮询间隔
    poll_timeout: float = 600.0     # kie 整体等待上限（对齐"最多等 600s"）

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
                config = cls(
                    base_url=str(data.get("baseUrl") or ""),
                    api_key=str(data.get("apiKey") or ""),
                    model=str(data.get("model") or config.model),
                    size=str(data.get("size") or config.size),
                    protocol=str(data.get("protocol") or config.protocol),
                    timeout=float(data.get("timeout") or config.timeout),
                    poll_interval=float(data.get("pollInterval") or config.poll_interval),
                    poll_timeout=float(data.get("pollTimeout") or config.poll_timeout),
                )
            except (json.JSONDecodeError, TypeError, ValueError):
                pass
        config.base_url = (os.environ.get("NANBUDO_IMAGE_BASE_URL")
                           or config.base_url).replace("\ufeff", "").strip()
        config.api_key = (os.environ.get("NANBUDO_IMAGE_API_KEY")
                          or config.api_key).strip()
        config.model = (os.environ.get("NANBUDO_IMAGE_MODEL") or config.model).strip()
        config.protocol = (os.environ.get("NANBUDO_IMAGE_PROTOCOL")
                           or config.protocol).strip().lower()
        return config


class Transport(Protocol):
    def post_json(self, url: str, headers: dict[str, str],
                  payload: dict[str, Any], timeout: float) -> tuple[int, dict[str, Any]]: ...

    def get_json(self, url: str, headers: dict[str, str],
                 timeout: float) -> tuple[int, dict[str, Any]]: ...


def _decode(raw: bytes) -> dict[str, Any]:
    try:
        return json.loads(raw.decode("utf-8") or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {"_raw": raw[:300].decode("utf-8", "replace")}


class UrllibTransport:
    def _request(self, url: str, headers: dict[str, str], payload: dict[str, Any] | None,
                 timeout: float) -> tuple[int, dict[str, Any]]:
        request = urllib.request.Request(
            url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload else None,
            method="POST" if payload else "GET",
            headers={"Content-Type": "application/json", **headers})
        try:
            with urllib.request.urlopen(request, timeout=timeout) as resp:
                return resp.status, _decode(resp.read())
        except urllib.error.HTTPError as exc:
            return exc.code, _decode(exc.read())
        except (urllib.error.URLError, TimeoutError) as exc:
            raise ImageError("network", f"连接图像服务失败: {exc}") from exc

    def post_json(self, url: str, headers: dict[str, str], payload: dict[str, Any],
                  timeout: float) -> tuple[int, dict[str, Any]]:
        return self._request(url, headers, payload, timeout)

    def get_json(self, url: str, headers: dict[str, str],
                 timeout: float) -> tuple[int, dict[str, Any]]:
        return self._request(url, headers, None, timeout)


def endpoint(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/images/generations"):
        return base
    if base.endswith("/v1"):
        return f"{base}/images/generations"
    return f"{base}/v1/images/generations"


def _download(url: str, timeout: float) -> bytes:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            data = resp.read()
    except (urllib.error.URLError, TimeoutError) as exc:
        raise ImageError("network", f"下载生成图失败: {exc}") from exc
    if not data:
        raise ImageError("internal", "下载到的图片为空。")
    return data


def _error_detail(body: dict[str, Any]) -> str:
    error = body.get("error")
    if isinstance(error, dict):
        return str(error.get("message") or error.get("type") or "").strip()
    if error:
        return str(error)
    return str(body.get("message") or body.get("msg") or "").strip()


def _openai_generate(config: ImageConfig, prompt: str, transport: Transport,
                     size: str | None) -> bytes:
    payload = {"model": config.model, "prompt": prompt, "n": 1,
               "size": size or config.size, "response_format": "b64_json"}
    headers = {"Authorization": f"Bearer {config.api_key}"} if config.api_key else {}
    status, body = transport.post_json(endpoint(config.base_url), headers, payload,
                                       config.timeout)
    if status >= 400:
        detail = _error_detail(body) or "上游空响应（多为服务端 502/网关错误）"
        raise ImageError("internal", f"图像服务返回 {status}: {detail[:200]}", status)
    data = (body.get("data") or [{}])[0]
    if data.get("b64_json"):
        return base64.b64decode(data["b64_json"])
    if data.get("url"):
        return _download(str(data["url"]), config.timeout)
    detail = _error_detail(body)
    raise ImageError("internal", f"图像服务未返回图片: {detail[:160] or '空响应'}")


def _kie_generate(config: ImageConfig, prompt: str, transport: Transport) -> bytes:
    base = config.base_url.rstrip("/")
    headers = {"Authorization": f"Bearer {config.api_key}"} if config.api_key else {}
    status, body = transport.post_json(
        f"{base}/api/v1/jobs/createTask", headers,
        {"model": config.model, "input": {"prompt": prompt}}, config.timeout)
    if status >= 400 or int(body.get("code") or 0) >= 400:
        detail = _error_detail(body) or str(body)[:160]
        raise ImageError("internal", f"创建任务失败（{status}）: {detail}", status)
    task_id = ((body.get("data") or {}) if isinstance(body, dict) else {}).get("taskId")
    if not task_id:
        raise ImageError("internal", f"创建任务未返回 taskId: {str(body)[:160]}")

    deadline = time.time() + config.poll_timeout
    while time.time() < deadline:
        time.sleep(config.poll_interval)
        status, body = transport.get_json(
            f"{base}/api/v1/jobs/recordInfo?taskId={task_id}", headers, config.timeout)
        data = body.get("data") or {}
        state = str(data.get("state") or data.get("status") or "").lower()
        if state in FAIL_STATES:
            reason = data.get("failMsg") or data.get("failCode") or "上游返回失败"
            raise ImageError("internal", f"生成失败: {reason}")
        if state in DONE_STATES:
            result = data.get("resultJson") or {}
            if isinstance(result, str):
                try:
                    result = json.loads(result)
                except json.JSONDecodeError:
                    result = {}
            urls = result.get("resultUrls") or result.get("urls") or []
            if not urls:
                raise ImageError("internal", "任务成功但没有返回图片地址。")
            return _download(str(urls[0]), config.timeout)
    raise ImageError("timeout", f"等待生成超时（{int(config.poll_timeout)}s）。")


def generate(config: ImageConfig, prompt: str, *,
             transport: Transport | None = None, size: str | None = None) -> bytes:
    if not config.enabled:
        raise ImageError("model_unconfigured",
                         "图像模型未配置：请在 data/model-config.json 填 baseUrl/apiKey/model"
                         "（protocol 可选 openai / kie）。")
    if not prompt.strip():
        raise ImageError("invalid_input", "提示词不能为空。")
    client = transport or UrllibTransport()
    if config.protocol == "kie":
        return _kie_generate(config, prompt, client)
    return _openai_generate(config, prompt, client, size)
