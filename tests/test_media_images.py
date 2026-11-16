"""图像生成客户端验收：协议、b64/url 两种返回、未配置时的语义。"""

from __future__ import annotations

import base64
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from infra.media.images import ImageConfig, ImageError, endpoint, generate  # noqa: E402

PNG = base64.b64decode(
    b"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")


class FakeTransport:
    def __init__(self, status: int = 200, body: dict | None = None) -> None:
        self.status = status
        self.body = body or {"data": [{"b64_json": base64.b64encode(PNG).decode()}]}
        self.calls: list[dict] = []

    def post_json(self, url, headers, payload, timeout):  # noqa: ANN001
        self.calls.append({"url": url, "headers": headers, "payload": payload})
        return self.status, self.body

    def get_json(self, url, headers, timeout):  # noqa: ANN001
        return 404, {}


class KieTransport:
    """模拟 KIE 异步任务：createTask → recordInfo(waiting…success) → 下载图片。"""

    def __init__(self, states: list[str] | None = None, url: str = "") -> None:
        self.states = states or ["waiting", "generating", "success"]
        self.index = 0
        self.calls: list[dict] = []
        self.image_url = url or "https://img.example/x.png"

    def post_json(self, url, headers, payload, timeout):  # noqa: ANN001
        self.calls.append({"method": "POST", "url": url, "payload": payload})
        return 200, {"code": 200, "msg": "success",
                     "data": {"taskId": "task-1", "recordId": "task-1"}}

    def get_json(self, url, headers, timeout):  # noqa: ANN001
        self.calls.append({"method": "GET", "url": url})
        state = self.states[min(self.index, len(self.states) - 1)]
        self.index += 1
        return 200, {"code": 200, "data": {
            "taskId": "task-1", "state": state,
            "resultJson": json.dumps({"resultUrls": [self.image_url]})}}


class KieGenerateTest(unittest.TestCase):
    def _config(self) -> ImageConfig:
        return ImageConfig(base_url="http://43.130.31.50:18813", api_key="sk-kie-test",
                           model="google/nano-banana", protocol="kie",
                           poll_interval=0.0, poll_timeout=5)

    def test_create_poll_and_download(self) -> None:
        transport = KieTransport()
        with mock.patch("infra.media.images._download", return_value=PNG) as download:
            data = generate(self._config(), "霓虹封面", transport=transport)
        self.assertEqual(data, PNG)
        download.assert_called_once()
        creates = [c for c in transport.calls if c["method"] == "POST"]
        self.assertTrue(creates[0]["url"].endswith("/api/v1/jobs/createTask"))
        self.assertEqual(creates[0]["payload"]["model"], "google/nano-banana")
        self.assertEqual(creates[0]["payload"]["input"]["prompt"], "霓虹封面")
        self.assertGreaterEqual(len([c for c in transport.calls if c["method"] == "GET"]), 3)

    def test_failed_state_raises(self) -> None:
        transport = KieTransport(states=["waiting", "fail"])
        with self.assertRaises(ImageError) as ctx:
            generate(self._config(), "x", transport=transport)
        self.assertEqual(ctx.exception.code, "internal")
        self.assertIn("生成失败", ctx.exception.message)

    def test_poll_timeout(self) -> None:
        config = self._config()
        config.poll_timeout = 0.05
        transport = KieTransport(states=["waiting"])
        with self.assertRaises(ImageError) as ctx:
            generate(config, "x", transport=transport)
        self.assertEqual(ctx.exception.code, "timeout")


class EndpointTest(unittest.TestCase):
    def test_endpoint_variants(self) -> None:
        self.assertEqual(endpoint("https://api.example.com/v1"),
                         "https://api.example.com/v1/images/generations")
        self.assertEqual(endpoint("https://api.example.com"),
                         "https://api.example.com/v1/images/generations")
        self.assertEqual(endpoint("https://api.example.com/v1/images/generations"),
                         "https://api.example.com/v1/images/generations")


class GenerateTest(unittest.TestCase):
    def test_unconfigured_raises(self) -> None:
        with self.assertRaises(ImageError) as ctx:
            generate(ImageConfig(), "一只猫")
        self.assertEqual(ctx.exception.code, "model_unconfigured")

    def test_b64_payload_and_request_shape(self) -> None:
        transport = FakeTransport()
        config = ImageConfig(base_url="https://api.example.com/v1", api_key="sk-test",
                             model="gpt_image_2.5", size="1024x1024")
        data = generate(config, "一只猫", transport=transport)
        self.assertEqual(data, PNG)
        call = transport.calls[0]
        self.assertEqual(call["url"], "https://api.example.com/v1/images/generations")
        self.assertEqual(call["headers"]["Authorization"], "Bearer sk-test")
        self.assertEqual(call["payload"]["model"], "gpt_image_2.5")
        self.assertEqual(call["payload"]["response_format"], "b64_json")

    def test_http_error_maps_to_internal(self) -> None:
        transport = FakeTransport(status=401, body={"error": "bad key"})
        config = ImageConfig(base_url="https://x/v1", model="m")
        with self.assertRaises(ImageError) as ctx:
            generate(config, "p", transport=transport)
        self.assertEqual(ctx.exception.code, "internal")
        self.assertEqual(ctx.exception.status, 401)

    def test_empty_prompt_rejected(self) -> None:
        config = ImageConfig(base_url="https://x/v1", model="m")
        with self.assertRaises(ImageError) as ctx:
            generate(config, "   ", transport=FakeTransport())
        self.assertEqual(ctx.exception.code, "invalid_input")

    def test_config_load_from_file_and_env(self) -> None:
        import json
        import os
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "model-config.json"
            path.write_text(json.dumps({"images": {
                "baseUrl": "https://file.example/v1", "apiKey": "k1",
                "model": "m1"}}), encoding="utf-8")
            os.environ.pop("NANBUDO_IMAGE_BASE_URL", None)
            config = ImageConfig.load(path)
            self.assertEqual(config.base_url, "https://file.example/v1")
            self.assertEqual(config.model, "m1")
            self.assertTrue(config.enabled)

            os.environ["NANBUDO_IMAGE_BASE_URL"] = "https://env.example/v1"
            try:
                overridden = ImageConfig.load(path)
                self.assertEqual(overridden.base_url, "https://env.example/v1")
            finally:
                os.environ.pop("NANBUDO_IMAGE_BASE_URL", None)


if __name__ == "__main__":
    unittest.main()
