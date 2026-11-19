"""「识别视频对白」契约：JSON(videoId) → {taskId} → 任务完成含 transcript/meta。

两个曾在真机暴露的问题：
1. /api/transcribe 只接受原始音频字节 → JSON 请求被判成空音频，返回 invalid_input
2. /api/tasks/<id> 只回 {task:{...}}，前端读 task.state 得到 undefined
   → 一律显示"任务状态无效"
"""

from __future__ import annotations

import json
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.api import Request, Router  # noqa: E402
from app.api import media_extra, system  # noqa: E402
from domain.workspace import DocStore  # noqa: E402
from infra.asr.whisper import Transcript  # noqa: E402
from infra.tasks import TaskStore  # noqa: E402

FAKE = Transcript(text="第一场 图书馆 白天。", language="zh", duration=9.2,
                  segments=[{"start": 0.0, "end": 3.0, "text": "第一场 图书馆 白天。"},
                            {"start": 3.0, "end": 9.2, "text": "林晚把剧本推过去。"}])


class AsrTaskContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = DocStore(self.root / "ws.db", files_root=self.root / "files")
        self.tasks = TaskStore(self.root / "tasks.db")
        self.router = Router()
        media_extra.build(self.router, self.store, data_dir=self.root,
                          task_store=self.tasks)
        system.build(self.router, self.tasks, app_name="test", version="0",
                     port_ref={"port": 0}, workspace=self.store,
                     data_dir=self.root)

    def tearDown(self) -> None:
        self.tasks.close()
        self.store.close()
        self._tmp.cleanup()

    def call(self, method: str, path: str, body: dict | None = None,
             raw: bytes | None = None, headers: dict[str, str] | None = None):
        payload = raw if raw is not None else (
            json.dumps(body).encode() if body is not None else b"")
        merged = {"content-type": "application/json"} if body is not None else {}
        merged.update(headers or {})
        return self.router.dispatch(Request(method=method, path=path, query={},
                                            headers=merged, body=payload))

    def _upload(self) -> str:
        resp = self.call("POST", "/api/upload", raw=b"RIFF" + bytes(4000),
                         headers={"x-filename": quote("对白样例.wav"),
                                  "content-type": "application/octet-stream"})
        self.assertEqual(resp.status, 200, resp.payload)
        return resp.payload["videoId"]

    def test_json_video_task_produces_transcript(self) -> None:
        video_id = self._upload()
        with mock.patch("infra.asr.available", return_value=(True, "ok")), \
                mock.patch("infra.asr.transcribe", return_value=FAKE):
            resp = self.call("POST", "/api/transcribe",
                             {"videoId": video_id, "modelSize": "tiny"})
            self.assertEqual(resp.status, 200, resp.payload)
            task_id = resp.payload["taskId"]
            for _ in range(100):
                snap = self.call("GET", f"/api/tasks/{task_id}").payload
                if snap.get("state") in ("done", "error"):
                    break
                time.sleep(0.05)
        self.assertEqual(snap["state"], "done", snap)
        # 前端 pollTask 直接读顶层 state（这是"任务状态无效"的根因）
        self.assertIn("state", snap)
        result = snap["result"]
        self.assertIn("图书馆", result["transcript"])
        self.assertEqual(result["meta"]["segment_count"], 2)
        self.assertFalse(result["meta"]["auto_corrected"])

    def test_unknown_video_is_404(self) -> None:
        resp = self.call("POST", "/api/transcribe", {"videoId": "not-exist"})
        self.assertEqual(resp.status, 404)
        self.assertEqual(resp.payload["error"], "not_found")

    def test_missing_video_id_is_400(self) -> None:
        resp = self.call("POST", "/api/transcribe", {"videoId": ""})
        self.assertEqual(resp.status, 400)

    def test_raw_audio_path_still_works(self) -> None:
        """老契约（直接 POST 音频字节）不能被新分支挤掉。"""
        with mock.patch("infra.asr.available", return_value=(True, "ok")), \
                mock.patch("infra.asr.transcribe", return_value=FAKE):
            resp = self.call("POST", "/api/transcribe", raw=b"RIFF" + bytes(4000),
                             headers={"x-filename": quote("a.wav"),
                                      "content-type": "application/octet-stream"})
        self.assertEqual(resp.status, 200, resp.payload)
        self.assertIn("图书馆", resp.payload["text"])
        self.assertEqual(resp.payload["count"], 2)


if __name__ == "__main__":
    unittest.main()
