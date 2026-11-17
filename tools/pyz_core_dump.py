"""导出原包 core.* 业务模块的线索（函数名、字符串、SQL、提示词）。

原包是 PyInstaller 打包的 CPython 3.12 应用：业务逻辑在 PYZ 归档的 `core.*` 模块里，
用 marshal 读 code object 就能拿到常量，不需要任何反汇编器。
"""

from __future__ import annotations

import json
import marshal
import pathlib
import re
import struct
import sys
import zlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
EXTRACTED = ROOT / "spec" / "extracted"
PYZ = EXTRACTED / "PYZ.pyz.pyz"
OUT_JSON = EXTRACTED / "core-clues.json"
OUT_MD = ROOT / "spec" / "original-architecture.md"


def load_pyz():
    raw = PYZ.read_bytes()
    toc_offset = struct.unpack(">i", raw[8:12])[0]
    tail = raw[toc_offset:]
    for attempt in (lambda d: marshal.loads(d),
                    lambda d: marshal.loads(zlib.decompress(d))):
        try:
            return list(attempt(tail)), raw
        except Exception:  # noqa: BLE001
            continue
    raise ValueError("PYZ TOC 解析失败")


def iter_code(code, depth: int = 0, limit: int = 10):
    yield depth, code
    if depth >= limit:
        return
    for const in code.co_consts:
        if hasattr(const, "co_code"):
            yield from iter_code(const, depth + 1, limit)


def analyse(blob: bytes) -> dict:
    # PYZ 里每个模块都是 zlib 压缩后的 marshal；个别版本是裸 marshal
    try:
        payload = zlib.decompress(blob)
    except zlib.error:
        payload = blob
    code = marshal.loads(payload)
    funcs: set[str] = set()
    classes: set[str] = set()
    strings: set[str] = set()
    sql: set[str] = set()
    for _depth, node in iter_code(code):
        if node.co_name[:1].isupper():
            classes.add(node.co_name)
        elif node is not code and node.co_name != "<lambda>":
            funcs.add(node.co_name)
        for const in node.co_consts:
            if not isinstance(const, str):
                continue
            if 4 <= len(const) <= 600:
                strings.add(const)
            upper = const.upper()
            if "CREATE TABLE" in upper or "INSERT INTO" in upper or "SELECT " in upper:
                sql.add(const)
    return {"classes": sorted(classes), "functions": sorted(funcs),
            "strings": sorted(strings), "sql": sorted(sql)}


def main() -> int:
    modules, raw = load_pyz()
    cores = [(name, entry) for name, entry in modules if name == "core" or name.startswith("core.")]
    print(f"[*] core.* 模块 {len(cores)} 个")

    result: dict[str, dict] = {}
    sql_total = 0
    for name, (_typ, offset, length) in cores:
        try:
            info = analyse(raw[offset:offset + length])
        except Exception as exc:  # noqa: BLE001
            print(f"    [skip] {name}: {exc}")
            continue
        info["bytes"] = length
        result[name] = info
        sql_total += len(info["sql"])

    OUT_JSON.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[*] 已写 {OUT_JSON.relative_to(ROOT)}（{OUT_JSON.stat().st_size // 1024} KB），"
          f"SQL 片段 {sql_total} 条")

    ranked = sorted(result.items(), key=lambda kv: len(kv[1]["strings"]), reverse=True)
    lines = ["# 原包架构（从 PYZ 的 core.* 模块提取）", "",
             f"来源：`spec/extracted/PYZ.pyz.pyz`，共 {len(cores)} 个业务模块；"
             f"本节由 `tools/pyz_core_dump.py` 生成。", "",
             "| 模块 | 函数 | 类 | 字符串 | SQL |", "|---|---|---|---|---|"]
    for name, info in ranked[:60]:
        lines.append(f"| `{name}` | {len(info['functions'])} | {len(info['classes'])} | "
                     f"{len(info['strings'])} | {len(info['sql'])} |")
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"[*] 已写 {OUT_MD.relative_to(ROOT)}")

    print("\n[*] 字符串最多的 10 个模块：")
    for name, info in ranked[:10]:
        sample = next((s for s in info["strings"] if re.search(r"[\u4e00-\u9fff]", s)), "")
        print(f"    {name:<44} str={len(info['strings']):>4} sql={len(info['sql']):>2} "
              f"{sample[:40]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
