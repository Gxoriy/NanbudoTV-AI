"""P2-01 / P2-03 验收测试：选区契约、记录存储、免费报价、云端提交。

口径已按 ADR-008 改为"计费归零"：
  - capabilities 不再与旧版逐字段相等（pricingMode 由 fixed_per_second 改 free），
    但必须保留旧键，并显式给出 prices=0
  - quote 不再受"未配置"限制：免费功能不需要价格与密钥
  - submit 才要求云端地址
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.api import Request, Router, parse_query  # noqa: E402
from app.api import subtitle as subtitle_api  # noqa: E402
from domain.subtitle import SubtitleService, SubtitleStore, region as R  # noqa: E402
from domain.subtitle.service import SubtitleError  # noqa: E402
from infra.cloud import CloudClient  # noqa: E402
from infra.tasks import TaskStore  # noqa: E402

BASELINE = json.loads(
    (ROOT / "spec" / "api-samples" / "api_subtitle_capabilities.json")
    .read_text(encoding="utf-8"))["body"]
AREA = {"x": 0, "y": 80, "width": 100, "height": 20}


class RegionTest(unittest.TestCase):
    def test_outward_rounds_to_integer_grid(self) -> None:
        # x=10.2→10, 右=40.5→41（宽 31）；y=5.7→5, 下=14.8→15（高 10）
        self.assertEqual(R.outward({"x": 10.2, "y": 5.7, "width": 30.3, "height": 9.1}),
                         {"x": 10, "y": 5, "width": 31, "height": 10})

    def test_decimal_boundary_not_rejected_by_float_error(self) -> None:
        self.assertEqual(R.outward({"x": 0.1, "y": 0, "width": 99.9, "height": 10}),
                         {"x": 0, "y": 0, "width": 100, "height": 10})

    def test_overflow_rejected_with_frontend_message(self) -> None:
        with self.assertRaises(R.RegionError) as ctx:
            R.outward({"x": 90, "y": 0, "width": 20, "height": 10})
        self.assertEqual(str(ctx.exception), R.MSG_OVERFLOW)

    def test_missing_key_rejected(self) -> None:
        with self.assertRaises(R.RegionError) as ctx:
            R.outward({"x": 1, "y": 2, "width": 3})
        self.assertEqual(str(ctx.exception), R.MSG_INVALID)

    def test_zero_width_rejected(self) -> None:
        with self.assertRaises(R.RegionError):
            R.outward({"x": 1, "y": 2, "width": 0, "height": 3})

    def test_canonical_and_require(self) -> None:
        self.assertTrue(R.canonical({"x": 10, "y": 5, "width": 31, "height": 12}))
        self.assertFalse(R.canonical({"x": 10.2, "y": 5, "width": 30, "height": 12}))
        with self.assertRaises(R.RegionError) as ctx:
            R.require_canonical({"x": 10.2, "y": 5, "width": 30, "height": 12})
        self.assertEqual(str(ctx.exception), R.MSG_NOT_CANONICAL)


class StoreTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = SubtitleStore(self.root / "subtitle.db")

    def tearDown(self) -> None:
        self.store.close()
        self._tmp.cleanup()

    def test_create_defaults_to_ready(self) -> None:
        rec = self.store.create("第 1 集", metadata={"duration": 12.5}, size=1024,
                                source_file="a.mp4")
        self.assertEqual(rec.phase, "ready")
        self.assertEqual(self.store.get(rec.id).metadata["duration"], 12.5)

    def test_update_rejects_unknown_phase(self) -> None:
        rec = self.store.create("x")
        with self.assertRaises(ValueError):
            self.store.update(rec.id, phase="不存在的阶段")

    def test_append_history_and_brief(self) -> None:
        rec = self.store.create("x")
        self.store.append_history(rec.id, {"file": "out.mp4", "processingMode": "local"})
        self.assertEqual(len(self.store.get(rec.id).history), 1)
        brief = self.store.brief()
        self.assertEqual(brief[0]["id"], rec.id)
        self.assertNotIn("metadata", brief[0])

    def test_public_contract_uses_camel_case_and_percent(self) -> None:
        rec = self.store.create("x", size=100)
        self.store.update(rec.id, progress=0.42)
        pub = self.store.get(rec.id).public()
        self.assertEqual(pub["progress"], 42.0)
        self.assertIn("sourceFile", pub)
        self.assertIn("processingMode", pub)


class ServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.store = SubtitleStore(self.root / "subtitle.db")
        self.tasks = TaskStore(self.root / "state.db")
        self.config = self.root / "subtitle-config.json"
        self.service = SubtitleService(self.store, self.config,
                                       storage_root=self.root / "subtitle",
                                       task_store=self.tasks)

    def tearDown(self) -> None:
        self.tasks.close()
        self.store.close()
        self._tmp.cleanup()

    def _configure_cloud(self, base_url: str = "https://horiy.fun") -> None:
        self.config.write_text(json.dumps({"baseUrl": base_url, "token": "t"},
                                          ensure_ascii=False), encoding="utf-8")
        self.service.reload_config()

    def test_capabilities_keeps_legacy_keys_and_is_free(self) -> None:
        caps = self.service.capabilities()
        self.assertTrue(set(BASELINE) <= set(caps))          # 旧键一个不少
        self.assertEqual(caps["pricingMode"], "free")
        self.assertEqual(caps["prices"], {"standard": 0.0, "fine": 0.0})
        self.assertFalse(caps["configured"])
        self.assertIn("云端去字幕服务尚未配置", caps["message"])
        self.assertTrue(caps["localRepair"][0] in (True, False))

    def test_capabilities_configured_hides_message(self) -> None:
        self._configure_cloud()
        caps = self.service.capabilities()
        self.assertTrue(caps["configured"])
        self.assertEqual(caps["message"], "")

    def test_quote_is_free_and_needs_no_config(self) -> None:
        rec = self.store.create("x", metadata={"duration": 12})
        quoted = self.service.quote(rec.id, AREA, "fine")
        self.assertEqual(quoted.phase, "quoted")
        self.assertEqual(quoted.quote["estimatedPoints"], 0.0)
        self.assertEqual(quoted.quote["unitPrice"], 0.0)
        self.assertEqual(quoted.quote["pricingMode"], "free")

    def test_quote_requires_canonical_region(self) -> None:
        rec = self.store.create("x", metadata={"duration": 10})
        with self.assertRaises(R.RegionError):
            self.service.quote(rec.id, {"x": 1.5, "y": 0, "width": 10, "height": 10},
                               "standard")

    def test_submit_requires_cloud_config(self) -> None:
        rec = self.store.create("x", metadata={"duration": 12}, source_file="sources/a.mp4")
        quoted = self.service.quote(rec.id, AREA, "standard")
        with self.assertRaises(SubtitleError) as ctx:
            self.service.submit(rec.id, AREA, "standard", quoted.quote["quoteId"], True)
        self.assertEqual(ctx.exception.code, "cloud_unconfigured")

    def test_submit_rejects_stale_quote(self) -> None:
        self._configure_cloud()
        rec = self.store.create("x", metadata={"duration": 12}, source_file="sources/a.mp4")
        self.service.quote(rec.id, AREA, "fine")
        with self.assertRaises(SubtitleError) as ctx:
            self.service.submit(rec.id, {"x": 0, "y": 70, "width": 100, "height": 20},
                                "fine", "wrong-id", True)
        self.assertEqual(ctx.exception.code, "quote_stale")

    def test_submit_writes_cloud_result_without_charge(self) -> None:
        class FakeCloud(CloudClient):
            def remove_subtitle(self, source, region, quality):  # noqa: ANN001
                return b"CLOUD-BYTES"

        self.service.cloud = FakeCloud("https://example.invalid")
        rec = self.store.create("x", metadata={"duration": 12}, source_file="sources/a.mp4")
        (self.root / "subtitle" / "sources").mkdir(parents=True, exist_ok=True)
        (self.root / "subtitle" / "sources" / "a.mp4").write_bytes(b"src")
        quoted = self.service.quote(rec.id, AREA, "standard")
        result = self.service.submit(rec.id, AREA, "standard", quoted.quote["quoteId"],
                                     True, background=False)
        self.assertEqual(result.phase, "done")
        self.assertEqual(result.quote["estimatedPoints"], 0.0)
        self.assertTrue((self.root / "subtitle" / result.result_file).is_file())


class RouteTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.store = SubtitleStore(root / "subtitle.db")
        self.service = SubtitleService(self.store, root / "subtitle-config.json",
                                       storage_root=root / "subtitle")
        self.router = Router()
        subtitle_api.build(self.router, self.service)

    def tearDown(self) -> None:
        self.store.close()
        self._tmp.cleanup()

    def _req(self, method: str, path: str, body: bytes = b"") -> Request:
        from urllib.parse import urlparse
        parsed = urlparse(path)
        return Request(method=method, path=path, query=parse_query(parsed.query),
                       headers={}, body=body)

    def test_capabilities_route(self) -> None:
        resp = self.router.dispatch(self._req("GET", "/api/subtitle/capabilities"))
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.payload["pricingMode"], "free")

    def test_list_and_projects_empty_shape(self) -> None:
        self.assertEqual(self.router.dispatch(self._req("GET", "/api/subtitle/list")).payload,
                         {"records": []})
        self.assertEqual(self.router.dispatch(self._req("GET", "/api/subtitle/projects")).payload,
                         {"projects": []})

    def test_record_not_found(self) -> None:
        resp = self.router.dispatch(self._req("GET", "/api/subtitle/record?id=nope"))
        self.assertEqual(resp.status, 404)
        self.assertEqual(resp.payload["error"], "not_found")

    def test_quote_route_is_free(self) -> None:
        rec = self.store.create("x", metadata={"duration": 5})
        body = json.dumps({"id": rec.id, "quality": "standard", "region": AREA}).encode()
        resp = self.router.dispatch(self._req("POST", "/api/subtitle/quote", body))
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.payload["record"]["quote"]["estimatedPoints"], 0.0)

    def test_submit_route_reports_cloud_unconfigured(self) -> None:
        rec = self.store.create("x", metadata={"duration": 5}, source_file="sources/a.mp4")
        quoted = self.service.quote(rec.id, AREA, "standard")
        body = json.dumps({"id": rec.id, "quality": "standard", "region": AREA,
                           "quoteId": quoted.quote["quoteId"],
                           "confirmed": True}).encode()
        resp = self.router.dispatch(self._req("POST", "/api/subtitle/submit", body))
        self.assertEqual(resp.status, 409)
        self.assertEqual(resp.payload["error"], "cloud_unconfigured")

    def test_unimplemented_subtitle_route_still_501(self) -> None:
        # existing/import-existing 仍未迁移（依赖旧项目库结构）
        resp = self.router.dispatch(self._req("POST", "/api/subtitle/existing"))
        self.assertEqual(resp.status, 501)
        self.assertEqual(resp.payload["error"], "not_migrated")


if __name__ == "__main__":
    unittest.main()
