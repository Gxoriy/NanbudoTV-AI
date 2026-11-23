"""本地抽帧 + 视觉模型分析（爆款拆解用）。

文本辅助的 messages 会把 content 强制字符串化，不能带图片；
这里直连 OpenAI 兼容的 /chat/completions，只用于多模态拆解。
"""

from __future__ import annotations

import base64
import json
import pathlib
import shutil
import subprocess
from typing import Any

from .assist import extract_json


def ffmpeg_bin() -> str | None:
    found = shutil.which("ffmpeg")
    if found:
        return found
    fixed = pathlib.Path(r"E:\PublicWork\ffmpeg\bin\ffmpeg.exe")
    return str(fixed) if fixed.exists() else None


def sample_frames(video: pathlib.Path, start: float, limit: float,
                  count: int = 6) -> list[bytes]:
    binary = ffmpeg_bin()
    if not binary or not video.exists():
        return []
    frames: list[bytes] = []
    for index in range(count):
        second = start + limit * (index + 0.5) / count
        proc = subprocess.run(
            [binary, "-loglevel", "error", "-ss", f"{second:.2f}",
             "-i", str(video), "-frames:v", "1", "-vf", "scale=640:-2",
             "-q:v", "5", "-f", "image2pipe", "-vcodec", "mjpeg", "-"],
            capture_output=True, timeout=30, check=False)
        if proc.returncode == 0 and proc.stdout[:2] == b"\xff\xd8":
            frames.append(proc.stdout)
    return frames


def _credentials(profiles_path: pathlib.Path) -> tuple[str, str, str]:
    data = json.loads(profiles_path.read_text(encoding="utf-8"))
    custom = dict(data.get("custom") or {})
    base = str(custom.get("baseUrl") or "https://api.lk888.ai/v1").rstrip("/")
    return base, str(custom.get("apiKey") or ""), str(
        custom.get("visionModel") or "deepseek-v4-flash-vision-exp")


def analyze_frames(frames: list[bytes], prompt: str, *,
                   profiles_path: pathlib.Path,
                   model: str | None = None) -> dict[str, Any]:
    if not frames:
        raise ValueError("没有可用采样帧")
    base, key, default_model = _credentials(profiles_path)
    if not key:
        raise ValueError("视觉模型未配置密钥")
    content: list[dict[str, Any]] = [
        {"type": "text", "text": prompt + "\n\n只输出一个合法 JSON 对象。"}]
    for frame in frames[:8]:
        uri = "data:image/jpeg;base64," + base64.b64encode(frame).decode()
        content.append({"type": "image_url", "image_url": {"url": uri}})
    body = json.dumps({
        "model": model or default_model,
        "messages": [{"role": "user", "content": content}],
        "max_tokens": 1200,
        "temperature": 0.2,
    }).encode()
    import urllib.error  # noqa: PLC0415
    import urllib.request  # noqa: PLC0415

    req = urllib.request.Request(
        base + "/chat/completions", data=body, method="POST",
        headers={"Authorization": "Bearer " + key,
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    choice = (data.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    text = message.get("content") or ""
    if isinstance(text, list):
        text = " ".join(str(part.get("text") or "")
                        for part in text if isinstance(part, dict))
    raw = str(text)
    try:
        return extract_json(raw)
    except (ValueError, json.JSONDecodeError):
        import re  # noqa: PLC0415

        first, last = raw.find("{"), raw.rfind("}")
        if first < 0 or last <= first:
            raise ValueError("视觉模型未返回 JSON: " + raw[:240]) from None
        chunk = raw[first:last + 1]
        # 模型偶尔把真实换行直接塞进字符串值里
        chunk = re.sub(r"(?<!\\)\n", "\\n", chunk)
        chunk = re.sub(r"(?<!\\)\r", "\\r", chunk)
        try:
            return json.loads(chunk)
        except json.JSONDecodeError:
            raise ValueError("视觉模型 JSON 无法修复: " + raw[:240]) from None
