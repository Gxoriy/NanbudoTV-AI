"""ASR 接口验收：状态、转写落库、SRT 下载（模型用假实现，不打真网/不下载权重）。"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.api import Request, Router, parse_query  # noqa: E402
from app.api import media_extra  # noqa: E402
from domain.workspace import DocStore  # noqa: E402
from infra.asr.whisper import Transcript  # noqa: E402


class AsrRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = DocStore(self.root / "ws.db", files_root=self.root / "files")
        self.router = Router()
        media_extra.build(self.router, self.store, data_dir=self.root)

    def tearDown(self) -> None:
        self.store.close()
        self._tmp.cleanup()

    def call(self, method: str, path: str, body: bytes | None = None,
             headers: dict[str, str] | None = None):
        parsed = urlparse(path)
        return self.router.dispatch(Request(
            method=method, path=path, query=parse_query(parsed.query),
            headers={k.lower(): v for k, v in (headers or {}).items()}, body=body or b""))

    def test_status_reports_engine_and_model(self) -> None:
        body = self.call("GET", "/api/asr/status").payload
        self.assertTrue(body["ok"])
        self.assertEqual(body["engine"], "faster-whisper")
        self.assertIn("model", body)
        self.assertIn("ready", body)

    def test_transcribe_writes_srt_and_record(self) -> None:
        fake = Transcript(text="今天天气不错", language="zh", duration=2.4,
                          segments=[{"start": 0.0, "end": 1.2, "text": "今天天气"},
                                    {"start": 1.2, "end": 2.4, "text": "不错"}])
        with mock.patch("infra.asr.transcribe", return_value=fake), \
                mock.patch("infra.asr.available", return_value=(True, "ok")):
            resp = self.call("POST", "/api/transcribe", b"RIFF0000",
                             {"x-filename": "a.wav"})
        self.assertEqual(resp.status, 200, resp.payload)
        body = resp.payload
        self.assertEqual(body["count"], 2)
        self.assertIn("-->", body["srt"])
        self.assertEqual(body["language"], "zh")

        record = self.store.get(body["id"])
        self.assertEqual(record["kind"], "transcript")
        self.assertEqual(record["payload"]["segments"], 2)

        srt = self.call("GET", f"/api/asr/download?id={body['id']}")
        self.assertEqual(srt.status, 200)
        self.assertIn("今天天气".encode("utf-8"), srt.raw)

    def test_empty_audio_rejected(self) -> None:
        self.assertEqual(self.call("POST", "/api/transcribe").status, 400)

    def test_unavailable_engine_returns_501(self) -> None:
        with mock.patch("infra.asr.available", return_value=(False, "未安装 faster-whisper")):
            resp = self.call("POST", "/api/transcribe", b"x", {"x-filename": "a.wav"})
        self.assertEqual(resp.status, 501)
        self.assertEqual(resp.payload["error"], "model_required")

    def test_silent_audio_returns_empty_result(self) -> None:
        empty = Transcript(text="", language="", duration=1.0, segments=[])
        with mock.patch("infra.asr.transcribe", return_value=empty), \
                mock.patch("infra.asr.available", return_value=(True, "ok")):
            resp = self.call("POST", "/api/transcribe", b"RIFF", {"x-filename": "s.wav"})
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.payload["count"], 0)
        self.assertIn("未识别到语音", resp.payload["message"])

    def test_download_unknown_id_404(self) -> None:
        self.assertEqual(self.call("GET", "/api/asr/download?id=nope").status, 404)


if __name__ == "__main__":
    unittest.main()
