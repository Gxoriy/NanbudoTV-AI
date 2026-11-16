"""子模块健康位（P1-06）。

旧 `/api/health` 只回 `{ok, version, appName, channel}`，永远是 true——
数据库锁死、模型没配、目录不可写，它照样返回 ok，排障只能靠猜。
这里给每个可失败部件挂一个探针，聚合成 ok / degraded / fail。
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable

Probe = Callable[[], tuple[bool, str]]


@dataclass
class Component:
    name: str
    probe: Probe
    critical: bool = False
    detail: str = ""


@dataclass
class HealthRegistry:
    components: dict[str, Component] = field(default_factory=dict)

    def register(self, name: str, probe: Probe, *, critical: bool = False) -> None:
        self.components[name] = Component(name=name, probe=probe, critical=critical)

    def snapshot(self) -> dict[str, Any]:
        results: dict[str, dict[str, Any]] = {}
        worst = "ok"
        for name in sorted(self.components):
            comp = self.components[name]
            started = time.perf_counter()
            try:
                ok, detail = comp.probe()
            except Exception as exc:  # noqa: BLE001
                ok, detail = False, f"探针异常: {exc!r}"
            elapsed = round((time.perf_counter() - started) * 1000, 2)
            results[name] = {
                "ok": ok,
                "critical": comp.critical,
                "latencyMs": elapsed,
                "detail": detail,
            }
            if not ok:
                worst = "fail" if comp.critical else ("degraded" if worst == "ok" else worst)
        return {"ok": worst == "ok", "status": worst, "components": results}
