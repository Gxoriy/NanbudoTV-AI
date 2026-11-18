"""上传接口契约：前端用 videoId 判断"能否识别对白"，用 originalName/durationSeconds 显示元信息。"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.api import Request, Router  # noqa: E402
from app.api import media_extra  # noqa: E402
from domain.workspace import DocStore  # noqa: E402


class UploadContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = DocStore(self.root / "ws.db", files_root=self.root / "files")
        self.router = Router()
        media_extra.build(self.router, self.store, data_dir=self.root)

    def tearDown(self) -> None:
        self.store.close()
        self._tmp.cleanup()

    def upload(self, payload: bytes, filename: str):
        return self.router.dispatch(Request(
            method="POST", path="/api/upload", query={},
            headers={"x-filename": quote(filename),
                     "content-type": "application/octet-stream"},
            body=payload))

    def test_returns_video_id_and_original_name(self) -> None:
        resp = self.upload(b"RIFF" + bytes(4000), "对白样例.mp4")
        self.assertEqual(resp.status, 200, resp.payload)
        body = resp.payload
        self.assertTrue(body["videoId"], "videoId 为空会导致识别按钮永远禁用")
        self.assertEqual(body["originalName"], "对白样例.mp4")
        self.assertIn("durationSeconds", body)
        self.assertEqual(body["size"], 4004)
        self.assertTrue(body["file"].startswith("uploads/"))

    def test_non_media_still_returns_metadata(self) -> None:
        """非视频文件不能 500：探测失败时时长给 0，但字段必须在。"""
        resp = self.upload(b"hello", "note.txt")
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.payload["durationSeconds"], 0.0)
        self.assertEqual(resp.payload["originalName"], "note.txt")

    def test_empty_upload_rejected(self) -> None:
        resp = self.upload(b"", "x.mp4")
        self.assertEqual(resp.status, 400)


if __name__ == "__main__":
    unittest.main()
