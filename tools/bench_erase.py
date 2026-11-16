"""本地像素级擦除可行性实测（P2-02b 决策依据）。

回答两个问题：
  1. 只用 ffmpeg + numpy + cv2，能不能把烧进画面的字幕擦掉？
  2. 擦得干不干净、跑得多快？

做法：合成一张干净背景 → 画上白字+黑描边 → 擦除 → 与干净背景比 PSNR。
PSNR 越高越接近"看不出痕迹"；30dB 以上肉眼通常不明显，20dB 左右会看到糊。
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import cv2
import numpy as np

W, H = 1920, 1080
BAND = (0, 900, 1920, 1080)          # 字幕带：底部 180 px
TEXT = "这是一行用来测试擦除的字幕"


def clean_frame(kind: str = "smooth", seed: int = 7) -> np.ndarray:
    """两种背景：smooth = 渐变为主（擦除的理想情况）；hard = 高频纹理（真实难例）。"""
    rng = np.random.default_rng(seed)
    y = np.linspace(0, 1, H, dtype=np.float32)[:, None]
    x = np.linspace(0, 1, W, dtype=np.float32)[None, :]
    if kind == "hard":
        # 颗粒 + 密集细纹，模拟草地/砖墙/头发这类高频背景
        grain = rng.integers(0, 255, (H // 4, W // 4, 3), dtype=np.uint8)
        frame = cv2.resize(grain, (W, H), interpolation=cv2.INTER_NEAREST)
        stripes = ((np.sin(np.linspace(0, 90, W)) * 40) + 120).astype(np.uint8)
        frame[:, :, 0] = np.clip(frame[:, :, 0].astype(np.int16) + stripes, 0, 255)
        return frame
    red = 60 + 120 * y + 30 * x
    green = 70 + 90 * x + 0 * y
    blue = 90 + 70 * y + 0 * x
    base = np.dstack([red, green, blue]).astype(np.uint8)
    noise = rng.normal(0, 6, (H, W, 3))
    frame = np.clip(base.astype(np.float32) + noise, 0, 255).astype(np.uint8)
    cv2.rectangle(frame, (200, 380), (900, 700), (40, 120, 200), -1)   # 硬边缘块
    cv2.circle(frame, (1400, 520), 180, (200, 180, 40), -1)
    return frame


def draw_subtitle(frame: np.ndarray) -> np.ndarray:
    out = frame.copy()
    x0, y0 = 380, 1010
    cv2.putText(out, TEXT, (x0, y0), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (0, 0, 0), 7, cv2.LINE_AA)
    cv2.putText(out, TEXT, (x0, y0), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (255, 255, 255), 3, cv2.LINE_AA)
    return out


def build_mask(dirty: np.ndarray, clean: np.ndarray) -> np.ndarray:
    """两档 mask：理想 mask（假设检测完美，与干净帧求差）与实用 mask（阈值法，无需原图）。"""
    diff = cv2.absdiff(dirty, clean).max(axis=2)
    ideal = np.zeros(diff.shape, np.uint8)
    ideal[diff > 12] = 255
    ideal = cv2.dilate(ideal, np.ones((9, 9), np.uint8), iterations=1)

    gray = cv2.cvtColor(dirty, cv2.COLOR_BGR2GRAY)
    practical = np.zeros_like(gray)
    practical[gray > 225] = 255                       # 白字芯
    practical = cv2.morphologyEx(practical, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    practical = cv2.dilate(practical, np.ones((11, 11), np.uint8))   # 盖住黑描边
    return ideal, practical


def psnr(a: np.ndarray, b: np.ndarray) -> float:
    mse = float(np.mean((a.astype(np.float32) - b.astype(np.float32)) ** 2))
    return 99.0 if mse == 0 else float(10 * np.log10(255.0 ** 2 / mse))


def timed(func, repeat: int = 20) -> tuple[float, np.ndarray]:
    result = None
    start = time.perf_counter()
    for _ in range(repeat):
        result = func()
    return (time.perf_counter() - start) / repeat * 1000, result


def cv_inpaint(dirty: np.ndarray, mask: np.ndarray, method: int, radius: int = 3) -> np.ndarray:
    """只在字幕带内做 inpaint：全画面 inpaint 会白算 90% 的像素。"""
    x0, y0, x1, y1 = BAND
    roi = dirty[y0:y1, x0:x1]
    roi_mask = mask[y0:y1, x0:x1]
    filled = cv2.inpaint(roi, roi_mask, radius, method)
    out = dirty.copy()
    out[y0:y1, x0:x1] = filled
    return out


def ffmpeg_delogo(src: Path, dst: Path, region: tuple[int, int, int, int]) -> tuple[float, int]:
    x, y, w, h = region
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
        "-vf", f"delogo=x={x}:y={y}:w={w}:h={h}",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-an", str(dst),
    ]
    start = time.perf_counter()
    subprocess.run(cmd, check=True, capture_output=True)
    elapsed = time.perf_counter() - start
    return elapsed, dst.stat().st_size


def make_clip(path: Path, frame: np.ndarray, seconds: int = 5, fps: int = 30) -> None:
    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24",
         "-s", f"{W}x{H}", "-r", str(fps), "-i", "-", "-c:v", "libx264",
         "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", str(path)],
        stdin=subprocess.PIPE)
    for _ in range(seconds * fps):
        assert proc.stdin is not None
        proc.stdin.write(frame.tobytes())
    assert proc.stdin is not None
    proc.stdin.close()
    proc.wait()


def run_case(kind: str, out_dir: Path) -> dict:
    clean = clean_frame(kind)
    dirty = draw_subtitle(clean)
    ideal, practical = build_mask(dirty, clean)
    case: dict = {"background": kind, "psnr_dirty": round(psnr(dirty, clean), 2)}

    t_telea, out_telea = timed(lambda: cv_inpaint(dirty, ideal, cv2.INPAINT_TELEA))
    case["cv2_telea_ideal_mask"] = {"ms": round(t_telea, 1),
                                    "psnr": round(psnr(out_telea, clean), 2)}

    t_practical, out_practical = timed(lambda: cv_inpaint(dirty, practical, cv2.INPAINT_TELEA))
    case["cv2_telea_threshold_mask"] = {"ms": round(t_practical, 1),
                                        "psnr": round(psnr(out_practical, clean), 2)}

    t_ns, out_ns = timed(lambda: cv_inpaint(dirty, ideal, cv2.INPAINT_NS))
    case["cv2_ns_ideal_mask"] = {"ms": round(t_ns, 1),
                                 "psnr": round(psnr(out_ns, clean), 2)}

    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "src.mp4"
        dst = Path(tmp) / "delogo.mp4"
        make_clip(src, dirty)
        elapsed, size = ffmpeg_delogo(src, dst, (380, 960, 1160, 100))
        frames = 150
        case["ffmpeg_delogo"] = {
            "ms": round(elapsed / frames * 1000, 1),
            "total_seconds_5s_clip": round(elapsed, 2),
            "output_bytes": size,
        }
        cap = cv2.VideoCapture(str(dst))
        cap.set(cv2.CAP_PROP_POS_FRAMES, 75)
        ok, frame = cap.read()
        cap.release()
        if ok:
            case["ffmpeg_delogo"]["psnr"] = round(psnr(frame, clean), 2)

    out_dir.mkdir(parents=True, exist_ok=True)
    for name, image in (("clean", clean), ("dirty", dirty), ("mask", ideal),
                        ("cv2_telea", out_telea), ("cv2_threshold", out_practical),
                        ("cv2_ns", out_ns)):
        cv2.imwrite(str(out_dir / f"{kind}_{name}.png"), image)
    return case


def main() -> int:
    out_dir = Path(r"F:\WorkAPP\NanbudoTV·AI\.local\erase-bench")
    report = {
        "size": f"{W}x{H}",
        "band": BAND,
        "text": TEXT,
        "cases": [run_case(kind, out_dir) for kind in ("smooth", "hard")],
        "samples": str(out_dir),
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
