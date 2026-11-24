"""通用文本辅助（LLM）：改写域、质量评分、提示词反推等共用。

与 `domain/visual/assist.py` 的关系：两者都只是 `infra/llm` 的薄封装，
但输出契约不同（视觉要分镜 JSON，这里要文本/评分 JSON），所以各自成型；
后续若要合并，抽一个 `JsonAssist` 基类即可，不影响调用方。
"""

from __future__ import annotations

import json
import pathlib
import re
from typing import Any

from infra import llm


class AssistError(RuntimeError):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def extract_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\s*|```$", "", cleaned, flags=re.M).strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.S)
        if not match:
            raise
        data = json.loads(match.group(0))
    if not isinstance(data, dict):
        raise ValueError("模型返回的不是 JSON 对象")
    return data


class TextAssist:
    """`complete()` 出文本，`json_call()` 出 JSON；两者都带一次"单消息"降级重试。"""

    def __init__(self, profiles_path: str | pathlib.Path | None = None,
                 provider: str = "custom", *, max_tokens: int = 900) -> None:
        self.profiles_path = pathlib.Path(
            profiles_path or pathlib.Path.cwd() / "data" / "llm-profiles.json")
        self.provider_name = provider
        self.max_tokens = max_tokens
        llm.load_builtin()
        self.store = llm.ProfileStore(self.profiles_path)

    def ready(self) -> bool:
        try:
            return bool(self.store.api_key(self.provider_name))
        except KeyError:
            return False

    def _targets(self) -> list[dict[str, str]]:
        effective = self.store.effective(self.provider_name)
        targets = [{
            "baseUrl": str(effective.get("baseUrl") or ""),
            "apiKey": self.store.api_key(self.provider_name),
            "model": str(effective.get("model") or ""),
        }]
        try:
            raw = json.loads(self.profiles_path.read_text(encoding="utf-8"))
            custom = dict(raw.get(self.provider_name) or {})
            fallback = dict(custom.get("fallback") or {})
            if fallback.get("baseUrl") and fallback.get("apiKey") \
                    and fallback.get("model"):
                targets.append({
                    "baseUrl": str(fallback["baseUrl"]),
                    "apiKey": str(fallback["apiKey"]),
                    "model": str(fallback["model"]),
                })
        except (OSError, json.JSONDecodeError):
            pass
        return targets

    def _call(self, messages: list[dict[str, str]], target: dict[str, str]) -> str:
        provider = llm.get(self.provider_name)
        return llm.complete(provider, messages,
                            api_key=target["apiKey"],
                            base_url=target["baseUrl"],
                            model=target["model"],
                            retries=0, max_tokens=self.max_tokens, stream=True)

    @staticmethod
    def _outage(text: str) -> bool:
        value = str(text or "").strip()
        return (not value) or any(phrase in value for phrase in
                                  ("服务暂不可用", "请稍后再试",
                                   "Service Unavailable", "upstream unavailable"))

    def complete(self, system: str, user: str) -> str:
        if not self.ready():
            raise AssistError(503, "model_unconfigured",
                              "LLM 未配置：请在 data/llm-profiles.json 填 "
                              "baseUrl/apiKey/model。")
        last_text = ""
        for target in self._targets():
            try:
                value = self._call([{"role": "system", "content": system},
                                    {"role": "user", "content": user}], target)
            except llm.LLMError:
                continue
            if not self._outage(value):
                return value
            last_text = value
        if last_text:
            raise AssistError(502, "upstream_unavailable",
                              "上游文本模型暂不可用：" + last_text[:120])
        raise AssistError(502, "upstream_unavailable",
                          "所有文本渠道均不可用。")

    def json_call(self, system: str, user: str,
                  attempts: int = 3) -> dict[str, Any]:
        """要 JSON 的调用：解析失败就重问，而不是直接 502。

        与视觉域同一套取舍（见 spec/deep-probe.md P0-5）：中转站经常"答成散文"，
        同一问题重问一次多数能拿到合法 JSON；直接报错等于把抖动当终态。
        """
        last_text = ""
        last_error: Exception | None = None
        for attempt in range(1, max(1, attempts) + 1):
            suffix = "" if attempt == 1 else (
                "\n\n上一次输出不是合法 JSON。这次只返回一个 JSON 对象，"
                "第一个字符必须是 {，不要解释、不要 markdown。")
            last_text = self.complete(system, f"{user}{suffix}")
            try:
                return extract_json(last_text)
            except (json.JSONDecodeError, ValueError) as exc:
                last_error = exc
        raise AssistError(502, "bad_model_output",
                          f"模型连续 {attempts} 次没有返回合法 JSON: "
                          f"{last_text[:200]}") from last_error
