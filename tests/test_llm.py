"""P1-03 验收测试：provider 注册表、双协议适配、错误分类、密钥掩码。

验收口径：
  - 新增第 4 家 provider 只加一个文件（这里用运行时 register 模拟）
  - 调用方不感知协议差异（responses / chat_completions 同一入口）
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from infra.llm import (  # noqa: E402
    Provider, ProfileStore, build_payload, complete, extract_text, get,
    load_builtin, mask_key, register,
)
from infra.llm.base import LLMError  # noqa: E402
from infra.llm.transport import HttpResult  # noqa: E402


class FakeTransport:
    def __init__(self, *results: HttpResult) -> None:
        self.results = list(results)
        self.calls: list[dict] = []

    def post_json(self, url, headers, payload, timeout):  # noqa: ANN001
        self.calls.append({"url": url, "headers": headers, "payload": payload})
        return self.results.pop(0) if len(self.results) > 1 else self.results[0]


class RegistryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        load_builtin()

    def test_builtin_three_providers(self) -> None:
        names = {p.name for p in (get("qwen"), get("doubao"), get("custom"))}
        self.assertEqual(names, {"qwen", "doubao", "custom"})
        self.assertEqual(get("doubao").protocol, "responses")
        self.assertEqual(get("qwen").protocol, "chat_completions")

    def test_add_fourth_provider_by_registration(self) -> None:
        register(Provider(name="unit-test-llm", label="测试家",
                          base_url="https://example.invalid/v1", model="m",
                          protocol="chat_completions"), replace=True)
        self.assertEqual(get("unit-test-llm").model, "m")

    def test_unknown_provider_raises(self) -> None:
        with self.assertRaises(KeyError):
            get("nope")


class ProtocolTest(unittest.TestCase):
    def test_chat_payload(self) -> None:
        payload = build_payload("chat_completions", "qwen3.6-flash",
                                [{"role": "user", "content": "hi"}], temperature=0.2)
        self.assertEqual(payload["messages"], [{"role": "user", "content": "hi"}])
        self.assertEqual(payload["temperature"], 0.2)

    def test_responses_payload(self) -> None:
        payload = build_payload("responses", "doubao-x",
                                [{"role": "system", "content": "s"},
                                 {"role": "user", "content": "u"}])
        self.assertEqual(len(payload["input"]), 2)
        self.assertEqual(payload["input"][1]["content"][0]["type"], "input_text")
        self.assertEqual(payload["input"][1]["content"][0]["text"], "u")

    def test_extract_chat(self) -> None:
        body = {"choices": [{"message": {"content": "答案"}}]}
        self.assertEqual(extract_text("chat_completions", body), "答案")

    def test_extract_responses(self) -> None:
        body = {"output": [{"content": [{"type": "output_text", "text": "a"},
                                        {"type": "output_text", "text": "b"}]}]}
        self.assertEqual(extract_text("responses", body), "ab")

    def test_extract_bad_shape_raises(self) -> None:
        with self.assertRaises(LLMError):
            extract_text("chat_completions", {"choices": []})


class CompleteTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        load_builtin()

    def test_complete_uses_protocol_endpoint_and_bearer(self) -> None:
        transport = FakeTransport(HttpResult(200, {"choices": [{"message": {"content": "ok"}}]}))
        text = complete(get("qwen"), [{"role": "user", "content": "hi"}],
                        api_key="sk-test", transport=transport)
        self.assertEqual(text, "ok")
        call = transport.calls[0]
        self.assertTrue(call["url"].endswith("/chat/completions"))
        self.assertEqual(call["headers"]["Authorization"], "Bearer sk-test")

    def test_retry_on_429_then_success(self) -> None:
        transport = FakeTransport(
            HttpResult(429, {"error": "rate limited"}),
            HttpResult(200, {"choices": [{"message": {"content": "终于好了"}}]}),
        )
        text = complete(get("qwen"), [{"role": "user", "content": "hi"}],
                        api_key="sk", transport=transport, retries=1)
        self.assertEqual(text, "终于好了")
        self.assertEqual(len(transport.calls), 2)

    def test_auth_error_not_retried(self) -> None:
        transport = FakeTransport(HttpResult(401, {"error": "bad key"}))
        with self.assertRaises(LLMError) as ctx:
            complete(get("qwen"), [{"role": "user", "content": "hi"}],
                     api_key="sk", transport=transport, retries=3)
        self.assertEqual(ctx.exception.code, "auth")
        self.assertEqual(len(transport.calls), 1)

    def test_missing_key_raises_auth(self) -> None:
        with self.assertRaises(LLMError) as ctx:
            complete(get("qwen"), [{"role": "user", "content": "hi"}], api_key="")
        self.assertEqual(ctx.exception.code, "auth")

    def test_custom_without_base_url_rejected(self) -> None:
        with self.assertRaises(LLMError) as ctx:
            complete(get("custom"), [{"role": "user", "content": "hi"}],
                     api_key="sk", transport=FakeTransport())
        self.assertEqual(ctx.exception.code, "invalid_input")


class ProfileStoreTest(unittest.TestCase):
    def setUp(self) -> None:
        load_builtin()
        self._tmp = tempfile.TemporaryDirectory()
        self.store = ProfileStore(Path(self._tmp.name) / "llm-profiles.json")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_save_persists_and_masks(self) -> None:
        self.store.save("qwen", api_key="sk-1234567890abcdef", model="qwen-max")
        view = self.store.public_view()["qwen"]
        self.assertTrue(view["saved"])
        self.assertEqual(view["model"], "qwen-max")
        self.assertNotIn("1234567890", view["apiKeyMasked"])
        self.assertEqual(view["apiKeyMasked"], "sk-1******cdef")

        reopened = ProfileStore(self.store.path)
        self.assertEqual(reopened.effective("qwen")["model"], "qwen-max")

    def test_override_base_url_wins(self) -> None:
        self.store.save("custom", base_url="https://proxy.example/v1", model="m1",
                        api_key="k")
        eff = self.store.effective("custom")
        self.assertEqual(eff["baseUrl"], "https://proxy.example/v1")
        self.assertEqual(eff["model"], "m1")

    def test_mask_key_edge_cases(self) -> None:
        self.assertEqual(mask_key(""), "")
        self.assertEqual(mask_key("short"), "*****")
        self.assertEqual(mask_key("abcdefghijklmnop"), "abcd******mnop")


if __name__ == "__main__":
    unittest.main()
