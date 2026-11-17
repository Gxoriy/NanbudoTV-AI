"""电商动作分派器（前端 `fetch('/api/ecommerce/' + action)` 的那 25 个动作）。"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.api import Request, Router, parse_query  # noqa: E402
from app.api import compat as compat_api  # noqa: E402
from domain.workspace import DocStore  # noqa: E402


class FakeAssist:
    def ready(self) -> bool:
        return True

    def json_call(self, system: str, user: str) -> dict:  # noqa: ARG002
        return {"title": "12小时保温", "sellingPoints": ["长效锁温"]}


class CompatTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = DocStore(self.root / "ws.db", files_root=self.root / "files")
        self.tasks = None
        self.router = Router()
        compat_api.build(self.router, self.store, assist=FakeAssist(),
                         files_root=self.root / "files")

    def tearDown(self) -> None:
        if self.tasks is not None:
            self.tasks.close()
        self.store.close()
        self._tmp.cleanup()

    def call(self, action: str, body: dict | None = None, method: str = "POST",
             query: str = ""):
        path = f"/api/ecommerce/{action}{query}"
        return self.router.dispatch(Request(
            method=method, path=path, query=parse_query(query.lstrip("?")),
            headers={"content-type": "application/json"} if body is not None else {},
            body=json.dumps(body).encode() if body is not None else b""))

    def test_create_then_list_then_save(self) -> None:
        created = self.call("create", {"name": "保温杯"})
        self.assertEqual(created.status, 200, created.payload)
        doc_id = created.payload["id"]

        listed = self.call("list", method="GET", query="?includeDeleted=1")
        self.assertEqual(listed.payload["count"], 1)

        saved = self.call("save", {"id": doc_id, "name": "保温杯-改",
                                   "document": {"title": "x"}})
        self.assertEqual(saved.payload["document"]["name"], "保温杯-改")

    def test_list_does_not_match_query_in_action_name(self) -> None:
        """回归：path 带 query 时不能把 'list?includeDeleted=1' 当动作名。"""
        resp = self.call("list", method="GET", query="?includeDeleted=1")
        self.assertEqual(resp.status, 200)
        self.assertNotIn("error", resp.payload)

    def test_quotes_are_free(self) -> None:
        for action in ("quote", "analyze-quote", "batch/quote"):
            resp = self.call(action, {})
            self.assertEqual(resp.payload["estimatedPoints"], 0.0, action)

    def test_unknown_action_lists_available(self) -> None:
        resp = self.call("nope", {})
        self.assertEqual(resp.status, 404)
        self.assertIn("create", resp.payload["message"])

    def test_preferences_roundtrip(self) -> None:
        saved = self.call("preferences", {"ratio": "9:16"})
        self.assertEqual(saved.payload["preferences"]["ratio"], "9:16")
        read = self.call("preferences", method="GET", query="?media=image")
        self.assertEqual(read.payload["preferences"]["ratio"], "9:16")
        self.assertEqual(read.payload["media"], "image")

    def test_batch_lifecycle(self) -> None:
        doc_id = self.call("create", {"name": "批次"}).payload["id"]
        created = self.call("batch/create", {"id": doc_id,
                                            "settings": {"style": "干净"}})
        self.assertEqual(len(created.payload["batch"]["items"]), 1)
        batch_id = created.payload["batch"]["items"][0]["id"]

        paused = self.call("batch/pause", {"id": doc_id})
        self.assertTrue(paused.payload["batch"]["paused"])

        removed = self.call("batch/delete-items", {"id": doc_id, "ids": [batch_id]})
        self.assertEqual(removed.payload["batch"]["items"], [])

    def test_delete_then_restore(self) -> None:
        doc_id = self.call("create", {"name": "待删"}).payload["id"]
        self.assertEqual(self.call("delete", {"id": doc_id}).status, 200)
        restored = self.call("restore", {"id": doc_id})
        self.assertEqual(restored.status, 200)
        self.assertEqual(restored.payload["document"]["id"], doc_id)

    def test_batch_start_creates_task(self) -> None:
        from infra.tasks import TaskStore

        self.tasks = TaskStore(self.root / "tasks.db")
        self.router = Router()
        compat_api.build(self.router, self.store, assist=FakeAssist(),
                         task_store=self.tasks, files_root=self.root / "files")
        doc_id = self.call("create", {"name": "批"}).payload["id"]
        self.call("batch/create", {"id": doc_id, "settings": {}})
        started = self.call("batch/start", {"id": doc_id})
        self.assertEqual(started.status, 200, started.payload)
        self.assertTrue(started.payload["taskId"])

    def test_batch_start_without_items_is_400(self) -> None:
        doc_id = self.call("create", {"name": "空批"}).payload["id"]
        resp = self.call("batch/start", {"id": doc_id})
        self.assertEqual(resp.status, 400)


if __name__ == "__main__":
    unittest.main()
