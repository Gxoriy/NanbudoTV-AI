"""D5 电商/门店验收：展示柜形状、项目 CRUD、上传取图、营销类 501。"""

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
from app.api import commerce as commerce_api  # noqa: E402
from domain.workspace import DocStore  # noqa: E402


class CommerceRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = DocStore(self.root / "workspace.db", files_root=self.root / "files")
        self.router = Router()
        commerce_api.build(self.router, self.store)

    def tearDown(self) -> None:
        self.store.close()
        self._tmp.cleanup()

    def call(self, method: str, path: str, body: dict | bytes | None = None,
             headers: dict[str, str] | None = None):
        parsed = urlparse(path)
        if isinstance(body, dict):
            raw = json.dumps(body).encode()
            headers = {**(headers or {}), "content-type": "application/json"}
        else:
            raw = body or b""
        return self.router.dispatch(Request(method=method, path=path,
                                            query=parse_query(parsed.query),
                                            headers={k.lower(): v for k, v in
                                                     (headers or {}).items()},
                                            body=raw))

    def test_showcase_shape_matches_legacy(self) -> None:
        body = self.call("GET", "/api/ecommerce-showcase").payload
        self.assertEqual(body, {"ok": True, "cards": {"image": [], "video": []}})

    def test_showcase_lists_cards_from_store(self) -> None:
        self.store.create("ecommerce_card", "样片", {"type": "video", "file": "v.mp4",
                                                     "title": "案例一"})
        body = self.call("GET", "/api/ecommerce-showcase").payload
        self.assertEqual(len(body["cards"]["video"]), 1)
        card = body["cards"]["video"][0]
        self.assertTrue(card["url"].startswith("/api/ecommerce-showcase-media?id="))
        self.assertEqual(card["title"], "案例一")

    def test_ecommerce_project_crud(self) -> None:
        self.assertEqual(self.call("GET", "/api/ecommerce/").payload,
                         {"ok": True, "projects": []})
        saved = self.call("POST", "/api/ecommerce/save",
                          {"name": "保温杯广告", "product": "保温杯"})
        self.assertEqual(saved.status, 200)
        pid = saved.payload["project"]["id"]
        self.assertEqual(len(self.call("GET", "/api/ecommerce/").payload["projects"]), 1)

        updated = self.call("POST", "/api/ecommerce/save",
                            {"id": pid, "name": "保温杯广告v2"})
        self.assertEqual(updated.payload["project"]["name"], "保温杯广告v2")

    def test_store_project_create_and_read(self) -> None:
        self.assertEqual(self.call("POST", "/api/store/create", {"name": ""}).status, 400)
        created = self.call("POST", "/api/store/create", {"name": "门店A"}).payload["project"]
        got = self.call("GET", f"/api/store/project?id={created['id']}")
        self.assertEqual(got.payload["project"]["name"], "门店A")

        prepared = self.call("GET", f"/api/store/prepare?id={created['id']}")
        self.assertEqual(prepared.payload["steps"], [])

        quote = self.call("POST", "/api/store/quote", {})
        self.assertEqual(quote.payload["estimatedPoints"], 0.0)

    def test_store_upload_then_media(self) -> None:
        up = self.call("POST", "/api/store/upload", b"BINARY", {"x-filename": "a.png"})
        self.assertEqual(up.status, 200)
        file_rel = up.payload["file"]
        path = self.store.file_path(file_rel)
        self.assertIsNotNone(path)
        self.assertEqual(path.read_bytes(), b"BINARY")

    def test_showcase_media_serves_file(self) -> None:
        relative = self.store.save_file("cards", "cover.png", b"IMG")
        card = self.store.create("ecommerce_card", "封面", {"type": "image", "file": relative})
        resp = self.call("GET", f"/api/ecommerce-showcase-media?id={card['id']}")
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.raw, b"IMG")
        self.assertEqual(resp.content_type, "image/png")

    def test_marketing_without_llm_is_503(self) -> None:
        for path in ("/api/marketing/analyze", "/api/marketing/generate"):
            resp = self.call("POST", path, {"text": "保温杯"})
            self.assertEqual(resp.status, 503, path)
            self.assertEqual(resp.payload["error"], "model_unconfigured")

    def test_marketing_with_llm_returns_copy(self) -> None:
        class FakeAssist:
            def ready(self) -> bool:
                return True

            def json_call(self, system: str, user: str) -> dict:  # noqa: ARG002
                if "分析" in system:
                    return {"audience": "上班族", "sellingPoints": ["保温12小时"],
                            "tone": "利落", "keywords": ["保温杯"]}
                return {"title": "12小时不凉", "copy": "早上灌的热水，下班还烫",
                        "hashtags": ["#保温杯"]}

        router = Router()
        commerce_api.build(router, self.store, assist=FakeAssist())
        resp = router.dispatch(Request(
            method="POST", path="/api/marketing/generate", query={},
            headers={"content-type": "application/json"},
            body=json.dumps({"text": "保温杯", "platform": "抖音"}).encode()))
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.payload["title"], "12小时不凉")
        self.assertEqual(resp.payload["marketing"]["hashtags"], ["#保温杯"])

    def test_marketing_requires_material(self) -> None:
        class FakeAssist:
            def ready(self) -> bool:
                return True

            def json_call(self, system: str, user: str) -> dict:  # noqa: ARG002
                return {}

        router = Router()
        commerce_api.build(router, self.store, assist=FakeAssist())
        resp = router.dispatch(Request(
            method="POST", path="/api/marketing/analyze", query={},
            headers={"content-type": "application/json"}, body=b"{}"))
        self.assertEqual(resp.status, 400)


if __name__ == "__main__":
    unittest.main()
