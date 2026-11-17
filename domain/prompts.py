"""提示词组装：把原包（旧版 exe）里的规则摘录拼进我们现在的最小提示。

为什么不用原版提示词整段替换：
原包那 107 条是**分阶段流水线**里的片段（有的从句子中间切开），只适合作为
"规则补充"，不适合当完整 system prompt。所以这里的策略是：
  我们的角色/任务描述 + 原版规则摘录（截断）+ 输出约束
"""

from __future__ import annotations

from .prompts_original import PROMPTS, system as original_system

MAX_RULE_CHARS = 600


def compose(bucket: str, *, role: str, task: str, output: str = "",
            index: int = 0, limit: int = MAX_RULE_CHARS) -> str:
    """拼装 system 提示：角色 + 任务 + 原版规则摘录 + 输出约束。"""
    parts = [role.strip(), task.strip()]
    rule = original_system(bucket, index).strip()
    if rule:
        clipped = rule[:limit].rstrip()
        if len(rule) > limit:
            clipped += "…"
        parts.append(f"【原版规则摘录】\n{clipped}")
    if output:
        parts.append(output.strip())
    return "\n\n".join(part for part in parts if part)


def bucket_size(bucket: str) -> int:
    return len(PROMPTS.get(bucket) or [])
