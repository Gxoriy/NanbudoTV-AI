"""视觉域的 LLM 辅助：分镜规划、需求归一。

调用链复用 `infra/llm`（provider 注册表 + ProfileStore + 传输层）。
两个针对中转站的工程妥协（实测踩出来的）：

1. 系统提示词保持**短且不含大段 JSON 模板**——某些中转站遇到长中文 + 花括号模板
   会直接断开连接（`RemoteDisconnected`），把结构要求放到用户消息里更稳。
2. 网络层失败时**降级为单条 user 消息**重试一次：合并后请求更短，可绕开断连。
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


SHORT_SYSTEM = "你是短剧创作助手，回答必须是纯 JSON，不要 markdown。"

PLAN_SPEC = (
    '请输出 JSON：{"shots":[{"index":1,"seconds":4,"shot":"画面描述","prompt":"出图提示词"}]}。'
    "只输出 JSON，不要解释。"
)
NORMALIZE_SPEC = (
    '请输出 JSON：{"title":"","genre":"","tone":"","characters":[""],'
    '"conflict":"","hook":""}。只输出 JSON，不要解释。'
)


def _extract_json(text: str) -> dict[str, Any]:
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


class VisualAssist:
    def __init__(self, profiles_path: str | pathlib.Path | None = None,
                 provider: str = "custom") -> None:
        self.profiles_path = pathlib.Path(
            profiles_path or pathlib.Path.cwd() / "data" / "llm-profiles.json")
        self.provider_name = provider
        llm.load_builtin()
        self.store = llm.ProfileStore(self.profiles_path)

    def ready(self) -> bool:
        try:
            return bool(self.store.api_key(self.provider_name))
        except KeyError:
            return False

    def _call(self, messages: list[dict[str, str]]) -> str:
        provider = llm.get(self.provider_name)
        effective = self.store.effective(self.provider_name)
        return llm.complete(provider, messages,
                            api_key=self.store.api_key(self.provider_name),
                            base_url=effective["baseUrl"], model=effective["model"],
                            retries=0, max_tokens=512)

    def complete(self, system: str, user: str) -> str:
        if not self.ready():
            raise AssistError(503, "model_unconfigured",
                              "LLM 未配置：请在 data/llm-profiles.json 填 "
                              "baseUrl/apiKey/model。")
        messages = [{"role": "system", "content": system},
                    {"role": "user", "content": user}]
        try:
            return self._call(messages)
        except llm.LLMError as exc:
            if exc.code != "network":
                status = 503 if exc.code in ("auth", "quota") else 502
                raise AssistError(status, exc.code, f"模型调用失败: {exc}") from exc
        # 降级：合并成单条 user 消息再试一次（短请求更不容易被中转站掐断）
        try:
            return self._call([{"role": "user", "content": f"{system}\n\n{user}"}])
        except llm.LLMError as exc:
            if "Remote end closed" in str(exc):
                # 实测：该中转站对部分中文内容会直接断连（内容过滤），不是网络抖动
                raise AssistError(502, "upstream_closed",
                                  "上游中断连接：该渠道对部分文案会直接断连（内容过滤），"
                                  "请调整措辞或更换渠道。") from exc
            status = 503 if exc.code in ("auth", "quota") else 502
            raise AssistError(status, exc.code, f"模型调用失败（含降级重试）: {exc}") from exc

    def _json_call(self, spec: str, user: str,
                   system: str | None = None) -> dict[str, Any]:
        text = self.complete(system or SHORT_SYSTEM, f"{user}\n\n{spec}")
        try:
            return _extract_json(text)
        except (json.JSONDecodeError, ValueError) as exc:
            raise AssistError(502, "bad_model_output",
                              f"模型输出不是合法 JSON: {text[:200]}") from exc

    def plan(self, requirement: str, *, shots: int = 6,
             system: str | None = None) -> dict[str, Any]:
        """逐镜一次调用再合并。

        实测该中转站在"一次生成较长 JSON"时会直接断连（`RemoteDisconnected`），
        但"短输出"稳定。所以按镜头拆成多次短请求——慢一点，但可用。
        """
        if not requirement.strip():
            raise AssistError(400, "invalid_input", "需求描述不能为空。")
        shots = max(1, min(shots, 12))
        items: list[dict[str, Any]] = []
        for index in range(1, shots + 1):
            spec = (f'只输出 1 个镜头的 JSON，形如 {{"index":{index},"seconds":4,'
                    '"shot":"画面描述","prompt":"出图提示词"}，不要数组、不要解释。')
            data = self._json_call(spec, f"需求：{requirement}\n这是第 {index} 个镜头。",
                                   system=system)
            item = data if "shot" in data else (data.get("shots") or [{}])[0]
            item["index"] = index
            items.append(item)
        return {"ok": True, "shots": items, "count": len(items)}

    def normalize(self, requirement: str) -> dict[str, Any]:
        if not requirement.strip():
            raise AssistError(400, "invalid_input", "需求描述不能为空。")
        data = self._json_call(NORMALIZE_SPEC, f"原始需求：{requirement}")
        return {"ok": True, "normalized": data}
