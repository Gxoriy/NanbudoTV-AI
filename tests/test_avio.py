"""P0-4：PyAV 读取层的基本契约（不可用时必须抛 AvUnavailable，让调用方回退）。"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from infra.media import avio  # noqa: E402


class AvioTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_available_reflects_import(self) -> None:
        try:
            import av  # noqa: F401
            expected = True
        except Exception:  # noqa: BLE001
            expected = False
        self.assertEqual(avio.available(), expected)

    def test_missing_file_raises(self) -> None:
        with self.assertRaises(avio.AvUnavailable):
            avio.probe(self.root / "nope.mp4")
        with self.assertRaises(avio.AvUnavailable):
            avio.grab_frame_rgb(self.root / "nope.mp4", 0.0)
        with self.assertRaises(avio.AvUnavailable):
            avio.decode_audio_16k(self.root / "nope.mp4")

    def test_garbage_file_raises(self) -> None:
        """坏文件不能静默返回空帧，否则检测会把"没画面"当成"没字幕"。"""
        junk = self.root / "junk.mp4"
        junk.write_bytes(b"not a video at all" * 10)
        with self.assertRaises(avio.AvUnavailable):
            avio.grab_frame_rgb(junk, 0.0)

    def test_detect_does_not_require_ffmpeg(self) -> None:
        """字幕检测的依赖里不该再出现 ffmpeg/ffprobe。"""
        from domain.subtitle import detect

        source = Path(detect.__file__).read_text(encoding="utf-8")
        self.assertIn("avio.grab_frame_rgb", source)
        self.assertIn("_probe_media", source)
        # 允许保留 fallback 的 subprocess 分支，但主路径必须先走 PyAV
        self.assertLess(source.index("avio.grab_frame_rgb"),
                        source.index('subprocess.run('))


if __name__ == "__main__":
    unittest.main()
