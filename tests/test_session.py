"""S2 会话验收：状态形状、卡密登录、客户端配置、提交列表。"""

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
from app.api import session as session_api  # noqa: E402
from domain.license import LicenseService, LicenseStore  # noqa: E402
from domain.workspace import DocStore  # noqa: E402

DEVICE = "DW-TEST0-00000-00000-00000-00001"


class SessionRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.license_store = LicenseStore(self.root / "license.db")
        self.license = LicenseService(self.license_store)
        self.store = DocStore(self.root / "workspace.db")
        self.router = Router()
        session_api.build(self.router, self.license, self.store,
                          version="9.9.9-test", install_root=self.root)

    def tearDown(self) -> None:
        self.store.close()
        self.license_store.close()
        self._tmp.cleanup()

    def call(self, method: str, path: str, body: dict | None = None):
        parsed = urlparse(path)
        raw = json.dumps(body).encode() if body is not None else b""
        return self.router.dispatch(Request(
            method=method, path=path, query=parse_query(parsed.query),
            headers={"x-device-code": DEVICE,
                     **({"content-type": "application/json"} if body is not None else {})},
            body=raw))

    def test_status_unlicensed(self) -> None:
        body = self.call("GET", "/api/session/status").payload
        self.assertEqual(body["ok"], True)
        self.assertFalse(body["authenticated"])
        self.assertEqual(body["license"]["status"], "none")
        self.assertEqual(body["deviceCode"], DEVICE)

    def test_login_with_valid_card_authenticates(self) -> None:
        key, _ = self.license_store.issue(days=10)
        resp = self.call("POST", "/api/session/login", {"cardKey": key})
        self.assertEqual(resp.status, 200)
        self.assertTrue(resp.payload["authenticated"])
        self.assertIn("***", resp.payload["cardMask"])

        again = self.call("GET", "/api/session/status").payload
        self.assertTrue(again["authenticated"])
        self.assertEqual(again["license"]["status"], "active")

    def test_login_invalid_card(self) -> None:
        resp = self.call("POST", "/api/session/login",
                         {"cardKey": "DW-AAAAA-BBBBB-CCCCC-DDDDD-EEEEE"})
        self.assertEqual(resp.status, 400)
        # 登录页把 error 直接当文案显示，所以 error 必须是中文，机器码在 code
        self.assertEqual(resp.payload["code"], "invalid_card")
        self.assertIn("卡密", resp.payload["error"])
        self.assertEqual(resp.payload["error"], resp.payload["message"])

    def test_login_without_card_when_unlicensed(self) -> None:
        self.assertEqual(self.call("POST", "/api/session/login", {}).status, 400)

    def test_client_config_shape(self) -> None:
        body = self.call("GET", "/api/client/config").payload
        self.assertTrue(body["ok"])
        self.assertEqual(body["currentVersion"], "9.9.9-test")
        self.assertFalse(body["updateAvailable"])
        self.assertIn("updateNotes", body)

    def test_submission_list_and_create(self) -> None:
        self.assertEqual(self.call("GET", "/api/creation/submission").payload,
                         {"ok": True, "submissions": []})
        created = self.call("POST", "/api/creation/submission/create",
                            {"title": "第1集"})
        self.assertEqual(created.status, 200)
        listed = self.call("GET", "/api/creation/submission").payload["submissions"]
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["name"], "第1集")


if __name__ == "__main__":
    unittest.main()
