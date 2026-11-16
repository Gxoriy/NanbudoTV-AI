"""P2-02 验收测试：MP4 探测/字幕轨移除、导入、媒体读取、本地处理链路。

不需要 ffmpeg、不需要联网：用最小的合成 MP4 走完整条链路，
并校验"删轨后 mdat 前移、stco 必须同步修正"这一最容易写错的地方。
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from domain.subtitle import SubtitleService, SubtitleStore  # noqa: E402
from domain.subtitle import mp4  # noqa: E402
from domain.subtitle import service as service_module  # noqa: E402
from domain.subtitle.service import (  # noqa: E402
    MESSAGE_NO_SUBTITLE_TRACK, MESSAGE_TOO_LARGE, SubtitleError,
)
from infra.tasks import TaskStore  # noqa: E402


# 合成 MP4 与偏移断言放在 tests/smoke/mp4_fixture.py，单测与契约检查共用同一份
sys.path.insert(0, str(Path(__file__).resolve().parent / "smoke"))
from mp4_fixture import build_mp4, first_stco, mdat_payload_offset  # noqa: E402


class Mp4Test(unittest.TestCase):
    def test_probe_reads_duration_tracks_and_size(self) -> None:
        meta = mp4.probe(build_mp4())
        self.assertEqual(meta["duration"], 12.0)
        self.assertEqual((meta["width"], meta["height"]), (1920, 1080))
        self.assertTrue(meta["hasAudio"])
        self.assertTrue(meta["hasSubtitle"])
        self.assertEqual(meta["tracks"], 3)

    def test_strip_removes_subtitle_track(self) -> None:
        original = build_mp4()
        stripped, dropped = mp4.strip_subtitle_tracks(original)
        self.assertEqual(dropped, 1)
        after = mp4.probe(stripped)
        self.assertFalse(after["hasSubtitle"])
        self.assertTrue(after["hasAudio"])
        self.assertEqual(after["tracks"], 2)
        self.assertEqual(after["width"], 1920)

    def test_strip_patches_chunk_offsets(self) -> None:
        original = build_mp4()
        stripped, _ = mp4.strip_subtitle_tracks(original)
        self.assertEqual(first_stco(stripped), mdat_payload_offset(stripped))

    def test_strip_noop_without_subtitle_track(self) -> None:
        plain = build_mp4(with_subtitle=False)
        stripped, dropped = mp4.strip_subtitle_tracks(plain)
        self.assertEqual(dropped, 0)
        self.assertEqual(stripped, plain)

    def test_probe_rejects_non_mp4(self) -> None:
        with self.assertRaises(ValueError):
            mp4.probe(b"not a video at all")


class ServiceMediaTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = SubtitleStore(self.root / "subtitle.db")
        self.tasks = TaskStore(self.root / "state.db")
        self.service = SubtitleService(self.store, self.root / "subtitle-config.json",
                                       storage_root=self.root / "subtitle",
                                       task_store=self.tasks)

    def tearDown(self) -> None:
        self.tasks.close()
        self.store.close()
        self._tmp.cleanup()

    def _upload(self, name: str = "第1集.mp4", data: bytes | None = None):
        return self.service.upload(name, build_mp4() if data is None else data)

    def _upload_real_video(self):
        """真实可解码的小视频（320x240 / 1s），供像素修补链路使用。"""
        from domain.subtitle.repair import _ensure_ffmpeg_on_path
        _ensure_ffmpeg_on_path()
        if shutil.which("ffmpeg") is None:
            self.skipTest("未安装 ffmpeg")
        target = self.root / "clip.mp4"
        # 纯色背景 + 一条白字幕带：检测算法需要"唯一亮行"，用测试图案会掺入色块干扰
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-f", "lavfi",
             "-i", "color=c=0x203040:s=320x240:r=10:d=1",
             "-vf", "drawbox=x=20:y=200:w=280:h=30:color=white@1:t=fill",
             "-pix_fmt", "yuv420p", str(target)], check=True)
        return self.service.upload("clip.mp4", target.read_bytes())

    def test_upload_writes_file_and_metadata(self) -> None:
        record = self._upload()
        self.assertEqual(record.metadata["duration"], 12.0)
        self.assertTrue((self.root / "subtitle" / record.source_file).is_file())
        self.assertEqual(record.phase, "ready")

    def test_upload_rejects_bad_extension_and_corrupt_payload(self) -> None:
        with self.assertRaises(SubtitleError) as ctx:
            self.service.upload("a.txt", b"x")
        self.assertEqual(ctx.exception.code, "invalid_input")
        with self.assertRaises(SubtitleError):
            self.service.upload("a.mp4", b"broken")

    def test_upload_rejects_oversize(self) -> None:
        self.service._config["sourceSizeLimit"] = 10
        with self.assertRaises(SubtitleError) as ctx:
            self.service.upload("a.mp4", b"\x00" * 64)
        self.assertEqual(ctx.exception.status, 413)
        self.assertEqual(ctx.exception.message, MESSAGE_TOO_LARGE)

    def test_media_path_blocks_traversal(self) -> None:
        record = self._upload()
        self.assertTrue(self.service.media_path(record.id, record.source_file).is_file())
        with self.assertRaises(SubtitleError):
            self.service.media_path(record.id, "../subtitle.db")
        with self.assertRaises(SubtitleError):
            self.service.media_path("nope", record.source_file)

    def test_local_strip_end_to_end(self) -> None:
        record = self._upload()
        result = self.service.local_start(record.id, "strip", background=False)
        self.assertEqual(result.phase, "done")
        self.assertEqual(result.result_file, f"results/{record.id}-strip.mp4")
        saved = (self.root / "subtitle" / result.result_file).read_bytes()
        self.assertFalse(mp4.probe(saved)["hasSubtitle"])
        self.assertEqual(len(result.history), 1)
        self.assertEqual(self.tasks.snapshot()["counts"]["done"], 1)

    def test_local_strip_reports_when_nothing_to_remove(self) -> None:
        record = self._upload("无字幕.mp4", build_mp4(with_subtitle=False))
        result = self.service.local_start(record.id, "strip", background=False)
        self.assertEqual(result.phase, "done")
        self.assertEqual(result.result_file, "")
        self.assertEqual(result.message, MESSAGE_NO_SUBTITLE_TRACK)

    def test_local_repair_pixel_pipeline(self) -> None:
        """B 档：ffmpeg + cv2.inpaint。缺依赖时必须 501 并说明缺什么，不能假装成功。"""
        available, why = service_module._repair_available()
        record = self._upload_real_video()
        if not available:
            with self.assertRaises(SubtitleError) as ctx:
                self.service.local_start(record.id, "repair",
                                         {"x": 0, "y": 80, "width": 100, "height": 20},
                                         background=False)
            self.assertEqual(ctx.exception.status, 501)
            self.assertTrue("ffmpeg" in ctx.exception.message
                            or "numpy" in ctx.exception.message)
            return

        result = self.service.local_start(record.id, "repair",
                                          {"x": 0, "y": 80, "width": 100, "height": 20},
                                          background=False)
        self.assertEqual(result.phase, "done", result.error)
        self.assertTrue(result.result_file)
        saved = self.root / "subtitle" / result.result_file
        self.assertGreater(saved.stat().st_size, 0)
        self.assertEqual(len(result.history), 1)

    def test_detect_locates_white_box_band(self) -> None:
        """合成片里画了一条白字幕带（y≈83%~96%），检测应落在同一区域。"""
        record = self._upload_real_video()
        available, why = service_module._repair_available()
        if not available:
            with self.assertRaises(SubtitleError) as ctx:
                self.service.detect(record.id)
            self.assertEqual(ctx.exception.status, 501)
            return

        result = self.service.detect(record.id)
        region = result.region or {}
        self.assertIsNotNone(region, result.message)
        self.assertGreaterEqual(region["y"], 75)
        self.assertLessEqual(region["y"], 90)
        self.assertGreaterEqual(region["width"], 80)
        self.assertIn("字幕候选", result.message)

    def test_local_stop_marks_canceled(self) -> None:
        record = self._upload()
        canceled = self.service.local_stop(record.id)
        self.assertEqual(canceled.phase, "canceled")
        self.assertEqual(self.tasks.snapshot()["counts"]["canceled"], 0)   # 无任务时不能凭空建


if __name__ == "__main__":
    unittest.main()
