"""自建云端服务客户端（计费归零版）。

服务端契约（我们自己定，服务端实现见 `server/`）：
    POST {baseUrl}/api/v1/subtitle/remove
    headers: Authorization: Bearer <token>（可空）
             X-Region: {"x":0,"y":80,"width":100,"height":20}
             X-Quality: standard|fine
    body:    原始视频字节（≤ 服务端上限）
    200 ->   处理后的视频字节（Content-Type: video/mp4）
    4xx ->   {"error": "...", "message": "..."}

传输层只用标准库，和内核保持一致；不在客户端做重试风暴——
视频处理是重任务，重试应由用户在 UI 上显式决定。
"""

from __future__ import annotations

import json
import pathlib
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


class CloudError(RuntimeError):
    def __init__(self, code: str, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


@dataclass
class CloudClient:
    base_url: str
    token: str = ""
    timeout: float = 600.0

    def __post_init__(self) -> None:
        # 手改配置很容易带 BOM/空白：不清理会在 putheader 时抛
        # 'latin-1' codec can't encode character '\ufeff'
        # BOM 可能在首尾（编辑器/重定向都可能加），直接全局删掉再 trim
        self.base_url = self.base_url.replace("\ufeff", "").strip()
        self.token = self.token.replace("\ufeff", "").strip()

    @property
    def enabled(self) -> bool:
        return bool(self.base_url.strip())

    def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        headers = {"Content-Type": "application/octet-stream"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        headers.update(extra or {})
        return headers

    def health(self) -> dict[str, Any]:
        if not self.enabled:
            raise CloudError("unconfigured", "云端服务地址未配置。")
        try:
            with urllib.request.urlopen(
                    f"{self.base_url.rstrip('/')}/api/v1/health", timeout=10) as resp:
                return json.loads(resp.read().decode("utf-8") or "{}")
        except (urllib.error.URLError, TimeoutError) as exc:
            raise CloudError("network", f"无法连接云端服务: {exc}") from exc

    def remove_subtitle(self, source: str | pathlib.Path, region: dict[str, int],
                        quality: str) -> bytes:
        if not self.enabled:
            raise CloudError("unconfigured", "云端服务地址未配置。")
        data = pathlib.Path(source).read_bytes()
        request = urllib.request.Request(
            f"{self.base_url.rstrip('/')}/api/v1/subtitle/remove", data=data,
            method="POST",
            headers=self._headers({"X-Region": json.dumps(region),
                                   "X-Quality": quality}))
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as resp:
                body = resp.read()
                if not body:
                    raise CloudError("internal", "云端返回空结果。")
                return body
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            try:
                payload = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                payload = {}
            code = str(payload.get("error") or "internal")
            message = str(payload.get("message") or f"云端返回 HTTP {exc.code}")
            raise CloudError(code, message, status=exc.code) from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise CloudError("network", f"上传云端失败: {exc}") from exc
