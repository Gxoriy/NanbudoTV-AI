"""S1 历史记录验收：空库形状、增删改查、保留策略。"""

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
from app.api import history as history_api  # noqa: E402
from domain.workspace import DocStore  # noqa: E402


class HistoryRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = DocStore(self.root / "workspace.db")
        self.router = Router()
        history_api.build(self.router, self.store, outputs_root=self.root / "outputs")

    def tearDown(self) -> None:
        self.store.close()
        self._tmp.cleanup()

    def call(self, method: str, path: str, body: dict | None = None):
        parsed = urlparse(path)
        raw = json.dumps(body).encode() if body is not None else b""
        return self.router.dispatch(Request(
            method=method, path=path, query=parse_query(parsed.query),
            headers={"content-type": "application/json"} if body is not None else {},
            body=raw))

    def test_empty_shape_matches_legacy(self) -> None:
        body = self.call("GET", "/api/history").payload
        self.assertEqual(body, {"ok": True, "records": [],
                                "storagePath": str(self.root / "outputs"),
                                "retentionDays": -1})

    def test_item_delete_rename(self) -> None:
        record = self.store.create("history", "第1集", {"feature": "rewrite",
                                                       "file": "out.mp4"})
        item = self.call("GET", f"/api/history/item?id={record['id']}")
        self.assertEqual(item.payload["record"]["feature"], "rewrite")

        renamed = self.call("POST", "/api/history/rename",
                            {"id": record["id"], "name": "第1集-改"})
        self.assertEqual(renamed.payload["record"]["name"], "第1集-改")

        self.assertEqual(self.call("POST", "/api/history/delete",
                                   {"id": record["id"]}).status, 200)
        self.assertEqual(self.call("GET", "/api/history").payload["records"], [])

    def test_filter_by_feature(self) -> None:
        self.store.create("history", "A", {"feature": "rewrite"})
        self.store.create("history", "B", {"feature": "ecommerce"})
        body = self.call("GET", "/api/history?feature=ecommerce").payload
        self.assertEqual([row["name"] for row in body["records"]], ["B"])

    def test_policy(self) -> None:
        body = self.call("GET", "/api/history/policy").payload
        self.assertEqual(body["retentionDays"], -1)
        self.assertFalse(body["autoClean"])

    def test_missing_record_404(self) -> None:
        self.assertEqual(self.call("GET", "/api/history/item?id=x").status, 404)
        self.assertEqual(self.call("POST", "/api/history/delete", {"id": "x"}).status, 404)
        self.assertEqual(self.call("POST", "/api/history/rename",
                                   {"id": "x", "name": "y"}).status, 404)


if __name__ == "__main__":
    unittest.main()
