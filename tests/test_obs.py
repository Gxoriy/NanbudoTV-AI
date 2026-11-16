"""P1-06 验收测试：日志脱敏（密钥/卡密不外泄）+ 子模块健康位。"""

from __future__ import annotations

import io
import logging
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from infra.obs import HealthRegistry, RedactionFilter, mask_value, scrub, scrub_obj  # noqa: E402

CARD = "DW-V9PG-X2VW-3SPM-84M3-BR3E-L8VL-Z56L-96VK"


class ScrubTest(unittest.TestCase):
    def test_bearer_and_sk_key(self) -> None:
        text = "Authorization: Bearer abcdefghijklmnop apiKey=sk-1234567890abcdef"
        out = scrub(text)
        self.assertNotIn("abcdefghijklmnop", out)
        self.assertNotIn("1234567890abcdef", out)

    def test_card_key_masked(self) -> None:
        out = scrub(f"激活成功 card={CARD}")
        self.assertNotIn("X2VW-3SPM-84M3", out)

    def test_hash_like_secret_masked(self) -> None:
        out = scrub("fingerprint " + "a1b2c3d4" * 8)
        self.assertIn("hex:***", out)

    def test_scrub_obj_masks_by_key_name(self) -> None:
        payload = {"provider": "qwen", "apiKey": "sk-abcdefghijklmnop",
                   "nested": {"token": "tok-0123456789"}, "list": [{"secret": "s3cr3tvalue"}]}
        out = scrub_obj(payload)
        self.assertEqual(out["apiKey"], "***mnop")
        self.assertNotIn("tok-0123456789", str(out))
        self.assertNotIn("s3cr3tvalue", str(out))

    def test_mask_value_edge(self) -> None:
        self.assertEqual(mask_value(""), "")
        self.assertEqual(mask_value("short"), "*****")


class LoggingFilterTest(unittest.TestCase):
    def test_filter_removes_secret_from_record(self) -> None:
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        handler.addFilter(RedactionFilter())
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger = logging.getLogger("test.redact")
        logger.handlers = [handler]
        logger.propagate = False
        logger.setLevel(logging.INFO)

        logger.info("调用失败 key=%s card=%s", "sk-abcdefghijklmnop", CARD)
        output = stream.getvalue()
        self.assertIn("调用失败", output)
        self.assertNotIn("abcdefghijklmnop", output)
        self.assertNotIn("3SPM-84M3", output)


class HealthTest(unittest.TestCase):
    def test_all_ok(self) -> None:
        reg = HealthRegistry()
        reg.register("db", lambda: (True, "ok"), critical=True)
        reg.register("llm", lambda: (True, "3 家"))
        snap = reg.snapshot()
        self.assertTrue(snap["ok"])
        self.assertEqual(snap["status"], "ok")
        self.assertIn("latencyMs", snap["components"]["db"])

    def test_non_critical_failure_degrades(self) -> None:
        reg = HealthRegistry()
        reg.register("db", lambda: (True, "ok"), critical=True)
        reg.register("llm", lambda: (False, "未配置"))
        snap = reg.snapshot()
        self.assertFalse(snap["ok"])
        self.assertEqual(snap["status"], "degraded")

    def test_critical_failure_is_fail(self) -> None:
        reg = HealthRegistry()
        reg.register("db", lambda: (False, "磁盘只读"), critical=True)
        snap = reg.snapshot()
        self.assertEqual(snap["status"], "fail")

    def test_probe_exception_is_captured(self) -> None:
        def boom() -> tuple[bool, str]:
            raise RuntimeError("炸了")

        reg = HealthRegistry()
        reg.register("x", boom)
        snap = reg.snapshot()
        self.assertFalse(snap["components"]["x"]["ok"])
        self.assertIn("炸了", snap["components"]["x"]["detail"])


if __name__ == "__main__":
    unittest.main()
