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
                   system: str | None = None,
                   attempts: int = 3) -> dict[str, Any]:
        """要 JSON 的调用：解析失败**重问**，不是直接 502。

        实测这个渠道经常"答得像散文"（`bad_model_output` 一度是最高频错误），
        但同一问题重问一次多数能拿到合法 JSON——原版 `core.validator` 的
        `_accept_*` 系列就是干这件事。这里做三件递进的事：
          1. 原样重问（温度低，措辞不变）
          2. 第二次把 spec 压到最短，并明确"只返回 {...}，不要任何解释"
          3. 仍失败才抛 502，并把最后一次输出带出来便于排查
        """
        last_text = ""
        last_error: Exception | None = None
        for attempt in range(1, max(1, attempts) + 1):
            suffix = "" if attempt == 1 else (
                "\n\n上一次输出不是合法 JSON。这次只返回一个 JSON 对象，"
                "第一个字符必须是 {，不要解释、不要 markdown 代码块。")
            last_text = self.complete(system or SHORT_SYSTEM, f"{user}\n\n{spec}{suffix}")
            try:
                return _extract_json(last_text)
            except (json.JSONDecodeError, ValueError) as exc:
                last_error = exc
                continue
        raise AssistError(502, "bad_model_output",
                          f"模型连续 {attempts} 次没有返回合法 JSON: {last_text[:200]}"
                          ) from last_error

    def _one_shot(self, requirement: str, index: int,
                  system: str | None) -> dict[str, Any]:
        spec = (f'只输出 1 个镜头的 JSON，形如 {{"index":{index},"seconds":4,'
                '"shot":"画面描述","prompt":"出图提示词"}，不要数组、不要解释。')
        data = self._json_call(spec, f"需求：{requirement}\n这是第 {index} 个镜头。",
                               system=system)
        item = data if "shot" in data else (data.get("shots") or [{}])[0]
        item["index"] = index
        return item

    def plan(self, requirement: str, *, shots: int = 6,
             system: str | None = None,
             concurrency: int = 2) -> dict[str, Any]:
        """逐镜一次调用再合并（默认 3 路并发，保序）。

        为什么要并发：中转站在"一次生成较长 JSON"时会断连（`RemoteDisconnected`），
        短输出才稳定，所以只能拆成多次短请求；串行时镜数一多就线性变慢
        （实测 2 镜 13s、6 镜 ≈ 40s）。原版 `core.parallel_shots209` 就是干这件事。

        为什么要限流：并发太高会撞渠道限速，失败率反而上升；默认 3，
        失败时把该镜降级为串行重试一次，再失败才抛错——不因为一个镜头拖垮整批。
        """
        if not requirement.strip():
            raise AssistError(400, "invalid_input", "需求描述不能为空。")
        shots = max(1, min(shots, 12))
        workers = max(1, min(concurrency, 4))
        if shots == 1 or workers == 1:
            items = [self._one_shot(requirement, index, system)
                     for index in range(1, shots + 1)]
            return {"ok": True, "shots": items, "count": len(items),
                    "concurrency": 1}

        from concurrent.futures import ThreadPoolExecutor  # noqa: PLC0415

        results: dict[int, dict[str, Any]] = {}
        failures: dict[int, Exception] = {}
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(self._one_shot, requirement, index, system): index
                for index in range(1, shots + 1)
            }
            for future, index in futures.items():
                try:
                    results[index] = future.result()
                except Exception as exc:  # noqa: BLE001
                    failures[index] = exc

        # 失败镜头串行重试一次：并发失败常常只是撞限速，串行基本能过
        for index, error in sorted(failures.items()):
            try:
                results[index] = self._one_shot(requirement, index, system)
            except Exception:  # noqa: BLE001
                raise error

        items = [results[index] for index in sorted(results)]
        return {"ok": True, "shots": items, "count": len(items),
                "concurrency": workers, "retried": sorted(failures)}

    def normalize(self, requirement: str) -> dict[str, Any]:
        if not requirement.strip():
            raise AssistError(400, "invalid_input", "需求描述不能为空。")
        data = self._json_call(NORMALIZE_SPEC, f"原始需求：{requirement}")
        return {"ok": True, "normalized": data}
