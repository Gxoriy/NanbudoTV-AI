"""UI 实际调用但此前缺失的接口：爆款拆解上传/查询、音色导入、小说列表、宏提交。"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.api import Request, Router, parse_query  # noqa: E402
from app.api import media_extra, rewrite, rewrite_extra, visual_tail  # noqa: E402
from domain.workspace import DocStore  # noqa: E402
from infra.tasks import TaskStore  # noqa: E402


class FakeAssist:
    def ready(self) -> bool:
        return True

    def json_call(self, system: str, user: str) -> dict:  # noqa: ARG002
        return {"hook": "开场即冲突", "shots": [{"index": 1, "shot": "雨夜街道"}],
                "cards": [{"number": 1, "seconds": 5, "shot": "雨"}],
                "scenes": [{"index": 1, "location": "图书馆"}]}

    def complete(self, system: str, user: str) -> str:  # noqa: ARG002
        return "正文"


class UiContractsTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.root = Path(self._tmp.name)
        self.store = DocStore(self.root / "ws.db", files_root=self.root / "files")
        self.tasks = TaskStore(self.root / "tasks.db")
        self.router = Router()
        rewrite.build(self.router, self.store, assist=FakeAssist(),
                      task_store=self.tasks)
        media_extra.build(self.router, self.store, data_dir=self.root)
        self.library = self._library()
        self.visual = self._visual_service()
        visual_tail.build(self.router, self.visual, self.library,
                          store=self.store, assist=FakeAssist(),
                          task_store=self.tasks)
        self.closers = [self.store, self.tasks]

    def _visual_service(self):
        from domain.visual import VisualService
        from domain.visual.store import VisualStore

        return VisualService(styles_path=self.root / "styles.json",
                             store=VisualStore(self.root / "visual.db"),
                             workspace=self.root / "visual")

    def _library(self):
        from domain.visual.library import LibraryStore

        return LibraryStore(self.root / "lib.db", files_root=self.root / "files")

    def _drain_tasks(self, timeout: float = 8.0) -> None:
        """等异步辅助任务跑完，否则临时目录里 tasks.db 会被线程占用。"""
        import time

        store = getattr(self, "tasks", None)
        if store is None:
            return
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                rows = store.list()
            except Exception:  # noqa: BLE001
                return
            if all(getattr(row, "state", "done") in ("done", "error") for row in rows):
                return
            time.sleep(0.05)

    def tearDown(self) -> None:
        self._drain_tasks()
        self.library.close()
        self.visual.store.close()
        self.tasks.close()
        self.store.close()
        self._tmp.cleanup()

    def call(self, method: str, path: str, body: dict | None = None,
             raw: bytes | None = None, headers: dict[str, str] | None = None):
        parsed = urlparse(path)
        if raw is not None:
            payload = raw
        elif body is not None:
            payload = json.dumps(body).encode()
        else:
            payload = b""
        merged = dict(headers or {})
        if body is not None:
            merged.setdefault("content-type", "application/json")
        return self.router.dispatch(Request(
            method=method, path=path, query=parse_query(parsed.query),
            headers={k.lower(): v for k, v in merged.items()}, body=payload))

    # ---------- 爆款拆解 ----------
    def test_breakdown_upload_returns_project(self) -> None:
        resp = self.call("POST", "/api/breakdown/upload", raw=b"VIDEO",
                         headers={"x-filename": "a.mp4", "x-media-type": "video"})
        self.assertEqual(resp.status, 200, resp.payload)
        project = resp.payload["project"]
        self.assertEqual(project["payload"]["mediaType"], "video")

        again = self.call("POST", "/api/breakdown/upload", raw=b"",
                          headers={"x-filename": "b.mp4"})
        self.assertEqual(again.status, 400)

    def test_breakdown_reference_needs_project(self) -> None:
        self.assertEqual(self.call("POST", "/api/breakdown/reference", raw=b"IMG")
                         .status, 404)
        created = self.call("POST", "/api/breakdown/upload", raw=b"VIDEO",
                            headers={"x-filename": "a.mp4"}).payload["project"]
        ok = self.call("POST", "/api/breakdown/reference", raw=b"IMG",
                       headers={"x-filename": "ref.png", "x-project-id": created["id"]})
        self.assertEqual(ok.status, 200, ok.payload)
        self.assertTrue(ok.payload["file"].startswith("breakdown/reference/"))

    def test_breakdown_analyze_and_observe(self) -> None:
        project = self.call("POST", "/api/breakdown/upload", raw=b"V",
                            headers={"x-filename": "a.mp4"}).payload["project"]
        started = self.call("POST", "/api/breakdown/analyze",
                            {"projectId": project["id"], "start": 0, "limit": 30})
        self.assertEqual(started.status, 200, started.payload)
        self.assertTrue(started.payload["taskId"])

        observed = self.call("POST", "/api/breakdown/observe",
                             {"projectId": project["id"]})
        self.assertEqual(observed.status, 200)
        self.assertEqual(observed.payload["taskId"], started.payload["taskId"])

    # ---------- 音色导入 ----------
    def test_voices_import_registers_profile(self) -> None:
        resp = self.call("POST", "/api/voices/import",
                         {"voiceId": "sapi:Microsoft Huihui Desktop", "name": "小慧"})
        self.assertEqual(resp.status, 200, resp.payload)
        self.assertEqual(resp.payload["voice"]["name"], "小慧")
        self.assertEqual(self.call("POST", "/api/voices/import", {}).status, 400)

    # ---------- 小说项目列表 ----------
    def test_novel_projects_root_list_and_create(self) -> None:
        listed = self.call("GET", "/api/novel-projects250")
        self.assertEqual(listed.status, 200)
        self.assertEqual(listed.payload["count"], 0)
        created = self.call("POST", "/api/novel-projects250",
                            {"name": "长夜", "text": "第一章"})
        self.assertEqual(created.payload["project"]["name"], "长夜")
        self.assertEqual(self.call("GET", "/api/novel-projects250")
                         .payload["count"], 1)

    # ---------- 宏提交 ----------
    def test_macro_submit_returns_task_id(self) -> None:
        resp = self.call("POST", "/api/visual/macro/submit",
                         {"projectId": "p1", "quoteId": "q1", "confirmed": True})
        self.assertEqual(resp.status, 200, resp.payload)
        self.assertTrue(resp.payload["taskId"])
        self.assertEqual(self.call("POST", "/api/visual/macro/submit", {}).status, 400)


if __name__ == "__main__":
    unittest.main()
