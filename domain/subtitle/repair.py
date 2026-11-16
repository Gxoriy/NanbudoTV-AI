"""本地像素级修补（B 档）：ffmpeg 解码/编码 + cv2.inpaint + 时序一致 mask。

实测口径见 spec/erase-feasibility.md：
  平滑背景 51.8 dB（肉眼无痕）／高频纹理 30.8 dB（会留涂抹）——
所以 UI 文案必须保留"可能留痕、不能还原真实背景"的告知，不能承诺无痕。

为什么 mask 要"时序一致"：逐帧阈值会把高光噪点当文字，mask 膨胀后
既慢（17→92 ms/帧）又擦掉不该擦的地方。要求同一像素在最近 N 帧中
至少命中 M 次才认定为字幕，能同时压掉噪声误判与闪断。
"""

from __future__ import annotations

import json
import os
import pathlib
import shutil
import subprocess
import tempfile
from collections import deque
from typing import Any, Callable, Iterator

# 本机安装位（用户级 PATH 已写入，但服务/计划任务可能拿不到新 PATH）
FFMPEG_DIRS = (pathlib.Path(r"E:\PublicWork\ffmpeg\bin"),)


def _ensure_ffmpeg_on_path() -> None:
    if shutil.which("ffmpeg") and shutil.which("ffprobe"):
        return
    for folder in FFMPEG_DIRS:
        if (folder / "ffmpeg.exe").exists():
            os.environ["PATH"] = f"{folder};{os.environ.get('PATH', '')}"
            return

Progress = Callable[[float, str], None]
CancelCheck = Callable[[], bool]


class RepairUnavailable(RuntimeError):
    """缺 ffmpeg 或 numpy/cv2 时抛出，由上层转成 501 并说明缺什么。"""


class RepairCanceled(RuntimeError):
    """用户取消。"""


def _require_tools() -> tuple[Any, Any]:
    _ensure_ffmpeg_on_path()
    if shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None:
        raise RepairUnavailable("未找到 ffmpeg/ffprobe，本地像素修补不可用。")
    try:
        import cv2  # noqa: PLC0415
        import numpy as np  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover - 环境相关
        raise RepairUnavailable("未安装 numpy/opencv，本地像素修补不可用。") from exc
    return cv2, np


_ENCODER_CACHE: str | None = None


def video_encoder() -> str:
    """优先 libx264；发行版 ffmpeg 常缺 GPL 编码器（实测 OpenCloudOS 的 7.0.2 就没有）。

    没有 x264 时退到内置 mpeg4——体积大、质量差，但能出片；宁可降级也别
    让用户看到 BrokenPipeError。
    """
    global _ENCODER_CACHE
    if _ENCODER_CACHE:
        return _ENCODER_CACHE
    _ensure_ffmpeg_on_path()
    if shutil.which("ffmpeg") is None:
        raise RepairUnavailable("未找到 ffmpeg。")
    try:
        out = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"],
                             capture_output=True, text=True, timeout=30).stdout
    except (OSError, subprocess.SubprocessError) as exc:
        raise RepairUnavailable(f"无法探测 ffmpeg 编码器: {exc}") from exc
    # 只认 libx264 与 mpeg4：libopenh264 需要完全不同的参数
    # （实测 -preset/-crf 会让它直接 Invalid argument 退出）
    for name in ("libx264", "mpeg4"):
        if f" {name} " in out:
            _ENCODER_CACHE = name
            return name
    raise RepairUnavailable("ffmpeg 缺少可用的 H.264 编码器，且无 mpeg4 兜底。")


def probe_video(path: str | pathlib.Path) -> dict[str, Any]:
    if shutil.which("ffprobe") is None:
        raise RepairUnavailable("未找到 ffprobe。")
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,r_frame_rate,nb_frames,duration",
         "-of", "json", str(path)],
        capture_output=True, check=True).stdout
    stream = (json.loads(out).get("streams") or [{}])[0]
    num, _, den = str(stream.get("r_frame_rate", "0/1")).partition("/")
    fps = float(num) / float(den or 1) if float(den or 1) else 0.0
    return {
        "width": int(stream.get("width") or 0),
        "height": int(stream.get("height") or 0),
        "fps": fps or 25.0,
        "frames": int(stream.get("nb_frames") or 0),
        "duration": float(stream.get("duration") or 0.0),
    }


def _abort(decoder: subprocess.Popen, encoder: subprocess.Popen, dst: pathlib.Path) -> None:
    """失败/取消时统一收尾：杀进程、关管道、删半成品，避免留下僵尸与残留文件。"""
    for proc in (decoder, encoder):
        if proc.poll() is None:
            proc.kill()
    try:
        if encoder.stdin and not encoder.stdin.closed:
            encoder.stdin.close()
    except OSError:
        pass
    for proc in (decoder, encoder):
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            pass
    dst.unlink(missing_ok=True)


def _iter_frames(proc_stdout, frame_bytes: int) -> Iterator[bytes]:
    while True:
        chunk = proc_stdout.read(frame_bytes)
        if not chunk or len(chunk) < frame_bytes:
            return
        yield chunk


