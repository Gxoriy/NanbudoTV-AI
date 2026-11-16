"""任务状态机的数据模型与合法性约束（P1-02）。

状态词汇对齐旧契约（实测自 static/*.js）：
  前端以 `['done','error','failed','canceled','cancelled'].includes(state)` 判定终态，
  并把 `progress` 当 0~100 百分比渲染。因此内部状态必须是 `done`/`error`（不是
  succeeded/failed），序列化时 progress 要 ×100——否则前端会认为任务永不结束而无限轮询。

迁移白名单制：任何不在表中出现的迁移都抛异常，避免"成功后退回运行中"这类脏数据。
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field, asdict
from typing import Any

QUEUED = "queued"
RUNNING = "running"
DONE = "done"
ERROR = "error"
CANCELED = "canceled"
# 进程重启后的专用状态：对前端呈现为 error（终态，停止轮询），但带 resumable 标记
INTERRUPTED = "interrupted"

ALL_STATES = (QUEUED, RUNNING, DONE, ERROR, CANCELED, INTERRUPTED)
TERMINAL_STATES = (DONE, ERROR, CANCELED)

# 允许的迁移：from -> {to}
TRANSITIONS: dict[str, set[str]] = {
    QUEUED: {RUNNING, CANCELED, INTERRUPTED},
    RUNNING: {DONE, ERROR, CANCELED, INTERRUPTED},
    # 中断只允许回到运行中（续跑），不允许直接跳到成功，避免掩盖数据缺失
    INTERRUPTED: {RUNNING, CANCELED, ERROR},
    DONE: set(),
    ERROR: {QUEUED},          # 重试 = 重新入队
    CANCELED: set(),
}

# 失败分类：旧实现只有一句 error 字符串，前端无法区分"重试有用"与"重试无用"
ERROR_CODES = (
    "network",        # 可重试
    "rate_limit",     # 可重试（退避）
    "quota",          # 需用户充值/换卡
    "auth",           # 需重新登录/激活
    "invalid_input",  # 重试无用
    "unsupported",    # 重试无用（缺能力/缺组件）
    "gpu_oom",        # 可降档重试
    "interrupted",    # 进程重启导致，可续跑
    "internal",       # 需上报
)
RETRYABLE_ERRORS = {"network", "rate_limit", "gpu_oom", "interrupted"}

# 前端只能识别的终态词；内部状态对外映射
PUBLIC_STATE = {DONE: DONE, ERROR: ERROR, INTERRUPTED: ERROR}


@dataclass
class Task:
    id: str
    kind: str
    domain: str
    state: str = QUEUED
    progress: float = 0.0            # 内部统一 0.0~1.0，对外 ×100
    message: str = ""
    error_code: str | None = None
    error_detail: str | None = None
    idempotency_key: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    result: dict[str, Any] | None = None
    checkpoint: dict[str, Any] | None = None
    attempt: int = 1
    created_at: float = field(default_factory=time.time)
    started_at: float | None = None
    finished_at: float | None = None
    updated_at: float = field(default_factory=time.time)

    def to_row(self) -> dict[str, Any]:
        return asdict(self)

    def is_terminal(self) -> bool:
        return self.state in TERMINAL_STATES

    def can_retry(self) -> bool:
        return self.state in (ERROR, INTERRUPTED) and (
            self.error_code or "internal") in RETRYABLE_ERRORS

    def public(self) -> dict[str, Any]:
        """前端契约视图：camelCase + 0~100 进度 + error 字符串。"""
        return {
            "id": self.id,
            "kind": self.kind,
            "domain": self.domain,
            "state": PUBLIC_STATE.get(self.state, self.state),
            "progress": round(self.progress * 100, 1),
            "message": self.message,
            "error": self.error_detail or self.error_code or "",
            "errorCode": self.error_code,
            "resumable": self.state == INTERRUPTED,
            "attempt": self.attempt,
            "result": self.result,
            "createdAt": self.created_at,
            "startedAt": self.started_at,
            "finishedAt": self.finished_at,
            "updatedAt": self.updated_at,
        }


def assert_transition(current: str, target: str) -> None:
    if current not in ALL_STATES:
        raise ValueError(f"未知状态: {current}")
    if target not in ALL_STATES:
        raise ValueError(f"未知目标状态: {target}")
    if target == current:
        return
    if target not in TRANSITIONS[current]:
        raise ValueError(f"非法状态迁移: {current} -> {target}")


def clamp_progress(value: float) -> float:
    """进度只能落在 [0,1]，且调用方负责不允许回退（回退会让进度条倒退）。"""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 0.0
    if v != v:  # NaN
        return 0.0
    return max(0.0, min(1.0, v))
