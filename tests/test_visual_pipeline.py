"""P3-02 落地验收：节点自省 + 流水线执行接口。"""

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
from domain.visual import VisualService  # noqa: E402
from domain.visual.store import VisualStore  # noqa: E402


class FakeAssist:
    def plan(self, text: str, *, shots: int = 6, concurrency: int = 3) -> dict:  # noqa: ARG002
        return {"shots": [{"index": i, "seconds": 4, "shot": f"镜头{i}"}
                          for i in range(1, shots + 1)]}

    def complete(self, system: str, user: str) -> str:  # noqa: ARG002
        return "雨夜街道，外卖员背影，电影感"


class FakeVideo:
    def __init__(self) -> None:
        self.started: list[dict] = []

    def start(self, kind, **kwargs):  # noqa: ANN001, ANN003
        self.started.append({"kind": kind, **kwargs})
        return {"ok": True, "taskId": f"task-{len(self.started)}"}

    def observe(self, task_id: str):  # noqa: ANN001
        return {"id": task_id, "state": "running"}


class PipelineApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.service = VisualService(styles_path=self.root / "styles.json",
                                     store=VisualStore(self.root / "visual.db"),
                                     workspace=self.root / "visual")
        self.video = FakeVideo()
        self.router = Router()
        visual_api.build(self.router, self.service, pipeline_services={
            "llm": FakeAssist(), "video": self.video,
        })

    def tearDown(self) -> None:
        self.service.store.close()
        self._tmp.cleanup()

    def call(self, method: str, path: str, body: dict | None = None):
        parsed = urlparse(path)
        return self.router.dispatch(Request(
            method=method, path=path, query=parse_query(parsed.query),
            headers={"content-type": "application/json"} if body else {},
            body=json.dumps(body).encode() if body is not None else b""))

    def test_nodes_endpoint_exposes_stages_and_pipelines(self) -> None:
        body = self.call("GET", "/api/visual/_nodes").payload
        self.assertEqual(body["total"], 9)
        self.assertIn("prepare", body["stages"])
        self.assertIn("macro", body["pipelines"])
        self.assertEqual(body["pipelines"]["inspect"],
                         ["source.normalize", "assets.match", "cards.build"])

    def test_inspect_pipeline_reports_trace(self) -> None:
        body = self.call("POST", "/api/visual/_pipeline/run",
                         {"pipeline": "inspect",
                          "context": {"sourceText": "雨夜送餐",
                                      "shots": [{"seconds": 4}, {"seconds": 3}]}}).payload
        self.assertTrue(body["ok"])
        self.assertEqual([step["name"] for step in body["trace"]],
                         ["source.normalize", "assets.match", "cards.build"])
        self.assertEqual(body["context"]["cardCount"], 2)
        self.assertEqual(body["context"]["characters"], 4)

    def test_macro_pipeline_submits_media(self) -> None:
        body = self.call("POST", "/api/visual/_pipeline/run",
                         {"pipeline": "macro",
                          "context": {"sourceText": "雨夜送餐"}}).payload
        self.assertTrue(body["ok"], body)
        steps = [step["name"] for step in body["trace"]]
        self.assertIn("media.submit", steps)
        self.assertEqual(body["context"]["submitted"], len(self.video.started))
        self.assertTrue(all(item["state"] == "running"
                            for item in body["context"]["mediaStates"]))
        self.assertTrue(body["context"]["export"]["free"])

    def test_unknown_pipeline_is_400(self) -> None:
        resp = self.call("POST", "/api/visual/_pipeline/run", {"pipeline": "nope"})
        self.assertEqual(resp.status, 400)
        self.assertIn("未知流水线", resp.payload["message"])

    def test_missing_capability_is_422(self) -> None:
        router = Router()
        visual_api.build(router, self.service, pipeline_services={})
        resp = router.dispatch(Request(
            method="POST", path="/api/visual/_pipeline/run", query={},
            headers={"content-type": "application/json"},
            body=json.dumps({"pipeline": "storyboard",
                             "context": {"sourceText": "第一场"}}).encode()))
        self.assertEqual(resp.status, 422)
        self.assertEqual(resp.payload["error"], "node_failed")
        self.assertIn("缺少能力", resp.payload["message"])

    def test_context_must_be_object(self) -> None:
        resp = self.call("POST", "/api/visual/_pipeline/run",
                         {"pipeline": "inspect", "context": "bad"})
        self.assertEqual(resp.status, 400)


if __name__ == "__main__":
    unittest.main()
