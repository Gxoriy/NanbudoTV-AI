"""P0-01：从 app.pyc（CPython 3.12 marshal）结构化提取行为规格。

不反编译、不执行目标代码，只做 code object 遍历与常量分类。
产出：
  spec/raw.json          全量统计 + 函数/类/路由/常量分类
  spec/route-candidates.json  /api 路由候选（含所属函数，便于人工确认）
"""

from __future__ import annotations

import json
import marshal
import pathlib
import re
import sys
import types

ROOT = pathlib.Path(__file__).resolve().parents[1]
APP = ROOT / "spec" / "extracted" / "app.pyc"
OUT = ROOT / "spec"

ROUTE_RE = re.compile(r"^/api/[A-Za-z0-9_\-/{}.]*$")
URL_RE = re.compile(r"^https?://", re.I)
SQL_RE = re.compile(r"\b(SELECT|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+TABLE)\b", re.I)
NUM_SUFFIX_RE = re.compile(r"^(?:_?[a-z][a-z0-9_]*?)(\d{2,3})$")


def walk_codes(code: types.CodeType, prefix: str = "", out=None):
    """深度遍历 code object，产出 (qualname, code, parent_qualname)。"""
    if out is None:
        out = []
    for const in code.co_consts:
        if isinstance(const, types.CodeType):
            qual = f"{prefix}{const.co_name}"
            out.append((qual, const, prefix.rstrip(".") or None))
            walk_codes(const, qual + ".", out)
    return out


def iter_strings(code: types.CodeType):
    for const in code.co_consts:
        if isinstance(const, str):
            yield const
        elif isinstance(const, types.CodeType):
            yield from iter_strings(const)


def main() -> int:
    if not APP.exists():
        raise SystemExit(f"缺少 {APP}，请先运行 Tool/pyinst_extract.py")
    code = marshal.loads(APP.read_bytes())

    top_codes = [c for c in code.co_consts if isinstance(c, types.CodeType)]
    all_codes = walk_codes(code)

    funcs, classes = [], []
    for qual, c, parent in all_codes:
        short = qual.rsplit(".", 1)[-1]
        rec = {
            "qualname": qual,
            "name": short,
            "lineno": c.co_firstlineno,
            "args": c.co_argcount,
            "kwonly": c.co_kwonlyargcount,
            "locals": len(c.co_varnames),
            "bytecode": len(c.co_code),
            "parent": parent,
            "doc": (c.co_consts[0][:120] if c.co_consts and isinstance(c.co_consts[0], str) else ""),
        }
        # 顶层 code object 的 co_name 与函数名一致；类体的 code 会带 __qualname__ 标记
        if "__qualname__" in c.co_names and "class" in (rec["doc"] or "").lower():
            classes.append(rec)
        funcs.append(rec)

    strings: dict[str, str] = {}
    for s in iter_strings(code):
        if 0 < len(s) <= 2000 and s not in strings:
            strings[s] = ""

    routes = sorted({s for s in strings if ROUTE_RE.match(s)})
    urls = sorted({s for s in strings if URL_RE.match(s)})
    sql = sorted({s for s in strings if SQL_RE.search(s)})
    num_suffixed = sorted({
        f["name"] for f in funcs if NUM_SUFFIX_RE.match(f["name"])
    })
    cn = sorted({s for s in strings if re.search(r"[\u4e00-\u9fff]", s)})

    # 路由 → 所属函数：在函数级常量里找
    route_owner: dict[str, list[str]] = {}
    for qual, c, _ in all_codes:
        for const in c.co_consts:
            if isinstance(const, str) and ROUTE_RE.match(const):
                route_owner.setdefault(const, []).append(qual)

    counts = {
        "top_level_code_objects": len(top_codes),
        "all_code_objects": len(all_codes),
        "string_constants": len(strings),
        "routes": len(routes),
        "urls": len(urls),
        "sql_strings": len(sql),
        "chinese_strings": len(cn),
        "numeric_suffix_names": len(num_suffixed),
    }

    raw = {
        "source": str(APP),
        "counts": counts,
        "classes": classes,
        "functions": sorted(funcs, key=lambda r: r["lineno"]),
        "routes": routes,
        "route_owner": {k: sorted(set(v)) for k, v in sorted(route_owner.items())},
        "urls": urls,
        "sql": sql,
        "numeric_suffix_names": num_suffixed,
        "chinese_string_count": len(cn),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "raw.json").write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")

    # 中文长文本单列，供 P0-04 提示词归档使用
    long_cn = [s for s in cn if len(s) >= 60]
    (OUT / "route-candidates.json").write_text(
        json.dumps(
            {
                "count": len(routes),
                "routes": [
                    {"path": r, "owners": route_owner.get(r, [])} for r in routes
                ],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    (OUT / "chinese-strings.json").write_text(
        json.dumps({"total": len(cn), "long_texts": long_cn}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(json.dumps(counts, ensure_ascii=False, indent=2))
    print(f"[*] 中文长文本(>=60) {len(long_cn)} 条")
    print(f"[*] 数字后缀命名 {len(num_suffixed)} 个，示例: {num_suffixed[:8]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
