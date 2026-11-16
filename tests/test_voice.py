"""P3-01 验收：SRT 重排、时间轴装配精度、音色目录形状、真实合成。

对齐验收口径「多角色对白配音音画同步误差 ≤120ms」：
用两个已知时长的音频段按 start_ms 装配，回读总时长做断言。
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from domain.subtitle.repair import _ensure_ffmpeg_on_path  # noqa: E402

_ensure_ffmpeg_on_path()      # 让 skipUnless 能看见 ffmpeg（PATH 里可能没有）

from domain.voice import (  # noqa: E402
    SapiProvider, VoiceService, dub_dialogue, parse, relayout, split_speaker, to_srt,
)
from domain.voice import pipeline as pipe  # noqa: E402
from domain.voice.pipeline import AssembleStage, Context, Line, Segment  # noqa: E402

SAMPLE_KEYS = set(json.loads(
    (ROOT / "spec" / "api-samples" / "api_voices_catalog.json")
    .read_text(encoding="utf-8"))["body"])

SRT = """1
00:00:01,000 --> 00:00:03,000
角色A：你好，这里是第一句。

2
00:00:03,000 --> 00:00:05,000
角色B：第二句稍微长一点，用来测试重排。

3
00:00:05,200 --> 00:00:07,000
角色A：第三句。
"""


class SrtTest(unittest.TestCase):
    def test_parse_and_roundtrip(self) -> None:
        items = parse(SRT)
        self.assertEqual(len(items), 3)
        self.assertAlmostEqual(items[0].start, 1.0)
        self.assertAlmostEqual(items[2].start, 5.2)
        self.assertEqual(items[1].text, "角色B：第二句稍微长一点，用来测试重排。")
        again = parse(to_srt(items))
        self.assertEqual([(round(i.start, 3), round(i.end, 3)) for i in again],
                         [(round(i.start, 3), round(i.end, 3)) for i in items])

    def test_split_speaker(self) -> None:
        self.assertEqual(split_speaker("角色A：台词"), ("角色A", "台词"))
        self.assertEqual(split_speaker("没有角色前缀"), ("", "没有角色前缀"))
        self.assertEqual(split_speaker("https://x.y/z"), ("", "https://x.y/z"))

    def test_relayout_never_overlaps_and_keeps_order(self) -> None:
        items = parse(SRT)
        # 第二句实际更长（4s），必须把第三句往后推
        out = relayout(items, [1.5, 4.0, 0.8])
        self.assertEqual(len(out), 3)
        for prev, nxt in zip(out, out[1:]):
            self.assertLessEqual(prev.end, nxt.start + 1e-6)
        self.assertGreater(out[2].start, items[2].start)

    def test_relayout_rejects_mismatched_lengths(self) -> None:
        with self.assertRaises(ValueError):
            relayout(parse(SRT), [1.0])


@unittest.skipUnless(shutil.which("ffmpeg"), "需要 ffmpeg")
class AssembleTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _tone(self, name: str, seconds: float) -> Path:
        out = self.root / name
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi",
                        "-i", f"sine=frequency=440:duration={seconds}",
                        "-ar", "44100", "-ac", "2", str(out)], check=True)
        return out

    def test_two_segments_sync_within_120ms(self) -> None:
        a, b = self._tone("a.wav", 0.5), self._tone("b.wav", 0.5)
        ctx = Context(workdir=self.root, output=self.root / "mix.wav")
        ctx.segments = [
            Segment(Line(1, "A", "a", 0.0, 0.5), a, 0.5),
            Segment(Line(2, "B", "b", 1.0, 1.5), b, 0.5),
        ]
        AssembleStage().run(ctx)
        got = pipe._probe_duration(ctx.output)
        self.assertAlmostEqual(got, 1.5, delta=0.12)      # 验收口径 120ms


class ServiceTest(unittest.TestCase):
    def test_catalog_shape_covers_legacy_keys(self) -> None:
        service = VoiceService(provider=SapiProvider())
        body = service.catalog()
        self.assertTrue(SAMPLE_KEYS <= set(body), SAMPLE_KEYS - set(body))
        self.assertEqual(body["pricingMode"], "free")
        self.assertEqual(body["pointsPerCharacter"], 0.0)
        self.assertEqual(body["clonePoints"], 0.0)
        for item in body["voices"]:
            self.assertEqual(set(item), {"id", "displayName", "source", "languages",
                                         "style", "age", "family", "sampleUrl",
                                         "synthesisReady"})

    def test_quote_is_free(self) -> None:
        body = VoiceService(provider=SapiProvider()).quote("你好世界")
        self.assertEqual(body["characters"], 4)
        self.assertEqual(body["estimatedPoints"], 0.0)

    def test_status_reports_engine(self) -> None:
        body = VoiceService(provider=SapiProvider()).status()
        self.assertIn("ready", body)
        self.assertEqual(body["pricingMode"], "free")


@unittest.skipUnless(shutil.which("ffmpeg"), "需要 ffmpeg")
class JobFlowTest(unittest.TestCase):
    """整片配音：报价 → intentHash 校验 → 合成 → 状态落盘（与前端契约一致）。"""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        from domain.voice.store import VoiceJobStore
        from infra.tasks import TaskStore
        self.tasks = TaskStore(self.root / "tasks.db")
        self.service = VoiceService(store=VoiceJobStore(self.root / "voice.db"),
                                    task_store=self.tasks,
                                    workspace=self.root / "voice")
        self.segments = [
            {"start": 0.0, "end": 2.0, "text": "第一句对白", "voiceId": "sapi:Microsoft Huihui Desktop",
             "speakerName": "角色A"},
            {"start": 2.5, "end": 4.5, "text": "第二句对白", "voiceId": "sapi:Microsoft Huihui Desktop",
             "speakerName": "角色B"},
        ]

    def tearDown(self) -> None:
        self.tasks.close()
        if self.service.store is not None:
            self.service.store.close()
        self._tmp.cleanup()

    def test_quote_returns_intent_hash_and_zero_points(self) -> None:
        body = self.service.quote_segments("proj-1", "a.mp4", self.segments)
        self.assertEqual(body["estimatedPoints"], 0.0)
        self.assertEqual(len(body["intentHash"]), 32)
        self.assertIn("canGenerate", body)

    def test_overlapping_segments_rejected(self) -> None:
        bad = [dict(self.segments[0]), dict(self.segments[1], start=1.0, end=3.0)]
        from domain.voice.service import VoiceError
        with self.assertRaises(VoiceError) as ctx:
            self.service.quote_segments("proj-1", "a.mp4", bad)
        self.assertEqual(ctx.exception.code, "invalid_input")

    def test_generate_rejects_stale_intent(self) -> None:
        from domain.voice.service import VoiceError
        with self.assertRaises(VoiceError) as ctx:
            self.service.generate("proj-1", "a.mp4", self.segments,
                                  intent_hash="deadbeef", rights_confirmed=True,
                                  background=False)
        self.assertEqual(ctx.exception.code, "quote_stale")

    def test_generate_produces_audio_and_status(self) -> None:
        if not self.service.available():
            self.skipTest("本机无可用 SAPI 音色")
        quote = self.service.quote_segments("proj-1", "a.mp4", self.segments)
        result = self.service.generate("proj-1", "a.mp4", self.segments,
                                       intent_hash=quote["intentHash"],
                                       rights_confirmed=True, background=False)
        self.assertIn("taskId", result)
        status = self.service.job_status("proj-1", "a.mp4")
        self.assertEqual(status["message"], "配音完成")
        self.assertEqual(status["completedCount"], 2)
        self.assertTrue(status["canObserve"])
        wav = self.root / "voice" / status["resultFile"]
        self.assertTrue(wav.is_file())
        self.assertGreater(pipe._probe_duration(wav), 3.0)

    def test_status_without_record(self) -> None:
        body = self.service.job_status("none", "n.mp4")
        self.assertFalse(body["canContinue"])
        self.assertFalse(body["canObserve"])
        self.assertIn("尚无配音记录", body["message"])


@unittest.skipUnless(shutil.which("ffmpeg"), "需要 ffmpeg")
class RealSynthesisTest(unittest.TestCase):
    def test_sapi_synthesizes_three_roles(self) -> None:
        provider = SapiProvider()
        if not provider.available():
            self.skipTest("本机无可用 SAPI 音色")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            items = parse(SRT)
            result = dub_dialogue(provider, items, root / "dub.wav", root / "work")
            self.assertTrue((root / "dub.wav").is_file())
            self.assertEqual(len(result["segments"]), 3)
            self.assertGreater(result["duration"], 2.0)
            self.assertIn("-->", result["srt"])


if __name__ == "__main__":
    unittest.main()
