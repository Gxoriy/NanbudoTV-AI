"""保存项目外观设置时不能把已提取的资产抹掉（这是"点生成参考图后全清空"的根因）。"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from domain.visual import VisualService  # noqa: E402
from domain.visual.store import VisualStore  # noqa: E402


class SettingsKeepAssetsTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.root = Path(self._tmp.name)
        self.store = VisualStore(self.root / "visual.db")
        self.service = VisualService(styles_path=self.root / "styles.json",
                                     store=self.store,
                                     workspace=self.root / "visual")
        self.project = self.store.create(
            "p1", "旧项目",
            settings={"assets": {"people": [{"name": "林晚"}, {"name": "陈默"}],
                                 "scenes": [], "props": []}})

    def tearDown(self) -> None:
        self.store.close()
        self._tmp.cleanup()

    def _assets(self) -> list:
        record = self.store.get(self.project["id"])
        return (record.get("settings") or {}).get("assets", {}).get("people", [])

    def test_save_settings_without_assets_keeps_them(self) -> None:
        self.assertEqual(len(self._assets()), 2)
        self.service.save_settings({"projectId": self.project["id"],
                                    "settings": {"visualStyle": "live_action"}})
        self.assertEqual(len(self._assets()), 2)

    def test_store_update_settings_without_assets_keeps_them(self) -> None:
        self.store.update(self.project["id"], settings={"imageResolution": "2K"})
        self.assertEqual(len(self._assets()), 2)

    def test_explicit_assets_still_replace(self) -> None:
        self.service.save_settings({"projectId": self.project["id"],
                                    "settings": {"assets": {"people": [],
                                                            "scenes": [], "props": []}}})
        self.assertEqual(len(self._assets()), 0)


if __name__ == "__main__":
    unittest.main()
