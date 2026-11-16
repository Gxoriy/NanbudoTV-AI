"""D6 采集域验收：下载记录、封面/流、参数校验、浏览器缺失语义。"""

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
from app.api import hall as hall_api  # noqa: E402
from domain.workspace import DocStore  # noqa: E402
from infra.browser import probe as browser_probe  # noqa: E402


class HallRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = DocStore(self.root / "workspace.db", files_root=self.root / "files")
        self.router = Router()
        hall_api.build(self.router, self.store, downloads_root=self.root / "downloads")

    def tearDown(self) -> None:
        self.store.close()
        self._tmp.cleanup()

    def call(self, method: str, path: str, headers: dict[str, str] | None = None):
        parsed = urlparse(path)
        return self.router.dispatch(Request(method=method, path=path,
                                            query=parse_query(parsed.query),
                                            headers={k.lower(): v for k, v in
                                                     (headers or {}).items()},
                                            body=b""))

    def test_downloads_empty_shape(self) -> None:
        body = self.call("GET", "/api/hall/downloads").payload
        self.assertEqual(body, {"ok": True, "records": [],
                                "storagePath": str(self.root / "downloads")})

    def test_downloads_lists_records(self) -> None:
        self.store.create("download", "第1集", {"seriesId": "s1", "episode": 1,
                                                "file": "a.mp4", "status": "done"})
        body = self.call("GET", "/api/hall/downloads").payload
        self.assertEqual(len(body["records"]), 1)
        self.assertEqual(body["records"][0]["seriesId"], "s1")
        self.assertEqual(body["records"][0]["episode"], 1)

    def test_stream_supports_range(self) -> None:
        relative = self.store.save_file("downloads", "v.mp4", b"x" * 200)
        record = self.store.create("download", "第1集", {"file": relative})
        resp = self.call("GET", f"/api/hall/downloads/stream?id={record['id']}",
                         {"range": "bytes=0-49"})
        self.assertEqual(resp.status, 206)
        self.assertEqual(len(resp.raw), 50)
        self.assertIn("Content-Range", resp.headers)

    def test_cover_missing_record_404(self) -> None:
        self.assertEqual(self.call("GET", "/api/hall/downloads/cover?id=nope").status, 404)

    def test_episodes_requires_series_id(self) -> None:
        self.assertEqual(self.call("GET", "/api/hall/episodes").status, 400)
        body = self.call("GET", "/api/hall/episodes?seriesId=s1").payload
        self.assertEqual(body["episodes"], [])

    def test_rank_requires_type(self) -> None:
        self.assertEqual(self.call("GET", "/api/hall/rank").status, 400)
        self.assertEqual(self.call("GET", "/api/hall/rank?type=hot").payload["items"], [])

    def test_link_analyze_returns_structured_result(self) -> None:
        from infra.browser.runner import AnalyzeResult
        router = Router()
        hall_api.build(router, self.store, downloads_root=self.root / "downloads",
                       analyze_runner=lambda url: AnalyzeResult(
                           url=url, title="测试页", cover="https://cdn/x.jpg",
                           videos=["https://cdn/v.mp4"]))
        resp = router.dispatch(Request(method="POST", path="/api/link/analyze",
                                       query={}, headers={"content-type": "application/json"},
                                       body=json.dumps({"url": "https://example.com/a"}).encode()))
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.payload["title"], "测试页")
        self.assertEqual(resp.payload["videos"], ["https://cdn/v.mp4"])

    def test_link_analyze_maps_browser_required(self) -> None:
        from infra.browser.runner import BrowseError
        router = Router()

        def boom(_url: str):
            raise BrowseError("browser_required", "Playwright 未就绪")

        hall_api.build(router, self.store, downloads_root=self.root / "downloads",
                       analyze_runner=boom)
        resp = router.dispatch(Request(method="POST", path="/api/link/analyze",
                                       query={}, headers={"content-type": "application/json"},
                                       body=json.dumps({"url": "https://example.com"}).encode()))
        self.assertEqual(resp.status, 501)
        self.assertEqual(resp.payload["error"], "browser_required")

    def test_link_analyze_requires_url(self) -> None:
        self.assertEqual(self.call("POST", "/api/link/analyze").status, 400)

    def test_browser_routes_report_missing_engine(self) -> None:
        resp = self.call("POST", "/api/watch/open")
        self.assertEqual(resp.status, 501)
        self.assertEqual(resp.payload["error"], "browser_required")
        self.assertIn("Playwright", resp.payload["message"])


class ProbeTest(unittest.TestCase):
    def test_detect_reports_real_install(self) -> None:
        status = browser_probe.detect()
        payload = status.public()
        self.assertIn("root", payload)
        if not Path(payload["root"]).exists():
            self.skipTest("本机未安装 Playwright")
        self.assertIn("hasBrowsers", payload)
        self.assertTrue(payload["hasBrowsers"] or payload["problems"])

    def test_detect_missing_dir_lists_problems(self) -> None:
        status = browser_probe.detect(tmp_missing := Path(tempfile.gettempdir()) / "no-pw-xyz")
        self.assertFalse(status.ready)
        self.assertTrue(status.problems)
        self.assertIn(str(tmp_missing), status.public()["root"])


if __name__ == "__main__":
    unittest.main()
