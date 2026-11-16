"""视频生成客户端（/v1/media/generate + /v1/media/status）。

协议来自官方文档页（SPA，用 Playwright 渲染后提取）：
  POST {base}/v1/media/generate
      {"model": "...", "prompt": "...",
       "params": {"version": "快速|标准", "duration": "4~15",
                  "aspect_ratio": "16:9|9:16|1:1|4:3|3:4",
                  "resolution": "720p", "mode": "cankaosheng", "images": [...]},
       "notify_url": "https://..."}
      -> {"code":200, "data": {"task_id": 123}}
  GET  {base}/v1/media/status?task_id=123
      -> {"state": "pending|running|success|failed", "is_final": bool,
          "progress": "45%", "result_url": "...", "error": "", "cost": 0}

判断逻辑只能用 state 与 is_final；status/status_group 是中文展示字段。
视频任务常见 5~60 分钟，轮询上限默认给足，超时按未完成处理。
"""

from __future__ import annotations

import json
import os
import pathlib
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

DEFAULT_MODEL = "seedance-2.0-anci"
RATIOS = ("16:9", "9:16", "1:1", "4:3", "3:4")
VERSIONS = ("快速", "标准")


class VideoError(RuntimeError):
    def __init__(self, code: str, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


@dataclass
class VideoConfig:
    base_url: str = "https://api.lk888.ai"
    api_key: str = ""
    model: str = DEFAULT_MODEL
    version: str = "快速"
    duration: str = "4"
    aspect_ratio: str = "9:16"
    resolution: str = "720p"
    poll_interval: float = 10.0
    poll_timeout: float = 3600.0
    timeout: float = 120.0

    @property
    def enabled(self) -> bool:
        return bool(self.base_url.strip() and self.api_key.strip() and self.model.strip())

    @classmethod
    def load(cls, path: str | pathlib.Path) -> "VideoConfig":
        config = cls()
        file = pathlib.Path(path)
        if file.exists():
            try:
                data = json.loads(file.read_text(encoding="utf-8")).get("videos") or {}
                config = cls(
                    base_url=str(data.get("baseUrl") or config.base_url),
                    api_key=str(data.get("apiKey") or ""),
                    model=str(data.get("model") or config.model),
                    version=str(data.get("version") or config.version),
                    duration=str(data.get("duration") or config.duration),
                    aspect_ratio=str(data.get("aspectRatio") or data.get("aspect_ratio")
                                    or config.aspect_ratio),
                    resolution=str(data.get("resolution") or config.resolution),
                    poll_interval=float(data.get("pollInterval") or config.poll_interval),
                    poll_timeout=float(data.get("pollTimeout") or config.poll_timeout),
                )
            except (json.JSONDecodeError, TypeError, ValueError):
                pass
        config.base_url = (os.environ.get("NANBUDO_VIDEO_BASE_URL")
                           or config.base_url).strip()
        config.api_key = (os.environ.get("NANBUDO_VIDEO_API_KEY")
                          or config.api_key).strip()
        config.model = (os.environ.get("NANBUDO_VIDEO_MODEL") or config.model).strip()
        return config

def _headers(config: VideoConfig) -> dict[str, str]:
    return {"Authorization": f"Bearer {config.api_key}",
            "Content-Type": "application/json"}


def _post_json(config: VideoConfig, path: str, payload: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(f"{config.base_url.rstrip('/')}{path}",
                                    data=json.dumps(payload, ensure_ascii=False).encode(),
                                    method="POST", headers=_headers(config))
    try:
        with urllib.request.urlopen(request, timeout=config.timeout) as resp:
            return json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            body = {"_raw": raw[:200].decode("utf-8", "replace")}
        message = str((body.get("error") or {}).get("message") or body.get("msg")
                      or body.get("_raw") or "")[:200]
        raise VideoError("upstream_error", f"视频服务返回 {exc.code}: {message}",
                         exc.code) from exc
    except Exception as exc:  # noqa: BLE001
        raise VideoError("network", f"视频服务连接失败: {exc}") from exc


def _get_json(config: VideoConfig, path: str) -> dict[str, Any]:
    request = urllib.request.Request(f"{config.base_url.rstrip('/')}{path}",
                                    headers=_headers(config))
    try:
        with urllib.request.urlopen(request, timeout=config.timeout) as resp:
            return json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        raise VideoError("upstream_error", f"查询任务返回 {exc.code}", exc.code) from exc
    except Exception as exc:  # noqa: BLE001
        raise VideoError("network", f"查询任务失败: {exc}") from exc

def create_task(config: VideoConfig, prompt: str, *, duration: str | None = None,
                aspect_ratio: str | None = None, version: str | None = None,
                images: list[str] | None = None) -> str:
    if not config.enabled:
        raise VideoError("model_unconfigured",
                         "视频模型未配置：请在 data/model-config.json 的 videos 段填 "
                         "baseUrl/apiKey/model。")
    if not prompt.strip():
        raise VideoError("invalid_input", "提示词不能为空。")
    params: dict[str, Any] = {
        "version": version or config.version,
        "duration": str(duration or config.duration),
        "aspect_ratio": aspect_ratio or config.aspect_ratio,
        "resolution": config.resolution,
    }
    if images:
        params["images"] = list(images)[:9]
    body = _post_json(config, "/v1/media/generate",
                       {"model": config.model, "prompt": prompt, "params": params})
    data = body.get("data") if isinstance(body, dict) else None
    task_id = (data or {}).get("task_id") if isinstance(data, dict) else None
    if not task_id:
        raise VideoError("upstream_error",
                         f"创建视频任务未返回 task_id: {str(body)[:160]}")
    return str(task_id)


def task_status(config: VideoConfig, task_id: str) -> dict[str, Any]:
    body = _get_json(config, f"/v1/media/status?task_id={task_id}")
    data = body.get("data") if isinstance(body, dict) else None
    if isinstance(data, dict) and ("state" in data or "is_final" in data):
        body = data
    return {
        "taskId": str(task_id),
        "state": str(body.get("state") or "pending"),
        "isFinal": bool(body.get("is_final")),
        "progress": str(body.get("progress") or ""),
        "resultUrl": str(body.get("result_url") or ""),
        "resultType": str(body.get("result_type") or ""),
        "error": str(body.get("error") or ""),
        "cost": body.get("cost") or 0,
    }


def poll(config: VideoConfig, task_id: str, *, on_progress=None,
         timeout: float | None = None) -> dict[str, Any]:
    deadline = time.time() + (timeout if timeout is not None else config.poll_timeout)
    status = task_status(config, task_id)
    while not status["isFinal"] and time.time() < deadline:
        if status["state"] == "failed":
            raise VideoError("upstream_error", status["error"] or "视频生成失败")
        if on_progress:
            on_progress(status)
        time.sleep(config.poll_interval)
        status = task_status(config, task_id)
    if not status["isFinal"]:
        raise VideoError("timeout", "视频生成超时，未在等待上限内完成。")
    if status["state"] == "failed":
        raise VideoError("upstream_error", status["error"] or "视频生成失败")
    return status


def download(config: VideoConfig, url: str, *, timeout: float = 900.0) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            data = resp.read()
    except Exception as exc:  # noqa: BLE001
        raise VideoError("network", f"视频下载失败: {exc}") from exc
    if not data:
        raise VideoError("internal", "下载到的视频为空。")
    return data