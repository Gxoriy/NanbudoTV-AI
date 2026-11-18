"""字幕候选检测（本地，纯 cv2，不联网）。

思路：烧进画面的字幕有两个稳定特征——**足够亮**（白字+黑描边）且**横向成行**。
逐帧阈值会把高光噪点、logo 也算进来，所以：
  1. 均匀抽若干帧，只在画面下方 60% 找（字幕极少出现在顶部）
  2. 每个候选要求横向跨度 ≥ 画面宽度的 12%（排除零星亮点）
  3. 多帧取并集后才算候选——只在一两帧出现的当噪声丢弃

输出的是"候选"，仍需用户确认；选区位与 `region.py` 同一套整数网格。
"""

from __future__ import annotations

import pathlib
import subprocess
from typing import Any

from infra.media import avio

from . import repair
from . import region as region_rules

BAND_TOP_RATIO = 0.40          # 只看下方 60%
MIN_WIDTH_RATIO = 0.12         # 候选最小横向跨度
MIN_AREA_RATIO = 0.0002        # 候选最小面积（占画面）


def _probe_media(src: pathlib.Path) -> dict[str, Any]:
    """优先 PyAV（无需 ffprobe），失败再回退 ffprobe。"""
    try:
        info = avio.probe(src)
        if info.get("width") and info.get("height"):
            return {"width": info["width"], "height": info["height"],
                    "duration": info["duration"], "fps": info.get("fps") or 0}
    except Exception:  # noqa: BLE001
        pass
    return repair.probe_video(src)


def _grab_frame(cv2, np, src: pathlib.Path, at_second: float):
    """优先 PyAV 解码（不依赖 ffmpeg），失败回退 ffmpeg 管道。"""
    try:
        rgb = avio.grab_frame_rgb(src, at_second)
        return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    except Exception:  # noqa: BLE001
        pass
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", f"{at_second:.3f}", "-i", str(src),
         "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"],
        capture_output=True)
    if proc.returncode != 0 or not proc.stdout:
        return None
    buffer = np.frombuffer(proc.stdout, np.uint8)
    return cv2.imdecode(buffer, cv2.IMREAD_COLOR)


def _require_cv():
    """只要 cv2/numpy：取帧与探测都走 PyAV，ffmpeg 不再是硬依赖。"""
    try:
        import cv2  # noqa: PLC0415
        import numpy as np  # noqa: PLC0415
    except ImportError as exc:  # noqa: BLE001
        raise repair.RepairUnavailable(
            "缺少 numpy/cv2，本地字幕检测不可用。") from exc
    return cv2, np


def detect_region(src: str | pathlib.Path, *, samples: int = 6,
                  threshold: int = 200) -> dict[str, Any]:
    """返回 {region, frames, hits, coverage}；检测不到时 region 为 None。"""
    cv2, np = _require_cv()
    src_path = pathlib.Path(src)
    meta = _probe_media(src_path)
    width, height = meta["width"], meta["height"]
    duration = meta["duration"] or 0
    if not width or not height:
        raise repair.RepairUnavailable("无法读取视频尺寸。")
    if duration <= 0:
        raise repair.RepairUnavailable("无法读取视频时长。")

    band_top = int(height * BAND_TOP_RATIO)
    min_width = width * MIN_WIDTH_RATIO
    min_area = width * height * MIN_AREA_RATIO
    max_height = height * 0.20            # 字幕行是"宽而矮"，排除整块亮区（logo、白墙）
    open_kernel = np.ones((3, max(9, width // 14)), np.uint8)

    clusters: list[dict[str, float]] = []
    hits = 0
    for index in range(samples):
        at = duration * (index + 0.5) / samples
        frame = _grab_frame(cv2, np, src_path, at)
        if frame is None:
            continue
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        mask = np.zeros_like(gray)
        mask[band_top:, :] = np.where(gray[band_top:, :] > threshold, 255, 0)
        # 横向开运算：只留"成行"的亮纹，零星高光被抹掉
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, open_kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 15), np.uint8))
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        best = None
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            if w < min_width or w * h < min_area or h > max_height:
                continue
            if best is None or w > best[2]:
                best = (x, y, w, h)
        if not best:
            continue
        hits += 1
        x, y, w, h = best
        for cluster in clusters:
            overlap = min(y + h, cluster["y1"]) - max(y, cluster["y0"])
            if overlap > 0.5 * min(h, cluster["y1"] - cluster["y0"]):
                cluster["y0"] = min(cluster["y0"], y)
                cluster["y1"] = max(cluster["y1"], y + h)
                cluster["x0"] = min(cluster["x0"], x)
                cluster["x1"] = max(cluster["x1"], x + w)
                cluster["hits"] += 1
                break
        else:
            clusters.append({"y0": float(y), "y1": float(y + h),
                             "x0": float(x), "x1": float(x + w), "hits": 1.0})

    if not clusters:
        return {"region": None, "frames": samples, "hits": 0, "coverage": 0.0}

    # 多帧反复命中的那条才算字幕；只出现一次的当噪声
    clusters.sort(key=lambda c: (c["hits"], c["x1"] - c["x0"]), reverse=True)
    top_cluster = clusters[0]
    if top_cluster["hits"] < max(2, samples // 3):
        return {"region": None, "frames": samples, "hits": int(top_cluster["hits"]),
                "coverage": round(top_cluster["hits"] / samples, 2)}

    left, right = top_cluster["x0"], top_cluster["x1"]
    top_y, bottom = top_cluster["y0"], top_cluster["y1"]
    area = {
        "x": round(left / width * 100, 2),
        "y": round(top_y / height * 100, 2),
        "width": round((right - left) / width * 100, 2),
        "height": round((bottom - top_y) / height * 100, 2),
    }
    return {
        "region": region_rules.outward(area),
        "frames": samples,
        "hits": int(top_cluster["hits"]),
        "coverage": round(top_cluster["hits"] / samples, 2),
    }
