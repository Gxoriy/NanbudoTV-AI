"""深度探测：把原包 PYZ 的 220 个业务模块与我们现有实现做结构化对比。

数据来源（都是本地已提取的）：
  - spec/extracted/core-clues.json      每个 core.* 模块的函数名/字符串/SQL
  - spec/extracted/pyz-modules.txt      1633 个模块清单
  - spec/extracted/clues.json           入口 app.pyc 的 262 条路由常量
  - spec/route-spec.json                旧版 265 条路由表

产出：
  - 按域聚合的模块表（函数数、字符串数、有没有 prompt/SQL）
  - 与 app/、domain/ 的函数名/关键字比对，算出"已有实现"覆盖率
  - 未覆盖模块清单（按函数数量排序，作为改造任务清单的输入）

用法：python tools/deep_probe.py [--json]
"""

from __future__ import annotations

import json
import pathlib
import re
import sys
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[1]
EXTRACTED = ROOT / "spec" / "extracted"

# 按模块名前缀划分域（顺序敏感，先匹配更具体的前缀）
DOMAINS: list[tuple[str, tuple[str, ...]]] = [
    ("字幕", ("subtitle", "asr", "transcribe", "watermark")),
    ("配音", ("voice", "sapi", "tts", "dub")),
    ("视觉/分镜", ("visual", "storyboard", "shot", "episode", "cut", "frame",
                  "scene", "macro", "card", "canvas", "style")),
    ("素材/资产", ("asset", "library", "identity", "match")),
    ("电商/门店/投放", ("ecommerce", "store", "advert", "marketing", "product")),
    ("改写/原创/剧本", ("writing", "rewrite", "original", "novel", "script", "prompt",
                      "quality", "source", "proposal", "breakdown", "align")),
    ("采集/链接", ("browser", "watch", "link", "hall", "download", "capture", "collect")),
    ("系统/授权/更新", ("system", "license", "update", "runtime", "setting", "storage",
                       "history", "task", "log", "config")),
    ("模型/管线底座", ("pipeline", "model", "llm", "api", "client", "provider", "router",
                      "schema", "db", "sqlite", "utils", "compat")),
]


def domain_of(module: str) -> str:
    name = module.removeprefix("core.").lower()
    for label, keys in DOMAINS:
        if any(key in name for key in keys):
            return label
    return "其他"


def load_json(path: pathlib.Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def collect_ours() -> tuple[set[str], set[str]]:
    """收集我们代码里的函数名与类名（用于比对覆盖）。"""
    names: set[str] = set()
    classes: set[str] = set()
    for folder in ("app", "domain", "infra", "server"):
        base = ROOT / folder
        if not base.exists():
            continue
        for path in base.rglob("*.py"):
            text = path.read_text(encoding="utf-8", errors="replace")
            names.update(re.findall(r"^    def (\w+)", text, re.M))
            names.update(re.findall(r"^def (\w+)", text, re.M))
            classes.update(re.findall(r"^class (\w+)", text, re.M))
    return names, classes


def summarize_module(info: dict) -> dict:
    strings = info.get("strings") or []
    sql = info.get("sql") or []
    prompts = [s for s in strings if len(s) >= 60 and re.search(r"[\u4e00-\u9fff]", s)]
    return {
        "functions": len(info.get("functions") or []),
        "classes": len(info.get("classes") or []),
        "strings": len(strings),
        "sql": len(sql),
        "prompts": len(prompts),
        "bytes": info.get("bytes", 0),
        "functionNames": (info.get("functions") or [])[:40],
    }


def main() -> int:
    clues = load_json(EXTRACTED / "core-clues.json")
    if not clues:
        print("[!] 缺少 spec/extracted/core-clues.json（先跑 tools/pyz_core_dump.py）")
        return 1
    entry = load_json(EXTRACTED / "clues.json")
    routes = json.loads((ROOT / "spec" / "route-spec.json").read_text(encoding="utf-8"))["routes"]
    ours, our_classes = collect_ours()

    rows: list[dict] = []
    for module, info in clues.items():
        stats = summarize_module(info)
        funcs = stats["functionNames"]
        # 命中判定：模块里的函数名有多少出现在我们的代码里（同名即视为"有对应实现"）
        hit = [name for name in funcs if name in ours and not name.startswith("_")]
        ratio = round(len(hit) / max(1, len(funcs)), 2)
        rows.append({
            "module": module,
            "domain": domain_of(module),
            "ratio": ratio,
            **{k: v for k, v in stats.items() if k != "functionNames"},
            "sampleFunctions": funcs[:6],
            "hitFunctions": hit[:6],
        })

    by_domain: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_domain[row["domain"]].append(row)

    def domain_score(items: list[dict]) -> float:
        weight = sum(item["functions"] for item in items) or 1
        return round(sum(item["ratio"] * item["functions"] for item in items) / weight, 2)

    summary = {
        "modules": len(rows),
        "functions": sum(row["functions"] for row in rows),
        "strings": sum(row["strings"] for row in rows),
        "sql": sum(row["sql"] for row in rows),
        "prompts": sum(row["prompts"] for row in rows),
        "routes": len(routes),
        "routeConstants": len(entry.get("routes") or []),
        "domains": {
            name: {
                "modules": len(items),
                "functions": sum(item["functions"] for item in items),
                "coverage": domain_score(items),
                "gaps": [item["module"] for item in sorted(
                    items, key=lambda row: -row["functions"])
                    if item["ratio"] < 0.2][:12],
            }
            for name, items in sorted(by_domain.items(),
                                      key=lambda kv: -sum(i["functions"] for i in kv[1]))
        },
    }

    if "--json" in sys.argv:
        print(json.dumps({"summary": summary, "modules": rows}, ensure_ascii=False, indent=1))
        return 0

    print(f"原包业务模块 {summary['modules']} 个，函数 {summary['functions']} 个，"
          f"字符串 {summary['strings']}，提示词 {summary['prompts']}，SQL 段 {summary['sql']}")
    print(f"旧版路由 {summary['routes']} 条，入口常量 {summary['routeConstants']} 条")
    print(f"我们代码里函数名 {len(ours)} 个、类 {len(our_classes)} 个\n")
    print(f"{'域':<12}{'模块':>5}{'函数':>7}{'覆盖率':>8}  未覆盖模块（按规模）")
    for name, info in summary["domains"].items():
        gaps = ", ".join(item.replace("core.", "") for item in info["gaps"][:5])
        print(f"{name:<12}{info['modules']:>5}{info['functions']:>7}"
              f"{info['coverage'] * 100:>7.0f}%  {gaps}")

    uncovered = sorted((row for row in rows if row["ratio"] < 0.2),
                       key=lambda row: -row["functions"])[:25]
    print("\n最值得改造的 25 个模块（按函数数量）：")
    for row in uncovered:
        print(f"  {row['module']:<44} 函数{row['functions']:>3} 字符串{row['strings']:>4} "
              f"prompt{row['prompts']:>3} SQL{row['sql']:>2}  {', '.join(row['sampleFunctions'][:3])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
