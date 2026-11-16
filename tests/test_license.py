"""授权域验收：卡密签发/激活/状态形状/过期/吊销。

状态响应必须保留旧版全部键（`spec/api-samples/api_license_status.json`），
因为 login.js 与 app.js 直接读 `licensed`、`featureStatus`、`daysRemaining`。
"""

from __future__ import annotations

import json
import re
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from domain.license import LicenseError, LicenseService, LicenseStore, device_from, mask_card  # noqa: E402

LEGACY_KEYS = set(json.loads(
    (ROOT / "spec" / "api-samples" / "api_license_status.json")
    .read_text(encoding="utf-8"))["body"])


class LicenseTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.store = LicenseStore(Path(self._tmp.name) / "license.db")
        self.service = LicenseService(self.store)
        self.device = "DW-C4E39-4F2E2-7F3F7-E990A-21289"

    def tearDown(self) -> None:
        self.store.close()
        self._tmp.cleanup()

    def test_unlicensed_status_keeps_legacy_keys(self) -> None:
        body = self.service.status(self.device)
        self.assertTrue(LEGACY_KEYS <= set(body))
        self.assertFalse(body["licensed"])
        self.assertEqual(body["status"], "none")
        self.assertEqual(body["points"], 0.0)
        self.assertEqual(set(body["featureStatus"]),
                         {"rewrite", "original", "workflow", "ecommerce", "store",
                          "advertising"})

    def test_issue_and_activate(self) -> None:
        key, meta = self.store.issue(days=30, note="单测")
        self.assertTrue(key.startswith("DW-"))
        self.assertEqual(len(key.split("-")), 6)          # DW + 5 段
        body = self.service.activate(self.device, key)
        self.assertTrue(body["licensed"])
        self.assertEqual(body["status"], "active")
        self.assertEqual(body["featureStatus"]["rewrite"]["state"], "active")
        self.assertEqual(body["featureStatus"]["ecommerce"]["state"], "locked")
        self.assertGreaterEqual(body["daysRemaining"], 29)
        self.assertEqual(body["cardMask"], mask_card(key))
        self.assertIn("***", body["cardMask"])
        self.assertEqual(meta["days"], 30)

    def test_invalid_card_rejected(self) -> None:
        with self.assertRaises(LicenseError) as ctx:
            self.service.activate(self.device, "DW-AAAAA-BBBBB-CCCCC-DDDDD-EEEEE")
        self.assertEqual(ctx.exception.code, "invalid_card")

    def test_revoked_card_rejected(self) -> None:
        key, _ = self.store.issue(days=7)
        self.assertTrue(self.store.revoke(key))
        with self.assertRaises(LicenseError) as ctx:
            self.service.activate(self.device, key)
        self.assertEqual(ctx.exception.code, "revoked")

    def test_permanent_card(self) -> None:
        key, _ = self.store.issue(days=0)
        body = self.service.activate(self.device, key)
        self.assertTrue(body["permanent"])
        self.assertIsNone(body["expiresAt"])
        self.assertIn("永久授权", body["message"])

    def test_expired_activation_locks_features(self) -> None:
        key, _ = self.store.issue(days=1)
        self.service.activate(self.device, key)
        old = time.time() - 5 * 86400
        self.store._conn.execute("UPDATE activations SET activated_at=?", (old,))
        body = self.service.status(self.device)
        self.assertFalse(body["licensed"])
        self.assertEqual(body["status"], "expired")
        self.assertEqual(body["featureStatus"]["rewrite"]["state"], "locked")

    def test_status_after_reactivation(self) -> None:
        first, _ = self.store.issue(days=5)
        self.service.activate(self.device, first)
        second, _ = self.store.issue(days=60)
        body = self.service.activate(self.device, second)
        self.assertEqual(body["status"], "active")
        self.assertGreaterEqual(body["daysRemaining"], 59)

    def test_mask_and_device_format(self) -> None:
        self.assertEqual(mask_card("DW-V9PG-X2VW-3SPM-84M3-BR3E-L8VL-Z56L-96VK"),
                         "DW-V9PG***-96VK")
        self.assertRegex(device_from("1.2.3.4|ua"),
                         r"^DW-[0-9A-F]{5}(-[0-9A-F]{5}){4}$")

    def test_normalized_input_accepts_lowercase_and_spaces(self) -> None:
        key, _ = self.store.issue(days=3)
        sloppy = key.lower().replace("-", " ")
        body = self.service.activate(self.device, sloppy)
        self.assertTrue(body["licensed"])


if __name__ == "__main__":
    unittest.main()
