"""视觉域节点注册表 + 执行器（P3-02 地基）。

旧版 `macro/*` 有 20 多个分支，每个环节都写死在同一个大函数里；
这里把它拆成"节点定义 + 顺序执行"：
  - 新增一个视觉环节 = 加一个 `register(NodeSpec(...))` 文件，执行器不动
  - 节点的输入输出统一走 `dict` 上下文，便于断点续跑与逐步调试
  - 执行器返回 trace（每步耗时/输出键），前端可直接画进度
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable

Context = dict[str, Any]
NodeRun = Callable[[Context], Context]


class NodeError(RuntimeError):
    pass


@dataclass(frozen=True)
class NodeSpec:
    name: str
    stage: str                       # prepare / generate / compose / export
    run: NodeRun
    inputs: tuple[str, ...] = ()
    outputs: tuple[str, ...] = ()
    note: str = ""

    def describe(self) -> dict[str, Any]:
        return {"name": self.name, "stage": self.stage,
                "inputs": list(self.inputs), "outputs": list(self.outputs),
                "note": self.note}


class NodeRegistry:
    def __init__(self) -> None:
        self._nodes: dict[str, NodeSpec] = {}

    def register(self, spec: NodeSpec, *, replace: bool = False) -> NodeSpec:
        if spec.name in self._nodes and not replace:
            raise ValueError(f"节点重复注册: {spec.name}")
        self._nodes[spec.name] = spec
        return spec

    def get(self, name: str) -> NodeSpec:
        if name not in self._nodes:
            raise NodeError(f"未知节点: {name}（已注册: {sorted(self._nodes)}）")
        return self._nodes[name]

    def all(self) -> list[NodeSpec]:
        return [self._nodes[key] for key in sorted(self._nodes)]

    def by_stage(self, stage: str) -> list[NodeSpec]:
        return [spec for spec in self.all() if spec.stage == stage]


@dataclass
class Step:
    name: str
    ok: bool
    ms: float
    detail: str = ""


@dataclass
class Executor:
    registry: NodeRegistry
    trace: list[Step] = field(default_factory=list)

    def run(self, pipeline: list[str], ctx: Context) -> Context:
        """按 pipeline 顺序执行；任一步失败抛出并保留已完成步骤的 trace。"""
        self.trace = []
        for name in pipeline:
            spec = self.registry.get(name)
            missing = [key for key in spec.inputs if key not in ctx]
            if missing:
                raise NodeError(f"节点 {name} 缺少输入: {missing}")
            started = time.perf_counter()
            try:
                ctx = spec.run(ctx)
            except Exception as exc:  # noqa: BLE001
                self.trace.append(Step(name, False, round(
                    (time.perf_counter() - started) * 1000, 1), repr(exc)))
                raise
            self.trace.append(Step(name, True, round(
                (time.perf_counter() - started) * 1000, 1)))
        return ctx

    def summary(self) -> list[dict[str, Any]]:
        return [{"name": s.name, "ok": s.ok, "ms": s.ms, "detail": s.detail}
                for s in self.trace]


def default_registry() -> NodeRegistry:
    """内置最小节点集：足以验证执行器与 trace，不含重活。"""
    registry = NodeRegistry()

    def normalize(ctx: Context) -> Context:
        ctx["shots"] = ctx.get("shots") or []
        ctx.setdefault("fps", 24)
        return ctx

    def plan(ctx: Context) -> Context:
        ctx["planned"] = len(ctx.get("shots") or [])
        return ctx

    registry.register(NodeSpec("normalize", "prepare", normalize,
                               outputs=("shots", "fps"),
                               note="规范化分镜输入，补默认帧率"))
    registry.register(NodeSpec("plan", "prepare", plan, inputs=("shots",),
                               outputs=("planned",), note="统计镜头数，供后续环节分配预算"))
    return registry
