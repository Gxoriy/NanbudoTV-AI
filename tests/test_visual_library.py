"""视觉域离线路由验收：画布、素材库、角色、偏好、自定义样式、模型缺失的 501 语义。"""

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
from app.api import visual_extra  # noqa: E402
from domain.visual import VisualService  # noqa: E402
from domain.visual.library import LibraryStore  # noqa: E402
from domain.visual.store import VisualStore  # noqa: E402
from infra.media.images import ImageConfig  # noqa: E402
from infra.tasks import TaskStore  # noqa: E402


class LibraryRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.library = LibraryStore(root / "library.db", files_root=root / "files")
        self.service = VisualService(styles_path=root / "styles.json",
                                     store=VisualStore(root / "visual.db"),
                                     workspace=root / "visual")
        self.router = Router()
        visual_extra.build(self.router, self.service, self.library)

    def tearDown(self) -> None:
        self.library.close()
        self.service.store.close()
        self._tmp.cleanup()

    def call(self, method: str, path: str, body: dict | bytes | None = None,
             headers: dict[str, str] | None = None):
        parsed = urlparse(path)
        if isinstance(body, dict):
            raw = json.dumps(body).encode()
            headers = {**(headers or {}), "content-type": "application/json"}
        else:
            raw = body or b""
        request = Request(method=method, path=path, query=parse_query(parsed.query),
                          headers={k.lower(): v for k, v in (headers or {}).items()},
                          body=raw)
        return self.router.dispatch(request)

    # ---------- 画布 ----------
    def test_canvas_save_get_and_list(self) -> None:
        saved = self.call("POST", "/api/canvas/save",
                          {"name": "画布A", "document": {"nodes": [{"id": "n1"}]}})
        self.assertEqual(saved.status, 200)
        canvas_id = saved.payload["id"]

        got = self.call("GET", f"/api/canvas/document?id={canvas_id}")
        self.assertEqual(got.payload["document"]["nodes"][0]["id"], "n1")

        listed = self.call("GET", "/api/canvas/list")
        self.assertEqual(len(listed.payload["canvases"]), 1)
        self.assertEqual(listed.payload["canvases"][0]["name"], "画布A")

    def test_canvas_document_missing(self) -> None:
        self.assertEqual(self.call("GET", "/api/canvas/document?id=x").status, 404)

    def test_canvas_upload_then_media(self) -> None:
        up = self.call("POST", "/api/canvas/upload", b"PNGDATA",
                       {"x-filename": "a.png"})
        self.assertEqual(up.status, 200)
        file_rel = up.payload["file"]
        media = self.call("GET", f"/api/canvas/media?file={file_rel}")
        self.assertEqual(media.status, 200)
        self.assertEqual(media.raw, b"PNGDATA")

    def test_canvas_media_traversal_blocked(self) -> None:
        self.assertEqual(self.call("GET", "/api/canvas/media?file=../../x").status, 404)

    # ---------- 素材库 ----------
    def test_asset_add_list_delete(self) -> None:
        added = self.call("POST", "/api/asset-library/add",
                          {"name": "封面", "file": "assets/a.png", "type": "image"})
        self.assertEqual(added.status, 200)
        asset_id = added.payload["asset"]["id"]

        listed = self.call("GET", "/api/asset-library/")
        self.assertEqual(listed.payload["count"], 1)

        self.assertEqual(self.call("POST", "/api/asset-library/delete",
                                   {"id": asset_id}).status, 200)
        self.assertEqual(self.call("GET", "/api/asset-library/").payload["count"], 0)

    def test_asset_upload_creates_record(self) -> None:
        up = self.call("POST", "/api/asset-library/upload", b"IMG", {"x-filename": "x.jpg"})
        self.assertEqual(up.status, 200)
        self.assertIn("asset", up.payload)
        self.assertEqual(self.call("GET", "/api/asset-library/").payload["count"], 1)

    # ---------- 角色 ----------
    def test_character_manage_requires_name_and_updates(self) -> None:
        self.assertEqual(self.call("POST", "/api/characters/manage",
                                   {"name": ""}).status, 400)
        created = self.call("POST", "/api/characters/manage",
                            {"name": "林小雨", "voiceId": "sapi:x"})
        char_id = created.payload["character"]["id"]
        updated = self.call("POST", "/api/characters/manage",
                            {"id": char_id, "name": "林小雨2"})
        self.assertEqual(updated.payload["character"]["name"], "林小雨2")
        self.assertEqual(len(self.call("GET", "/api/characters").payload["characters"]), 1)

    # ---------- 偏好 / 样式 / 用量 ----------
    def test_profile_roundtrip(self) -> None:
        self.call("POST", "/api/visual/profile/save", {"ratio": "9:16"})
        got = self.call("GET", "/api/visual/profile").payload["profile"]
        self.assertEqual(got["ratio"], "9:16")

    def test_custom_style_create_delete(self) -> None:
        created = self.call("POST", "/api/visual/style/create",
                            {"name": "赛博", "prompt": "霓虹"})
        style_id = created.payload["style"]["id"]
        self.assertEqual(self.call("POST", "/api/visual/style/delete",
                                   {"id": style_id}).status, 200)

    def test_usage_and_models(self) -> None:
        usage = self.call("GET", "/api/visual/points").payload
        # 免费模式：余额给足（旧前端用 <=0 判断积分不足，会把生成按钮锁死），
        # 但计费口径仍是 free、已用 0。
        self.assertEqual(usage["pricingMode"], "free")
        self.assertEqual(usage["usedPoints"], 0.0)
        self.assertGreater(usage["remainingPoints"], 0)
        models = self.call("GET", "/api/visual/models").payload
        self.assertEqual(models["models"], [])
        self.assertIn("尚未接入", models["message"])

    # ---------- 模型缺失 ----------
    def test_unregistered_routes_stay_501(self) -> None:
        # 本类只装 visual_extra：macro 系列归 visual_tail，未装即为未迁移
        resp = self.call("POST", "/api/visual/macro/state", {})
        self.assertEqual(resp.status, 501)
        self.assertIn(resp.payload["error"], ("model_required", "not_migrated"))

    def test_video_routes_validate_input(self) -> None:
        """视频生成已接通：缺提示词是 400（不是 501），未配置模型才是 503。"""
        resp = self.call("POST", "/api/visual/episode/video", {})
        self.assertEqual(resp.status, 400)
        resp = self.call("POST", "/api/visual/episode/video", {"prompt": "x"})
        self.assertEqual(resp.status, 503)
        self.assertEqual(resp.payload["error"], "model_unconfigured")


if __name__ == "__main__":
    unittest.main()
