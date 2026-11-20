"""原版更新新增组件（asset_tools283 / workflow_series282 / script-review）的契约。"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.api import Request, Router  # noqa: E402
from app.api import feature_pack  # noqa: E402
from domain.visual import VisualService  # noqa: E402
from domain.visual.store import VisualStore  # noqa: E402


class FeaturePackTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        root = Path(self._tmp.name)
        self.store = VisualStore(root / "visual.db")
        self.service = VisualService(styles_path=root / "styles.json",
                                     store=self.store, workspace=root / "visual")
        self.router = Router()
        feature_pack.build(self.router, self.service)
        self.pid = self.store.create("p1", "多剧集项目", settings={
            "confirmedScript": "第一场 图书馆 日 内\n林晚推门进来。\n屏幕：字幕提示",
            "assets": {"people": [{"id": "people-1", "name": "林晚"},
                                  {"id": "people-2", "name": "老鬼"}],
                       "scenes": [], "props": []},
        })["id"]

    def tearDown(self) -> None:
        self.store.close()
        self._tmp.cleanup()

    def call(self, method: str, path: str, body: dict | None = None,
             query: dict | None = None):
        return self.router.dispatch(Request(
            method=method, path=path, query=query or {},
            headers={"content-type": "application/json"} if body else {},
            body=json.dumps(body).encode() if body else b""))

    def test_script_review(self) -> None:
        got = self.call("GET", "/api/visual/project/script-review",
                        query={"projectId": [self.pid]})
        self.assertEqual(got.status, 200, got.payload)
        self.assertTrue(got.payload["rows"])
        self.assertEqual(got.payload["unmappedCount"], 0)

        saved = self.call("POST", "/api/visual/project/script-review",
                          {"projectId": self.pid, "decisions": {"1": "dialogue"}})
        self.assertEqual(saved.status, 200, saved.payload)
        again = self.call("GET", "/api/visual/project/script-review",
                          query={"projectId": [self.pid]})
        self.assertEqual(again.payload["rows"][0]["decision"], "dialogue")

    def test_series_flow(self) -> None:
        converted = self.call("POST", "/api/visual/series/convert",
                              {"projectId": self.pid})
        self.assertEqual(converted.status, 200, converted.payload)
        self.assertTrue(converted.payload["project"]["seriesManaged"])
        self.assertEqual(len(converted.payload["episodes"]), 1)

        first = converted.payload["episodes"][0]
        added = self.call("POST", "/api/visual/series/episode/create",
                          {"projectId": self.pid, "title": "第 2 集"})
        self.assertEqual(added.status, 200, added.payload)
        self.assertEqual(len(added.payload["episodes"]), 2)
        episode_id = added.payload["episodeId"]

        updated = self.call("POST", "/api/visual/series/episode/update",
                            {"projectId": self.pid, "episodeId": episode_id,
                             "title": "第 2 集（改）"})
        self.assertEqual(updated.payload["episodes"][1]["title"], "第 2 集（改）")

        removed = self.call("POST", "/api/visual/series/episode/delete",
                            {"projectId": self.pid, "episodeId": episode_id})
        self.assertEqual(len(removed.payload["deletedEpisodes"]), 1)
        self.assertEqual(len(removed.payload["episodes"]), 1)
        self.assertEqual(first["id"], removed.payload["episodes"][0]["id"])

    def test_merge_and_video_settings(self) -> None:
        preview = self.call("POST", "/api/visual/assets/merge/preview", {
            "projectId": self.pid, "kind": "people",
            "assetIds": ["people-1", "people-2"], "keepId": "people-1",
            "name": "主角"})
        self.assertEqual(preview.status, 200, preview.payload)
        self.assertTrue(preview.payload["planHash"])
        self.assertEqual(preview.payload["aliases"], ["老鬼"])

        applied = self.call("POST", "/api/visual/assets/merge/apply", {
            **preview.payload, "assetIds": ["people-1", "people-2"]})
        self.assertEqual(applied.status, 200, applied.payload)
        people = applied.payload["project"]["assets"]["people"]
        self.assertEqual(len(people), 1)
        self.assertEqual(people[0]["name"], "主角")

        video = self.call("POST", "/api/visual/macro/media/video-settings", {
            "projectId": self.pid, "segmentId": "scene-1", "cardNumber": 1,
            "model": "gt-6-sol", "resolution": "480p"})
        self.assertEqual(video.payload["videoSettings"]["model"], "gt-6-sol")
        reset = self.call("POST", "/api/visual/macro/media/video-settings",
                          {"projectId": self.pid, "reset": True})
        self.assertIsNone(reset.payload["videoSettings"])


if __name__ == "__main__":
    unittest.main()
