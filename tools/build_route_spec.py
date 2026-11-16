"""P0-02：把 app.pyc 中提取的路由候选归一为 route-spec.json。

规则：
  - 一级前缀（/api/<prefix>/...）决定归属域，前缀 → 域映射表显式声明
  - 路由携带"引用它的函数"，作为迁移时的证据链
  - 未匹配任何域前缀的路由直接报错，保证 NFR-10（无 unassigned）
"""

from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = ROOT / "spec"

# 顺序无关（按一级前缀精确匹配），全部 51 个前缀 + root
DOMAINS: list[tuple[str, str, str]] = [
    # 业务域
    ("source", "D1", "改写"), ("rewrite", "D1", "改写"), ("rewrite-projects", "D1", "改写"),
    ("quality", "D1", "改写"), ("original", "D1", "改写"), ("writing", "D1", "改写"),
    ("prompt-reverse", "D1", "改写"), ("story-workflow", "D1", "改写"), ("breakdown", "D1", "改写"),
    ("novel-screenplay", "D1", "改写"), ("novel-projects250", "D1", "改写"),
    ("script", "D1", "改写"), ("script-alignment", "D1", "改写"),
    ("visual", "D2", "视觉"), ("canvas", "D2", "视觉"), ("characters", "D2", "视觉"),
    ("asset-library", "D2", "视觉"),
    ("subtitle", "D3", "字幕/ASR"), ("asr", "D3", "字幕/ASR"), ("transcribe", "D3", "字幕/ASR"),
    ("image-watermark", "D3", "字幕/ASR"),
    ("voices", "D4", "配音"), ("video-voice", "D4", "配音"),
    ("store", "D5", "电商/门店"), ("ecommerce", "D5", "电商/门店"),
    ("ecommerce-showcase", "D5", "电商/门店"), ("ecommerce-showcase-media", "D5", "电商/门店"),
    ("marketing", "D5", "电商/门店"),
    ("hall", "D6", "素材大厅/采集"), ("link", "D6", "素材大厅/采集"), ("watch", "D6", "素材大厅/采集"),
    # 支撑域
    ("tasks", "S1", "任务与状态"), ("history", "S1", "任务与状态"),
    ("license", "S2", "授权与计费"), ("session", "S2", "授权与计费"),
    ("client", "S2", "授权与计费"), ("creation", "S2", "授权与计费"),
    ("model-profiles", "S3", "模型与运行时"), ("runtime", "S3", "模型与运行时"),
    ("health", "S3", "模型与运行时"), ("download", "S3", "模型与运行时"),
    ("test-model", "S3", "模型与运行时"),
    ("local-storage", "S4", "存储与缓存"), ("local-cache", "S4", "存储与缓存"),
    ("storage", "S4", "存储与缓存"), ("upload", "S4", "存储与缓存"),
    ("update", "S5", "更新与外壳"), ("shutdown", "S5", "更新与外壳"),
    ("tutorials", "S5", "更新与外壳"), ("tutorial-video", "S5", "更新与外壳"),
]
PREFIX_MAP = {p: (d, n) for p, d, n in DOMAINS}

SUFFIX_ROUTES = [
    "/quote", "/submit", "/status", "/prepare", "/upload", "/export",
    "/project", "/projects", "/delete", "/assets/delete",
]


def prefix_of(path: str) -> str:
    parts = path.split("/")
    if len(parts) >= 3 and parts[2]:
        return parts[2]
    return "(root)"


def main() -> int:
    raw = json.loads((SPEC / "raw.json").read_text(encoding="utf-8"))
    owners = raw["route_owner"]

    entries = []
    unassigned = []
    for path in raw["routes"]:
        pre = prefix_of(path)
        if pre == "(root)":
            dom, name = "S5", "更新与外壳"
        elif pre in PREFIX_MAP:
            dom, name = PREFIX_MAP[pre]
        else:
            unassigned.append(path)
            continue
        entries.append(
            {
                "path": path,
                "kind": "api",
                "prefix": pre,
                "domain": dom,
                "domain_name": name,
                "methods": None,          # P0-03 由前端调用图谱回填
                "schema": None,           # P1 起逐域补
                "owners": owners.get(path, []),
                "status": "active",       # 待业务确认废弃项后改 deprecated
                "migrated": False,
            }
        )

    sub = [
        {"path": s, "kind": "subroute", "domain": "multi", "domain_name": "前缀派生",
         "note": "作为前缀路由的后缀出现，分派逻辑在 Handler 内", "status": "active"}
        for s in SUFFIX_ROUTES
    ]

    by_domain: dict[str, int] = {}
    for e in entries:
        by_domain[e["domain"]] = by_domain.get(e["domain"], 0) + 1

    spec = {
        "generated_by": "tools/build_route_spec.py",
        "source": "spec/extracted/app.pyc",
        "total_api_routes": len(entries),
        "total_subroutes": len(sub),
        "by_domain": dict(sorted(by_domain.items())),
        "domain_names": {d: n for d, n in {(d, n) for _, d, n in DOMAINS}.__iter__()},
        "routes": sorted(entries, key=lambda e: (e["domain"], e["path"])),
        "subroutes": sub,
    }

    if unassigned:
        print(f"[!] 未归属路由 {len(unassigned)} 条: {unassigned}")
        return 1

    (SPEC / "route-spec.json").write_text(
        json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"[*] api 路由 {len(entries)} 条，子路由后缀 {len(sub)} 条")
    for d, n in sorted(by_domain.items()):
        print(f"    {d}: {n}")
    print("[*] 无 unassigned，NFR-10 归属检查通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
