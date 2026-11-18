"""图像生成的备用网关：KIE 报账号池空时要自动切到 aihub 网关。"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from infra.media import images  # noqa: E402


class FakeTransport:
    """按 URL 前缀决定返回：KIE 一律 503 账号池空，备用网关正常。"""

    def __init__(self) -> None:
        self.calls: list[str] = []

    def post_json(self, url, headers, payload, timeout):  # noqa: ANN001, ARG002
        self.calls.append(url)
        if "18813" in url:
            return 503, {"code": 503, "msg": "no available account"}
        if url.endswith("/v1/media/generate"):
            return 200, {"code": 200, "data": {"task_id": 12345}}
        return 200, {"code": 200, "data": {"state": "running"}}

    def get_json(self, url, headers, timeout):  # noqa: ANN001, ARG002
        self.calls.append(url)
        return 200, {"code": 200, "data": {"is_final": True, "state": "success",
                                           "result_url": "https://cdn.example/a.jpg"}}


class ImageFallbackTest(unittest.TestCase):
    def _config(self, **overrides):
        config = images.ImageConfig(
            base_url="http://43.130.31.50:18813", api_key="k1",
            model="google/nano-banana", protocol="kie",
            fallback_base_url="https://api.lk888.ai", fallback_api_key="k2",
            fallback_model="banana-pro", poll_interval=0.01, poll_timeout=5)
        for key, value in overrides.items():
            setattr(config, key, value)
        return config

    def test_falls_back_when_pool_empty(self) -> None:
        transport = FakeTransport()
        with mock.patch.object(images, "_download", return_value=b"\xff\xd8JFIF") as dl:
            data = images.generate(self._config(), "雨夜街道", transport=transport)
        self.assertEqual(data, b"\xff\xd8JFIF")
        self.assertTrue(any("18813" in url for url in transport.calls))     # 先试了主网关
        self.assertTrue(any("v1/media/generate" in url for url in transport.calls))
        self.assertEqual(dl.call_args.args[0], "https://cdn.example/a.jpg")

    def test_no_fallback_raises_original_error(self) -> None:
        transport = FakeTransport()
        config = self._config(fallback_base_url="", fallback_model="")
        with self.assertRaises(images.ImageError) as ctx:
            images.generate(config, "雨夜街道", transport=transport)
        self.assertIn("no available account", str(ctx.exception))

    def test_invalid_input_does_not_fall_back(self) -> None:
        """参数错误（提示词为空）不该触发备用网关，否则会掩盖真问题。"""
        transport = FakeTransport()
        with self.assertRaises(images.ImageError):
            images.generate(self._config(), "   ", transport=transport)
        self.assertFalse(any("v1/media/generate" in url for url in transport.calls))

    def test_aihub_protocol_direct(self) -> None:
        transport = FakeTransport()
        config = self._config(protocol="aihub", base_url="https://api.lk888.ai",
                              api_key="k2", model="banana-pro")
        with mock.patch.object(images, "_download", return_value=b"IMG"):
            self.assertEqual(images.generate(config, "海边", transport=transport), b"IMG")


if __name__ == "__main__":
    unittest.main()
