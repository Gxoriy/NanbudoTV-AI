"""P0-03：前端调用图谱 —— 把 static/**/*.js 里的 /api 引用映射到后端路由。

产出 spec/frontend-calls.json，包含：
  calls          每次调用（文件、行号、路径、可推断的 HTTP 方法）
  orphans_front  前端在调但后端无路由（可能是动态拼接或历史残留）
  orphans_back   后端有路由但前端无人调用（迁移前需业务确认是否废弃）
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = ROOT / "spec"
STATIC = pathlib.Path(r"F:\WorkAPP\短剧改写工作台\_internal\static")

# 模板字符串内含 ${...}（可能有嵌套引号），单独用"到反引号为止"匹配
TEMPLATE_RE = re.compile(r"`(/api/[^`]*)`")
# 普通引号字符串：遇到同类引号即止，禁止跨行
QUOTED_RE = re.compile(r"""(['"])(/api/[^'"\n]*)\1""")
METHOD_RE = re.compile(r"""method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]""", re.I)


def normalize(path: str) -> str:
    path = path.split("?")[0].split("#")[0]
    path = re.sub(r"\$\{[^}]*\}", "{}", path)
    path = path.rstrip("/") or "/"
    return path


def matches(call: str, route: str) -> bool:
    a, b = normalize(call), normalize(route)
    return a == b or a.startswith(b + "/") or b.startswith(a + "/")


def main() -> int:
    if not STATIC.exists():
        raise SystemExit(f"前端目录不存在: {STATIC}")

    route_spec = json.loads((SPEC / "route-spec.json").read_text(encoding="utf-8"))
    routes = [r["path"] for r in route_spec["routes"]]

    calls = []
    sources = sorted(list(STATIC.rglob("*.js")) + list(STATIC.rglob("*.html")))
    for js in sources:
        text = js.read_text(encoding="utf-8", errors="replace")
        found: list[tuple[int, int, str, str]] = []
        for m in TEMPLATE_RE.finditer(text):
            found.append((m.start(), m.end(), m.group(1), "template"))
        for m in QUOTED_RE.finditer(text):
            found.append((m.start(), m.end(), m.group(2), "quoted"))
        for start, end, raw_path, style in sorted(found):
            tail = text[end:end + 400]
            mm = METHOD_RE.search(tail)
            line = text.count("\n", 0, start) + 1
            calls.append(
                {
                    "file": str(js.relative_to(STATIC)).replace("\\", "/"),
                    "line": line,
                    "raw": raw_path if len(raw_path) <= 200 else raw_path[:200] + "…",
                    "path": normalize(raw_path),
                    "style": style,
                    "method": mm.group(1).upper() if mm else None,
                    "method_confidence": "nearby" if mm else "unknown",
                    "kind": "html-ref" if js.suffix == ".html" else "js-call",
                }
            )

    call_paths = sorted({c["path"] for c in calls})
    front_orphans = [p for p in call_paths if not any(matches(p, r) for r in routes)]
    back_orphans = [r for r in routes if not any(matches(p, r) for p in call_paths)]

    # 回填每个后端路由被哪些前端文件调用，以及方法分布
    for r in route_spec["routes"]:
        hits = [c for c in calls if matches(c["path"], r["path"])]
        r["frontend_calls"] = len(hits)
        methods = sorted({c["method"] for c in hits if c["method"]})
        r["methods"] = methods or None
        r["callers"] = sorted({c["file"] for c in hits})[:12]

    out = {
        "generated_by": "tools/build_frontend_calls.py",
        "scanned_dir": str(STATIC),
        "js_files": len(list(STATIC.rglob("*.js"))),
        "call_sites": len(calls),
        "unique_paths": len(call_paths),
        "orphan_frontend": front_orphans,
        "orphan_backend": back_orphans,
        "calls": calls,
    }
    (SPEC / "frontend-calls.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (SPEC / "route-spec.json").write_text(
        json.dumps(route_spec, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"[*] js 文件 {out['js_files']}，调用点 {len(calls)}，唯一路径 {len(call_paths)}")
    print(f"[*] 前端孤儿(后端无路由) {len(front_orphans)}：{front_orphans[:10]}")
    print(f"[*] 后端孤儿(前端未调) {len(back_orphans)}：{back_orphans[:10]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
