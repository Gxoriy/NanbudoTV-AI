"""视觉域节点注册表 + 执行器（P3-02）。

背景：旧版把 D2 的 180 处调用写成了几个巨型函数（`macro/*` 一个函数里二十多个分支），
改一处要通读全文。这里改成「节点 + 流水线」：

  - 每个环节是一个 `NodeSpec`：声明 stage / 输入 / 输出 / 依赖的能力
  - `Executor` 按名字顺序执行，逐步记录 trace（耗时、输出键、失败原因）
  - 节点不认识具体服务，只从上下文里的 `_services` 取（assist / images / video / assets）
  - 缺能力时抛 `NodeError` 并说明缺什么，绝不返回假数据

**这个模块的价值不是"再包一层"**，而是把"顺序、依赖、可观测"三件事固定下来：
新增环节只写一个函数并 register，执行器、trace、接口都不动。
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable

Context = dict[str, Any]
NodeRun = Callable[[Context], Context]

# 能力键：节点通过它拿到外部依赖，缺了就报"未配置"
SERVICES = "_services"


class NodeError(RuntimeError):
    """节点执行失败（输入缺失、能力未配置、上游报错）。"""


@dataclass(frozen=True)
class NodeSpec:
    name: str
    stage: str                       # prepare / generate / compose / export
    run: NodeRun
    inputs: tuple[str, ...] = ()
    outputs: tuple[str, ...] = ()
    requires: tuple[str, ...] = ()   # 需要的能力：llm / image / video / assets
    retries: int = 0
    note: str = ""

    def describe(self) -> dict[str, Any]:
        return {"name": self.name, "stage": self.stage,
                "inputs": list(self.inputs), "outputs": list(self.outputs),
                "requires": list(self.requires), "retries": self.retries,
                "note": self.note}


class NodeRegistry:
    def __init__(self) -> None:
        self._nodes: dict[str, NodeSpec] = {}
        self._presets: dict[str, list[str]] = {}

    def register(self, spec: NodeSpec, *, replace: bool = False) -> NodeSpec:
        if spec.name in self._nodes and not replace:
            raise ValueError(f"节点重复注册: {spec.name}")
        self._nodes[spec.name] = spec
        return spec

    def preset(self, name: str, pipeline: list[str]) -> None:
        """登记一条流水线预设；节点名在运行时校验，允许先定义后补节点。"""
        if not pipeline:
            raise ValueError(f"流水线 {name} 不能为空")
        self._presets[name] = list(pipeline)

    def pipelines(self) -> dict[str, list[str]]:
        return {key: list(value) for key, value in sorted(self._presets.items())}

    def get(self, name: str) -> NodeSpec:
        if name not in self._nodes:
            raise NodeError(f"未知节点: {name}（已注册: {sorted(self._nodes)}）")
        return self._nodes[name]

    def all(self) -> list[NodeSpec]:
        return [self._nodes[key] for key in sorted(self._nodes)]

    def by_stage(self, stage: str) -> list[NodeSpec]:
        return [spec for spec in self.all() if spec.stage == stage]

    def describe(self) -> dict[str, Any]:
        stages: dict[str, list[dict[str, Any]]] = {}
        for spec in self.all():
            stages.setdefault(spec.stage, []).append(spec.describe())
        return {"ok": True, "total": len(self._nodes), "stages": stages,
                "nodes": [spec.describe() for spec in self.all()],
                "pipelines": self.pipelines()}


@dataclass
class Step:
    name: str
    ok: bool
    ms: float
    detail: str = ""
    outputs: tuple[str, ...] = ()
    attempt: int = 1

    def public(self) -> dict[str, Any]:
        return {"name": self.name, "ok": self.ok, "ms": self.ms,
                "detail": self.detail, "outputs": list(self.outputs),
                "attempt": self.attempt}


@dataclass
class Executor:
    registry: NodeRegistry
    trace: list[Step] = field(default_factory=list)

    def run(self, pipeline: list[str], ctx: Context, *,
            on_step: Callable[[Step], None] | None = None) -> Context:
        """按序执行；失败时抛 NodeError 并保留已完成步骤的 trace。"""
        self.trace = []
        if not pipeline:
            raise NodeError("流水线为空")
        for name in pipeline:
            spec = self.registry.get(name)
            missing = [key for key in spec.inputs if key not in ctx]
            if missing:
                self._fail(spec, NodeError(f"节点 {name} 缺少输入: {missing}"), 0.0, 1,
                           on_step)
            attempt = 0
            started = time.perf_counter()
            while True:
                attempt += 1
                try:
                    ctx = spec.run(ctx)
                    break
                except Exception as exc:  # noqa: BLE001
                    if attempt <= spec.retries:
                        continue
                    self._fail(spec, exc, (time.perf_counter() - started) * 1000,
                               attempt, on_step)
            elapsed = round((time.perf_counter() - started) * 1000, 1)
            present = tuple(key for key in spec.outputs if key in ctx)
            step = Step(name, True, elapsed, outputs=present, attempt=attempt)
            self.trace.append(step)
            if on_step:
                on_step(step)
        return ctx

    def _fail(self, spec: NodeSpec, exc: Exception, ms: float, attempt: int,
              on_step: Callable[[Step], None] | None) -> None:
        message = str(exc) or repr(exc)
        step = Step(spec.name, False, round(ms, 1), message, (), attempt)
        self.trace.append(step)
        if on_step:
            on_step(step)
        raise NodeError(f"{spec.name}: {message}") from exc

    def summary(self) -> list[dict[str, Any]]:
        return [step.public() for step in self.trace]


# ---------- 内置节点 ----------
def _services(ctx: Context) -> dict[str, Any]:
    return ctx.get(SERVICES) or {}


def _need(ctx: Context, capability: str, hint: str) -> Any:
    service = _services(ctx).get(capability)
    if service is None:
        raise NodeError(f"缺少能力：{capability}（{hint}）")
    return service


def default_registry() -> NodeRegistry:
    """D2 的默认节点集：覆盖「源文本 → 分镜 → 资产 → 卡 → 提交 → 装配」。

    每个节点只在被调用时才检查能力，所以没有 LLM/视频模型时，
    前面的纯本地节点照样能跑，失败点也说得清楚。
    """
    registry = NodeRegistry()

    def normalize(ctx: Context) -> Context:
        text = str(ctx.get("sourceText") or ctx.get("text") or "").strip()
        ctx["sourceText"] = text
        ctx["shots"] = list(ctx.get("shots") or [])
        ctx.setdefault("fps", 24)
        ctx.setdefault("secondsPerCard", 5)
        ctx["characters"] = len(text)
        return ctx

    def storyboard(ctx: Context) -> Context:
        if ctx.get("shots"):
            return ctx
        assist = _need(ctx, "llm", "分镜规划需要 LLM")
        wanted = int(ctx.get("shotsWanted") or 6)
        if hasattr(assist, "plan"):
            planned = assist.plan(ctx["sourceText"], shots=wanted)
        else:
            # 只有通用文本能力的渠道：用短 JSON 请求兜底
            planned = assist.json_call(
                "你是短剧分镜规划师，只输出 JSON。",
                f"需求：{ctx['sourceText'][:1200]}\n"
                f'只输出 {wanted} 个镜头：{{"shots":[{{"index":1,"seconds":4,'
                '"shot":"","prompt":""}]}')
        ctx["shots"] = planned.get("shots") or []
        return ctx

    def assets(ctx: Context) -> Context:
        store = _services(ctx).get("assets")
        rows: list[dict[str, Any]] = []
        if store is not None:
            project_id = ctx.get("projectId")
            try:
                rows = list(store.list(project_id=project_id, limit=200))
            except TypeError:
                # LibraryStore.list(kind, limit=...) 的签名不同，按素材 kind 取全量再过滤
                rows = list(store.list("asset", limit=200))
                if project_id:
                    rows = [row for row in rows
                            if str((row.get("payload") or {}).get("projectId") or "")
                            in ("", project_id)]
        names = [str(row.get("name") or "") for row in rows if row.get("name")]
        ctx["assetsMatched"] = [{"name": name, "matched": name in ctx["sourceText"]}
                                for name in names]
        ctx["assetsCount"] = len(names)
        return ctx

    def cards(ctx: Context) -> Context:
        """把镜头按 secondsPerCard 合并成视频卡（这一层旧版写在 macro 里）。"""
        per_card = float(ctx.get("secondsPerCard") or 5)
        built: list[dict[str, Any]] = []
        current: dict[str, Any] = {"number": 1, "seconds": 0.0, "shots": []}
        for scene in ctx.get("shots") or []:
            seconds = float(scene.get("seconds") or 0)
            if current["seconds"] and current["seconds"] + seconds > per_card:
                built.append(current)
                current = {"number": len(built) + 1, "seconds": 0.0, "shots": []}
            current["shots"].append(scene)
            current["seconds"] = round(current["seconds"] + seconds, 2)
        if current["shots"]:
            built.append(current)
        ctx["cards"] = built
        ctx["cardCount"] = len(built)
        return ctx

    def quote(ctx: Context) -> Context:
        return {**ctx, "quote": {"estimatedPoints": 0.0, "pricingMode": "free",
                                 "cards": ctx.get("cardCount", 0),
                                 "message": "免费。"}}

    def draft(ctx: Context) -> Context:
        assist = _need(ctx, "llm", "卡片草稿需要 LLM")
        drafts: list[dict[str, Any]] = []
        for card in ctx.get("cards") or []:
            shots = card.get("shots") or []
            subject = "；".join(str(scene.get("shot") or "") for scene in shots)[:200]
            if not subject:
                continue
            prompt = assist.complete(
                "只输出一段用于出图的中文提示词，不超过 60 字，不要解释。",
                f"镜头：{subject}")
            drafts.append({"number": card.get("number"), "prompt": prompt.strip()})
        return {**ctx, "drafts": drafts}

    def submit(ctx: Context) -> Context:
        video = _need(ctx, "video", "提交视频任务需要视频模型")
        tasks: list[dict[str, Any]] = []
        for draft in ctx.get("drafts") or []:
            result = video.start("card", prompt=draft["prompt"],
                                 project_id=ctx.get("projectId", ""))
            if result.get("ok"):
                tasks.append({"number": draft.get("number"),
                              "taskId": result.get("taskId")})
        return {**ctx, "mediaTasks": tasks, "submitted": len(tasks)}

    def observe(ctx: Context) -> Context:
        video = _services(ctx).get("video")
        states = []
        for task in ctx.get("mediaTasks") or []:
            public = video.observe(task["taskId"]) if video else None
            states.append({"number": task.get("number"), "taskId": task.get("taskId"),
                           "state": (public or {}).get("state", "unknown")})
        return {**ctx, "mediaStates": states}

    def assemble(ctx: Context) -> Context:
        cards = ctx.get("cards") or []
        drafts = {item.get("number"): item.get("prompt") for item in ctx.get("drafts") or []}
        merged = []
        for card in cards:
            merged.append({**card, "prompt": drafts.get(card.get("number"), "")})
        return {**ctx, "export": {"cards": merged, "cardCount": len(merged),
                                  "free": True,
                                  "assetsCount": ctx.get("assetsCount", 0)}}

    registry.register(NodeSpec("source.normalize", "prepare", normalize,
                               outputs=("sourceText", "shots", "characters"),
                               note="规范化源文本与默认参数"))
    registry.register(NodeSpec("storyboard.plan", "prepare", storyboard,
                               inputs=("sourceText",), outputs=("shots",),
                               requires=("llm",), retries=1,
                               note="LLM 逐镜规划（短请求）"))
    registry.register(NodeSpec("assets.match", "prepare", assets,
                               outputs=("assetsMatched", "assetsCount"),
                               note="按项目素材库做名称匹配（本地，不调模型）"))
    registry.register(NodeSpec("cards.build", "compose", cards, inputs=("shots",),
                               outputs=("cards", "cardCount"),
                               note="按单卡时长合并镜头"))
    registry.register(NodeSpec("cards.quote", "compose", quote, inputs=("cards",),
                               outputs=("quote",), note="报价恒 0（免费）"))
    registry.register(NodeSpec("card.draft", "generate", draft, inputs=("cards",),
                               outputs=("drafts",), requires=("llm",), retries=1,
                               note="为每张卡生成出图提示词"))
    registry.register(NodeSpec("media.submit", "generate", submit, inputs=("drafts",),
                               outputs=("mediaTasks", "submitted"), requires=("video",),
                               note="提交视频任务（异步）"))
    registry.register(NodeSpec("media.observe", "compose", observe,
                               inputs=("mediaTasks",), outputs=("mediaStates",),
                               note="读取任务进度，不阻塞"))
    registry.register(NodeSpec("export.assemble", "export", assemble, inputs=("cards",),
                               outputs=("export",), note="装配可导出结构"))

    registry.preset("macro", ["source.normalize", "storyboard.plan", "assets.match",
                              "cards.build", "cards.quote", "card.draft",
                              "media.submit", "media.observe", "export.assemble"])
    registry.preset("storyboard", ["source.normalize", "storyboard.plan",
                                   "cards.build", "cards.quote", "export.assemble"])
    registry.preset("inspect", ["source.normalize", "assets.match", "cards.build"])
    return registry
