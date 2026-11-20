"""旧版资产（没有 id）兼容：读取时补 id，提示词接口不 404。"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.api import Request, Router  # noqa: E402
from app.api import visual_tail  # noqa: E402
from domain.visual import VisualService  # noqa: E402
from domain.visual.library import LibraryStore  # noqa: E402
from domain.visual.store import VisualStore  # noqa: E402
from domain.workspace import DocStore  # noqa: E402


class LegacyAssetTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.root = Path(self._tmp.name)
        self.store = VisualStore(self.root / "visual.db")
        self.service = VisualService(styles_path=self.root / "styles.json",
                                     store=self.store,
                                     workspace=self.root / "visual")
        self.library = LibraryStore(self.root / "lib.db", files_root=self.root / "lib")
        self.docs = DocStore(self.root / "docs.db", files_root=self.root / "files")
        self.router = Router()
        visual_tail.build(self.router, self.service, self.library, store=self.docs)
        self.record = self.store.create(
            "legacy-1", "旧项目",
            settings={"assets": {"people": [{"name": "林晚"}, {"name": "陈默"}],
                                 "scenes": [], "props": []}})

    def tearDown(self) -> None:
        self.docs.close()
        self.library.close()
        self.store.close()
        self._tmp.cleanup()

    def _get(self, project_id: str) -> dict:
        record = self.store.get(project_id)
        return record

    def test_store_synthesizes_ids_on_read(self) -> None:
        record = self._get(self.record["id"])
        people = record["assets"]["people"]
        self.assertEqual([row["id"] for row in people], ["people-1", "people-2"])
        self.assertTrue(all(row["kind"] == "people" for row in people))
        # 不能把 id 写回数据库（读取时补，避免污染）
        raw = json.loads(self.store._conn.execute(
            "SELECT settings FROM visual_projects WHERE id=?",
            (self.record["id"],)).fetchone()["settings"])
        self.assertNotIn("id", raw["assets"]["people"][0])

    def test_unknown_asset_prompt_is_200(self) -> None:
        resp = self.router.dispatch(Request(
            method="POST", path="/api/visual/asset/prompt", query={},
            headers={"content-type": "application/json"},
            body=json.dumps({"assetId": "people-999"}).encode()))
        self.assertEqual(resp.status, 200, resp.payload)
        self.assertEqual(resp.payload.get("prompt"), "")


if __name__ == "__main__":
    unittest.main()