def repair_video(src: str | pathlib.Path, dst: str | pathlib.Path,
                 region: dict[str, int], *, threshold: int = 200,
                 dilate: int = 11, radius: int = 3, window: int = 5,
                 min_hits: int = 3, crf: int = 20,
                 on_progress: Progress | None = None,
                 should_cancel: CancelCheck | None = None) -> dict[str, Any]:
    """把 region（画面百分比，整数网格）内的字幕笔画擦掉，输出新视频。

    只重编码视频轨，音频直接 copy；原片不动。
    """
    cv2, np = _require_tools()
    src_path, dst_path = pathlib.Path(src), pathlib.Path(dst)
    meta = probe_video(src_path)
    width, height, fps = meta["width"], meta["height"], meta["fps"]
    if not width or not height:
        raise RepairUnavailable("无法读取视频尺寸。")

    left = max(0, round(region["x"] * width / 100))
    top = max(0, round(region["y"] * height / 100))
    right = min(width, left + max(1, round(region["width"] * width / 100)))
    bottom = min(height, top + max(1, round(region["height"] * height / 100)))

    frame_bytes = width * height * 3
    decoder = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", str(src_path), "-f", "rawvideo",
         "-pix_fmt", "bgr24", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    codec = video_encoder()
    if codec == "mpeg4":
        codec_args = ["-c:v", "mpeg4", "-q:v", "3", "-pix_fmt", "yuv420p"]
    else:
        codec_args = ["-c:v", codec, "-preset", "veryfast", "-crf", str(crf),
                      "-pix_fmt", "yuv420p"]
    encoder = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24",
         "-s", f"{width}x{height}", "-r", f"{fps}", "-i", "-",
         "-i", str(src_path), "-map", "0:v:0", "-map", "1:a?", *codec_args,
         "-c:a", "copy", "-movflags", "+faststart", str(dst_path)],
        stdin=subprocess.PIPE, stderr=subprocess.PIPE)

    history: deque[Any] = deque(maxlen=window)
    kernel = np.ones((dilate, dilate), np.uint8)
    frames = 0
    repaired_pixels = 0
    total_estimate = meta["frames"] or max(1, int(meta["duration"] * fps))

    assert decoder.stdout is not None and encoder.stdin is not None
    try:
        for raw in _iter_frames(decoder.stdout, frame_bytes):
            if should_cancel and should_cancel():
                raise RepairCanceled
            # frombuffer 返回只读视图，必须 copy 才能原地回写修补结果
            frame = np.frombuffer(raw, np.uint8).reshape(height, width, 3).copy()
            roi = frame[top:bottom, left:right]
            gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
            mask = np.where(gray > threshold, 255, 0).astype(np.uint8)
            mask = cv2.dilate(mask, kernel)

            history.append(mask)
            if len(history) >= min_hits:
                hits = np.sum([m > 0 for m in history], axis=0)
                stable = np.where(hits >= min_hits, 255, 0).astype(np.uint8)
            else:
                stable = mask
            if stable.any():
                repaired_pixels += int(np.count_nonzero(stable))
                frame[top:bottom, left:right] = cv2.inpaint(roi, stable, radius,
                                                            cv2.INPAINT_TELEA)
            try:
                encoder.stdin.write(frame.tobytes())
            except (BrokenPipeError, OSError) as exc:
                detail = ""
                if encoder.stderr is not None:
                    detail = (encoder.stderr.read() or b"").decode(
                        "utf-8", "replace")[-400:]
                raise RepairUnavailable(
                    f"编码器提前退出（{codec}）: {detail or exc}") from exc

            frames += 1
            if on_progress and frames % 10 == 0:
                on_progress(min(0.99, frames / max(1, total_estimate)),
                            f"正在修补第 {frames} 帧")
        encoder.stdin.close()
        encoder.wait(timeout=600)
        if encoder.returncode != 0:
            detail = (encoder.stderr.read() or b"").decode("utf-8", "replace")[-400:]
            dst_path.unlink(missing_ok=True)
            raise RepairUnavailable(f"编码失败（{codec}）: {detail}")
    except RepairCanceled:
        _abort(decoder, encoder, dst_path)
        raise
    except Exception:
        _abort(decoder, encoder, dst_path)
        raise
    finally:
        if decoder.poll() is None:
            decoder.kill()
        if encoder.poll() is None:
            encoder.kill()
        try:
            if decoder.stdout and not decoder.stdout.closed:
                decoder.stdout.close()
        except OSError:
            pass

    if frames == 0:
        dst_path.unlink(missing_ok=True)
        raise RepairUnavailable("解码失败：没有读到任何帧。")

    if on_progress:
        on_progress(1.0, "修补完成")
    return {"frames": frames, "repairedPixels": repaired_pixels,
            "region": {"left": left, "top": top, "right": right, "bottom": bottom},
            "bytes": dst_path.stat().st_size if dst_path.exists() else 0}


def repair_preview(src: str | pathlib.Path, region: dict[str, int], *,
                   at_second: float = 1.0) -> bytes:
    """取一帧做修补预览，返回 PNG 字节（前端可先看效果再决定是否整片处理）。"""
    cv2, np = _require_tools()
    meta = probe_video(src)
    width, height = meta["width"], meta["height"]
    with tempfile.TemporaryDirectory() as tmp:
        frame_path = pathlib.Path(tmp) / "frame.png"
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-ss", str(at_second), "-i", str(src),
             "-frames:v", "1", str(frame_path)], check=True)
        frame = cv2.imread(str(frame_path))
    if frame is None:
        raise RepairUnavailable("无法读取预览帧。")
    left = max(0, round(region["x"] * width / 100))
    top = max(0, round(region["y"] * height / 100))
    right = min(width, left + max(1, round(region["width"] * width / 100)))
    bottom = min(height, top + max(1, round(region["height"] * height / 100)))
    roi = frame[top:bottom, left:right]
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    mask = cv2.dilate(np.where(gray > 200, 255, 0).astype(np.uint8),
                      np.ones((11, 11), np.uint8))
    if mask.any():
        frame[top:bottom, left:right] = cv2.inpaint(roi, mask, 3, cv2.INPAINT_TELEA)
    ok, buffer = cv2.imencode(".png", frame)
    if not ok:
        raise RepairUnavailable("预览编码失败。")
    return buffer.tobytes()
