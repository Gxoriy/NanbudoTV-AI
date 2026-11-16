"""S4 本地存储验收：缓存统计、设置读写、清理与状态字段。"""

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
from app.api import storage as storage_api  # noqa: E402
from domain.workspace import DocStore  # noqa: E402


class StorageRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.data = self.root / "data"
        (self.data / "uploads").mkdir(parents=True)
        (self.data / "downloads").mkdir()
        self.store = DocStore(self.data / "workspace.db")
        self.router = Router()
        storage_api.build(self.router, self.store, data_dir=self.data,
                          install_root=self.root)

    def tearDown(self) -> None:
        self.store.close()
        self._tmp.cleanup()

    def call(self, method: str, path: str, body: dict | None = None):
        parsed = urlparse(path)
        raw = json.dumps(body).encode() if body is not None else b""
        headers = {"content-type": "application/json"} if body is not None else {}
        return self.router.dispatch(Request(method=method, path=path,
                                            query=parse_query(parsed.query),
                                            headers=headers, body=raw))

    def test_local_cache_empty_shape(self) -> None:
        body = self.call("GET", "/api/local-cache?scope=downloads").payload
        self.assertTrue(body["ok"])
        self.assertEqual(body["scope"], "downloads")
        for group in ("generated", "downloads", "sources"):
            self.assertEqual(set(body[group]), {"images", "videos", "audio", "other"})
            self.assertEqual(body[group]["images"], {"files": 0, "bytes": 0})
        self.assertEqual(body["totalBytes"], 0)

    def test_local_cache_counts_files_by_type(self) -> None:
        (self.data / "uploads" / "a.png").write_bytes(b"x" * 10)
        (self.data / "uploads" / "b.mp4").write_bytes(b"y" * 20)
        (self.data / "uploads" / "c.txt").write_bytes(b"z" * 5)
        body = self.call("GET", "/api/local-cache").payload
        self.assertEqual(body["sources"]["images"], {"files": 1, "bytes": 10})
        self.assertEqual(body["sources"]["videos"], {"files": 1, "bytes": 20})
        self.assertEqual(body["sources"]["other"], {"files": 1, "bytes": 5})
        self.assertEqual(body["totalBytes"], 35)

    def test_settings_lists_all_features(self) -> None:
        body = self.call("GET", "/api/local-storage/settings").payload
        ids = [item["id"] for item in body["features"]]
        self.assertEqual(ids, ["rewrite", "original", "workflow", "breakdown", "canvas",
                               "prompt_reverse", "characters", "ecommerce", "store",
                               "advertising"])
        self.assertEqual(body["pendingCount"], 0)

    def test_settings_save_persists_absolute_paths(self) -> None:
        target = str(self.root / "D盘" / "Nanbudo")
        resp = self.call("POST", "/api/local-storage/save",
                         {"paths": {"rewrite": target, "bad": "relative/x"}})
        self.assertEqual(resp.payload["saved"], 1)
        self.assertEqual(len(resp.payload["errors"]), 1)

        again = self.call("GET", "/api/local-storage/settings").payload
        row = next(item for item in again["features"] if item["id"] == "rewrite")
        self.assertEqual(row["path"], target)

    def test_storage_status_fields(self) -> None:
        (self.data / "uploads" / "a.png").write_bytes(b"x" * 42)
        body = self.call("GET", "/api/storage/status").payload
        self.assertTrue(body["ok"])
        self.assertEqual(body["uploadBytes"], 42)
        self.assertEqual(body["uploadFileCount"], 1)
        self.assertEqual(body["storagePath"], str(self.data / "uploads"))
        self.assertEqual(body["installPath"], str(self.root))
        self.assertFalse(body["busy"])

    def test_clear_scope_frees_bytes(self) -> None:
        (self.data / "downloads" / "v.mp4").write_bytes(b"v" * 100)
        resp = self.call("POST", "/api/storage/clear", {"scope": "downloads"})
        self.assertEqual(resp.payload["freedBytes"], 100)
        self.assertTrue((self.data / "downloads").exists())
        self.assertEqual(self.call("GET", "/api/storage/status").payload["downloadedSeriesCount"], 0)

    def test_clear_rejects_unknown_scope(self) -> None:
        self.assertEqual(self.call("POST", "/api/storage/clear", {"scope": "system"}).status, 400)


if __name__ == "__main__":
    unittest.main()
