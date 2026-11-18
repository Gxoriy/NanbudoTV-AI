"""用 PyAV 读媒体：取帧、解音频、探测基本信息。

为什么要有这层：原版 exe 的 `_internal` 里带的是 **PyAV（libav 库）**，不是 `ffmpeg.exe`
（见 spec/ida-insight.md）。用 PyAV 意味着用户机器不必装 ffmpeg，分发形态也更接近原版。

保留 ffmpeg 作回退：像素修补（`domain/subtitle/repair.py`）走的是
"ffmpeg 解 rawvideo → cv2 逐帧 inpaint → ffmpeg 编码" 的管道，
改成 PyAV 属于重写管线，风险与收益不成正比，暂不动。

约定：本模块**只抛 RuntimeError/AvUnavailable**，由调用方决定是否回退到 ffmpeg。
"""

from __future__ import annotations

import pathlib
from typing import Any


class AvUnavailable(RuntimeError):
    """PyAV 没装或解码失败；调用方应回退 ffmpeg。"""


def available() -> bool:
    try:
        import av  # noqa: F401, PLC0415
    except Exception:  # noqa: BLE001
        return False
    return True


def version() -> str:
    try:
        import av  # noqa: PLC0415
    except Exception:  # noqa: BLE001
        return ""
    return str(getattr(av, "__version__", ""))


def _open(path: str | pathlib.Path):
    try:
        import av  # noqa: PLC0415
    except Exception as exc:  # noqa: BLE001
        raise AvUnavailable(f"PyAV 不可用: {exc}") from exc
    target = pathlib.Path(path)
    if not target.is_file():
        raise AvUnavailable(f"媒体文件不存在: {target}")
    try:
        return av.open(str(target))
    except Exception as exc:  # noqa: BLE001
        raise AvUnavailable(f"无法打开媒体: {exc}") from exc


def grab_frame_rgb(path: str | pathlib.Path, at_second: float) -> Any:
    """取某一时刻的 RGB 帧（numpy uint8，HxWx3）。

    精确到"不晚于该时刻的最近关键帧之后"——PyAV 的 seek 向关键帧对齐，
    字幕检测按 1~2 秒间隔取样，不需要帧级精确。
    """
    container = _open(path)
    try:
        streams = container.streams.video
        if not streams:
            raise AvUnavailable("文件里没有视频流")
        stream = streams[0]
        offset = max(0.0, float(at_second))
        try:
            container.seek(int(offset / float(stream.time_base)), stream=stream,
                           backward=True)
        except Exception:  # noqa: BLE001
            # 有些容器不支持按流 seek，退化成从头解码
            pass
        for frame in container.decode(stream):
            return frame.to_ndarray(format="rgb24")
        raise AvUnavailable("解码不到任何视频帧")
    finally:
        container.close()


def decode_audio_16k(path: str | pathlib.Path) -> Any:
    """解码成 16kHz 单声道 float32 一维数组（faster-whisper 直接吃这个）。"""
    import numpy as np  # noqa: PLC0415

    container = _open(path)
    try:
        streams = container.streams.audio
        if not streams:
            raise AvUnavailable("文件里没有音频流")
        stream = streams[0]
        try:
            import av  # noqa: PLC0415

            resampler = av.AudioResampler(format="flt", layout="mono", rate=16000)
        except Exception as exc:  # noqa: BLE001
            raise AvUnavailable(f"无法创建重采样器: {exc}") from exc

        chunks: list[Any] = []
        for frame in container.decode(stream):
            try:
                out = resampler.resample(frame)
            except Exception as exc:  # noqa: BLE001
                raise AvUnavailable(f"重采样失败: {exc}") from exc
            for item in (out if isinstance(out, list) else [out]):
                if item is not None:
                    chunks.append(item.to_ndarray().reshape(-1))
        if not chunks:
            raise AvUnavailable("解码不到任何音频帧")
        return np.concatenate(chunks).astype(np.float32)
    finally:
        container.close()


def probe(path: str | pathlib.Path) -> dict[str, Any]:
    """容器级信息：时长、分辨率、帧率、有没有音轨/字幕轨。"""
    container = _open(path)
    try:
        info: dict[str, Any] = {
            "duration": float(container.duration or 0) / 1_000_000,
            "hasVideo": bool(container.streams.video),
            "hasAudio": bool(container.streams.audio),
            "hasSubtitle": bool(container.streams.subtitles),
            "width": 0, "height": 0, "fps": 0.0,
        }
        if container.streams.video:
            stream = container.streams.video[0]
            info["width"] = int(stream.codec_context.width or 0)
            info["height"] = int(stream.codec_context.height or 0)
            rate = stream.average_rate or stream.guessed_rate
            if rate:
                info["fps"] = round(float(rate), 3)
        return info
    finally:
        container.close()
