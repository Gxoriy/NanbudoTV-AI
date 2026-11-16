"""D1 改写域离线部分验收：项目 CRUD 形状与 LLM 缺失语义。"""

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
from app.api import rewrite as rewrite_api  # noqa: E402
from domain.workspace import DocStore  # noqa: E402


class RewriteRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.store = DocStore(Path(self._tmp.name) / "workspace.db")
        self.router = Router()
        rewrite_api.build(self.router, self.store)

    def tearDown(self) -> None:
        self.store.close()
        self._tmp.cleanup()

    def call(self, method: str, path: str, body: dict | None = None):
        parsed = urlparse(path)
        raw = json.dumps(body).encode() if body is not None else b""
        headers = {"content-type": "application/json"} if body is not None else {}
        return self.router.dispatch(Request(method=method, path=path,
                                            query=parse_query(parsed.query),
                                            headers=headers, body=raw))

    def test_empty_lists_match_legacy_shapes(self) -> None:
        self.assertEqual(self.call("GET", "/api/rewrite-projects").payload,
                         {"projects": [], "ok": True})
        # 爆款拆解与提示词反推的旧契约没有 ok 字段
        self.assertEqual(self.call("GET", "/api/breakdown/projects").payload,
                         {"projects": []})
        self.assertEqual(self.call("GET", "/api/prompt-reverse/projects").payload,
                         {"projects": []})

    def test_breakdown_save_and_get(self) -> None:
        saved = self.call("POST", "/api/breakdown/save",
                          {"projectName": "第1集拆解", "episode": 1})
        self.assertEqual(saved.status, 200)
        project = saved.payload["project"]
        self.assertEqual(project["name"], "第1集拆解")
        self.assertEqual(project["payload"]["episode"], 1)

        got = self.call("GET", f"/api/breakdown/project?id={project['id']}")
        self.assertEqual(got.payload["project"]["name"], "第1集拆解")
        self.assertEqual(len(self.call("GET", "/api/breakdown/projects").payload["projects"]), 1)

    def test_save_requires_name_for_new_project(self) -> None:
        self.assertEqual(self.call("POST", "/api/breakdown/save", {"name": " "}).status, 400)

    def test_save_updates_existing(self) -> None:
        created = self.call("POST", "/api/prompt-reverse/save",
                            {"name": "素材A", "prompt": "霓虹"}).payload["project"]
        updated = self.call("POST", "/api/prompt-reverse/save",
                            {"id": created["id"], "name": "素材A2", "prompt": "暖光"})
        self.assertEqual(updated.payload["project"]["name"], "素材A2")
        self.assertEqual(updated.payload["project"]["payload"]["prompt"], "暖光")

    def test_kind_isolation(self) -> None:
        self.call("POST", "/api/breakdown/save", {"name": "拆解"})
        self.assertEqual(self.call("GET", "/api/prompt-reverse/projects").payload["projects"], [])
        self.assertEqual(self.call("GET", "/api/rewrite-projects").payload["projects"], [])

    def test_missing_project_404(self) -> None:
        self.assertEqual(self.call("GET", "/api/breakdown/project?id=nope").status, 404)

    def test_llm_routes_are_explicit_501(self) -> None:
        for path in ("/api/breakdown/quote", "/api/prompt-reverse/analyze",
                     "/api/novel-screenplay/start", "/api/original/recommend"):
            resp = self.call("POST", path, {})
            self.assertEqual(resp.status, 501, path)
            self.assertEqual(resp.payload["error"], "model_required")
            self.assertIn("LLM", resp.payload["message"])


if __name__ == "__main__":
    unittest.main()
