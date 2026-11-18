"""价格与授权文案的前端契约（不然按钮会显示"尚无有效价格"、"有效期未知"）。"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.api import Request, Router  # noqa: E402
from app.api import session as session_api  # noqa: E402
from app.api import visual_extra  # noqa: E402
from domain.license import LicenseStore  # noqa: E402
from domain.license.service import LicenseService  # noqa: E402
from domain.visual import VisualService  # noqa: E402
from domain.visual.library import LibraryStore  # noqa: E402
from domain.workspace import DocStore  # noqa: E402

CARD = "DW-PWMB-AXYU-ASP8-C8H8-5X4P-ZSZW-RQ7G-QGTJ"


class PricingContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.license_store = LicenseStore(self.root / "license.db")
        self.license_store.import_card(CARD, days=0, note="pricing")
        self.license = LicenseService(self.license_store)
        self.store = DocStore(self.root / "ws.db", files_root=self.root / "files")
        self.visual = VisualService(styles_path=self.root / "styles.json",
                                    store=__import__("domain.visual.store",
                                                    fromlist=["VisualStore"]).VisualStore(
                                        self.root / "visual.db"),
                                    workspace=self.root / "visual")
        self.library = LibraryStore(self.root / "lib.db", files_root=self.root / "lib")
        self.router = Router()
        session_api.build(self.router, self.license, self.store, version="test",
                          install_root=self.root)
        visual_extra.build(self.router, self.visual, self.library)

    def tearDown(self) -> None:
        self.library.close()
        self.visual.store.close()
        self.store.close()
        self.license_store.close()
        self._tmp.cleanup()

    def get(self, path: str, headers: dict[str, str] | None = None):
        return self.router.dispatch(Request(method="GET", path=path, query={},
                                            headers=headers or {}, body=b""))

    def test_client_config_carries_sample_prices(self) -> None:
        body = self.get("/api/client/config").payload
        self.assertEqual(body["pointsPerCny"], 1.0)
        bindings = body["textButtonBindings"]
        for stage in ("workflow-cut", "workflow-assets", "workflow-storyboard"):
            self.assertIn(stage, bindings)
            # 前端把 price===0 判成"没有价格"，所以示例价必须 > 0
            self.assertGreater(bindings[stage]["price"], 0)
        self.assertTrue(body["textModelPricing"])
        self.assertIn("breakdownModels", body)

    def test_visual_profile_has_pricing_and_models(self) -> None:
        profile = self.get("/api/visual/profile").payload["profile"]
        self.assertTrue(profile["videoPricing"])
        self.assertTrue(profile["imagePricing"])
        self.assertTrue(profile["visualModels"])
        models = {row["model"] for row in profile["videoPricing"]}
        self.assertIn(profile["videoModel"], models)

    def test_points_has_nested_usage_for_balance(self) -> None:
        """前端 renderPointsUsage(data.usage) 取余额，缺了会显示 0.00 → 积分不足。"""
        body = self.get("/api/visual/points").payload
        self.assertIn("usage", body)
        self.assertEqual(body["usage"]["remainingPoints"], body["remainingPoints"])
        self.assertGreater(body["usage"]["remainingPoints"], 0)

    def test_permanent_card_reports_usable_expiry(self) -> None:
        """永久卡要给 2100-01-01 哨兵，前端才显示"长期有效"而不是"有效期未知"。"""
        self.license.activate("device-permanent", CARD)
        status = self.license.status("device-permanent")
        self.assertTrue(status["permanent"])
        self.assertEqual(status["expiresAt"], 4102444800.0)
        self.assertTrue(status["licensed"])

    def test_session_login_updates_status(self) -> None:
        login = self.router.dispatch(Request(
            method="POST", path="/api/session/login", query={},
            headers={"content-type": "application/json",
                     "x-device-code": "device-1"},
            body=json.dumps({"cardKey": CARD}).encode(), ))
        self.assertEqual(login.status, 200)
        status = self.get("/api/session/status",
                          {"x-device-code": "device-1"}).payload
        self.assertTrue(status["authenticated"])
        self.assertEqual(status["license"]["expiresAt"], 4102444800.0)


if __name__ == "__main__":
    unittest.main()
