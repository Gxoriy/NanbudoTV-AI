"""D2 收尾路由验收：画布、素材生命周期、macro 状态、去重。"""

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
from app.api import visual as visual_api  # noqa: E402
from app.api import visual_tail  # noqa: E402
from domain.visual import VisualService  # noqa: E402
from domain.visual.library import LibraryStore  # noqa: E402
from domain.visual.store import VisualStore  # noqa: E402
from domain.workspace import DocStore  # noqa: E402


class TailRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.library = LibraryStore(root / "lib.db", files_root=root / "files")
        self.projects = VisualStore(root / "visual.db")
        self.workspace = DocStore(root / "ws.db")
        self.service = VisualService(styles_path=root / "styles.json",
                                     store=self.projects, workspace=root / "visual")
        self.router = Router()
        visual_api.build(self.router, self.service)
        visual_tail.build(self.router, self.service, self.library,
                          store=self.workspace, assist=None)

    def tearDown(self) -> None:
        self.workspace.close()
        self.library.close()
        self.projects.close()
        self._tmp.cleanup()

    def call(self, method: str, path: str, body: dict | None = None):
        parsed = urlparse(path)
        raw = json.dumps(body).encode() if body is not None else b""
        return self.router.dispatch(Request(
            method=method, path=path, query=parse_query(parsed.query),
            headers={"content-type": "application/json"} if body is not None else {},
            body=raw))

    def test_canvas_root_alias(self) -> None:
        self.assertEqual(self.call("GET", "/api/canvas/").payload,
                         {"ok": True, "canvases": []})
        created = self.library.create("canvas", "画布A", {"nodes": []})
        got = self.call("GET", f"/api/canvas/?id={created['id']}")
        self.assertEqual(got.payload["document"], {"nodes": []})

    def test_asset_lifecycle(self) -> None:
        added = self.call("POST", "/api/visual/asset/add",
                          {"name": "素材", "file": "a.png"})
        asset_id = added.payload["asset"]["id"]
        self.assertEqual(self.call("POST", "/api/visual/asset/bind-character",
                                   {"assetId": asset_id, "characterId": "c1"}
                                   ).payload["asset"]["characterId"], "c1")
        self.assertEqual(self.call("POST", "/api/visual/asset/reset",
                                   {"assetId": asset_id}).payload["state"], "idle")
        self.assertEqual(self.call("GET", f"/api/visual/asset/observe?id={asset_id}"
                                          ).payload["state"], "idle")

    def test_asset_deduplicate(self) -> None:
        relative = self.library.save_file("assets", "x.png", b"SAME")
        self.library.create("asset", "A", {"file": relative})
        self.library.create("asset", "B", {"file": relative})
        body = self.call("POST", "/api/visual/assets/deduplicate").payload
        self.assertEqual(body["removed"], 1)
        self.assertEqual(body["kept"], 1)

    def test_macro_state_roundtrip_and_video_gate(self) -> None:
        saved = self.call("POST", "/api/visual/macro/submit",
                          {"projectId": "p1", "stage": "cards"}).payload
        self.assertEqual(saved["state"]["stage"], "cards")
        state = self.call("GET", "/api/visual/macro/state?projectId=p1").payload
        self.assertEqual(state["state"]["stage"], "cards")

        quote = self.call("POST", "/api/visual/macro/quote", {})
        self.assertEqual(quote.payload["estimatedPoints"], 0.0)

        submit = self.call("POST", "/api/visual/macro/media/submit", {})
        self.assertEqual(submit.status, 501)
        self.assertEqual(submit.payload["error"], "model_required")

    def test_canvas_assistant_without_llm(self) -> None:
        resp = self.call("POST", "/api/canvas/assistant/start", {"prompt": "做一段"})
        self.assertEqual(resp.status, 503)
        self.assertEqual(resp.payload["error"], "model_unconfigured")


if __name__ == "__main__":
    unittest.main()
