"""图像生成接入验收：未配置 503、配置后用假 transport 真出图并落库。"""

from __future__ import annotations

import base64
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

PNG = base64.b64decode(
    b"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")


class FakeTransport:
    def __init__(self) -> None:
        self.calls = 0

    def post_json(self, url, headers, payload, timeout):  # noqa: ANN001
        self.calls += 1
        return 200, {"data": [{"b64_json": base64.b64encode(PNG).decode()}]}


class GenerateRouteTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.library = LibraryStore(self.root / "lib.db", files_root=self.root / "files")
        self.projects = VisualStore(self.root / "visual.db")
        self.service = VisualService(styles_path=self.root / "styles.json",
                                     store=self.projects, workspace=self.root / "visual")
        self.tasks = TaskStore(self.root / "tasks.db")
        self.transport = FakeTransport()

    def tearDown(self) -> None:
        self.tasks.close()
        self.library.close()
        self.projects.close()
        self._tmp.cleanup()

    def _router(self, images: ImageConfig):
        router = Router()
        visual_extra.build(router, self.service, self.library, images=images,
                           task_store=self.tasks, transport=self.transport)
        return router

    def _post(self, router: Router, path: str, payload: dict):
        parsed = urlparse(path)
        request = Request(method="POST", path=path, query=parse_query(parsed.query),
                          headers={"content-type": "application/json"},
                          body=json.dumps(payload).encode())
        return router.dispatch(request)

    def test_unconfigured_returns_503(self) -> None:
        resp = self._post(self._router(ImageConfig()), "/api/visual/cover/generate",
                          {"projectId": "p1", "prompt": "封面"})
        self.assertEqual(resp.status, 503)
        self.assertEqual(resp.payload["error"], "model_unconfigured")
        self.assertEqual(self.transport.calls, 0)

    def test_generate_writes_asset_and_thumbnail(self) -> None:
        project = self.service.create_project({"projectName": "剧集A"})["project"]
        router = self._router(ImageConfig(base_url="https://api.example/v1",
                                          model="gpt_image_2.5"))
        resp = self._post(router, "/api/visual/cover/generate",
                          {"projectId": project["id"], "prompt": "夜晚的街道", "wait": True})
        self.assertEqual(resp.status, 200, resp.payload)
        self.assertEqual(resp.payload["state"], "done")
        self.assertEqual(self.transport.calls, 1)

        assets = self.library.list("asset")
        self.assertEqual(len(assets), 1)
        file_rel = assets[0]["payload"]["file"]
        self.assertTrue((self.root / "files" / file_rel).is_file())
        self.assertEqual(self.projects.get(project["id"])["thumbnail"], file_rel)

    def test_empty_prompt_rejected(self) -> None:
        resp = self._post(self._router(ImageConfig(base_url="https://x/v1", model="m")),
                          "/api/visual/asset/generate", {"projectId": "p", "prompt": "  "})
        self.assertEqual(resp.status, 400)


if __name__ == "__main__":
    unittest.main()
