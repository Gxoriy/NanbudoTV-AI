"""素材库四表 + 相似度检索（对齐原包 core.asset_library228 的 schema）。"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from domain.visual.assets import AssetStore  # noqa: E402


class AssetStoreTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = AssetStore(self.root / "assets.db")

    def tearDown(self) -> None:
        self.store.close()
        self._tmp.cleanup()

    def _tables(self) -> set[str]:
        rows = self.store._conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        return {row["name"] for row in rows}

    def test_four_tables_exist(self) -> None:
        tables = self._tables()
        for name in ("projects", "assets", "aliases", "versions"):
            self.assertIn(name, tables)

    def test_add_get_with_aliases_and_meta(self) -> None:
        row = self.store.add(name="林晚定妆", file="assets/a.png", kind="image",
                             project_id="p1", meta={"type": "image", "tags": ["主角"]},
                             aliases=["小晚", "女主"])
        self.assertEqual(row["name"], "林晚定妆")
        self.assertEqual(sorted(row["aliases"]), ["女主", "小晚"])
        self.assertEqual(row["tags"], ["主角"])
        self.assertEqual(self.store.get(row["id"])["projectId"], "p1")

    def test_search_ranks_exact_above_partial(self) -> None:
        exact = self.store.add(name="林晚", kind="image")
        partial = self.store.add(name="林晚定妆照", kind="image")
        other = self.store.add(name="周野", kind="image")

        hits = self.store.search("林晚")
        self.assertEqual(hits[0]["id"], exact["id"])
        self.assertEqual(hits[0]["similarity"], 3)
        self.assertEqual(hits[1]["id"], partial["id"])
        self.assertEqual(hits[1]["similarity"], 2)
        self.assertNotIn(other["id"], [hit["id"] for hit in hits])

    def test_alias_hit_is_searchable(self) -> None:
        row = self.store.add(name="外景街道", kind="image", aliases=["雨夜街头"])
        hits = self.store.search("雨夜街头")
        self.assertEqual(hits[0]["id"], row["id"])
        self.assertEqual(hits[0]["similarity"], 3)

    def test_project_filter(self) -> None:
        self.store.ensure_project("p1", "剧集一")
        self.store.ensure_project("p2", "剧集二")
        self.store.add(name="公共素材", kind="image", project_id="p1")
        self.store.add(name="公共素材", kind="image", project_id="p2")
        rows = self.store.list(project_id="p1")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["projectId"], "p1")

    def test_soft_delete_hides_from_list_and_search(self) -> None:
        row = self.store.add(name="待删素材", kind="image")
        self.assertTrue(self.store.delete(row["id"]))
        self.assertIsNone(self.store.get(row["id"]))
        self.assertEqual(self.store.list(), [])
        self.assertEqual(self.store.search("待删"), [])
        self.assertFalse(self.store.delete(row["id"]))       # 重复删除返回 False

    def test_versions_are_kept(self) -> None:
        row = self.store.add(name="海报", kind="image", file="v1.png")
        self.store.add_version(row["id"], "v2.png", note="换背景")
        versions = self.store.versions(row["id"])
        self.assertEqual(len(versions), 1)
        self.assertEqual(versions[0]["file"], "v2.png")

    def test_update_meta_and_aliases(self) -> None:
        row = self.store.add(name="道具", kind="image", aliases=["旧别名"])
        updated = self.store.update(row["id"], name="道具-新", meta={"type": "image",
                                                                    "note": "已修图"},
                                    aliases=["新别名"])
        self.assertEqual(updated["name"], "道具-新")
        self.assertEqual(updated["aliases"], ["新别名"])
        self.assertEqual(updated["note"], "已修图")


if __name__ == "__main__":
    unittest.main()
