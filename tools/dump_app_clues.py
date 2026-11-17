"""从原包 app.pyc（PyInstaller 打包的单一 Python 模块）提取复刻线索。

为什么不用 IDA：这个包是 PyInstaller + CPython 3.12，业务逻辑全在一个
marshalled code object 里（偏移 0 直接可读），反汇编器只会看到解释器。
合法路径是 marshal + code object 遍历，拿到字符串常量（路由、SQL、提示词、错误文案）。
"""

from __future__ import annotations

import json
import marshal
import pathlib
import re
import sys
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parents[1]
EXTRACTED = ROOT / "spec" / "extracted"
APP = EXTRACTED / "app.pyc"


def walk(code, depth: int = 0, limit: int = 12):
    yield depth, code
    if depth >= limit:
        return
    for const in code.co_consts:
        if hasattr(const, "co_code"):
            yield from walk(const, depth + 1, limit)


def main() -> int:
    code = marshal.loads(APP.read_bytes())
    routes: set[str] = set()
    sql: list[str] = []
    prompts: list[str] = []
    messages: list[str] = []
    names: set[str] = set()
    classes: list[str] = []
    const_counter: Counter[str] = Counter()

    for _depth, node in walk(code):
        names.update(node.co_names)
        for const in node.co_consts:
            if not isinstance(const, str):
                if hasattr(const, "co_code") and const.co_name[:1].isupper():
                    classes.append(const.co_name)
                continue
            const_counter[const] += 1
            for hit in re.findall(r"/api/[A-Za-z0-9_\-/]+", const):
                routes.add(hit.rstrip("/"))
            upper = const.upper()
            if "CREATE TABLE" in upper or "INSERT INTO" in upper or "SELECT " in upper:
                sql.append(const)
            if len(const) >= 30 and re.search(r"[\u4e00-\u9fff]", const):
                if any(key in const for key in ("请", "不要", "你是", "输出", "返回", "提示")):
                    prompts.append(const)
                elif len(const) < 80:
                    messages.append(const)

    print(f"[*] 代码对象 {sum(1 for _ in walk(code))} 个，类 {len(set(classes))} 个")
    print(f"[*] 路由常量 {len(routes)} 条、SQL {len(sql)} 段、提示词 {len(prompts)} 条")
    print(f"[*] co_names {len(names)} 个")

    known = set()
    spec = ROOT / "spec" / "route-spec.json"
    if spec.exists():
        known = {row["path"].rstrip("/") for row in json.loads(spec.read_text(encoding="utf-8"))["routes"]}
    new_routes = sorted(routes - known)
    print(f"[*] spec 里没有的接口 {len(new_routes)} 条")

    report = {
        "stats": {"codeObjects": sum(1 for _ in walk(code)), "classes": len(set(classes)),
                  "routes": len(routes), "sql": len(sql), "prompts": len(prompts)},
        "routes": sorted(routes),
        "routesMissingInSpec": new_routes,
        "classes": sorted(set(classes)),
        "sql": sorted(set(sql))[:60],
        "prompts": sorted(set(prompts))[:60],
        "messages": sorted(set(messages))[:120],
        "topConstants": [{"text": t[:120], "count": c}
                         for t, c in const_counter.most_common(60)],
        "names": sorted(names),
    }
    target = EXTRACTED / "clues.json"
    target.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[*] 已写 {target.relative_to(ROOT)}（{target.stat().st_size // 1024} KB）")

    print("\n[*] spec 未收录的接口（前 20）：")
    for item in new_routes[:20]:
        print("   ", item)
    print("\n[*] 类名（前 15）：")
    for item in report["classes"][:15]:
        print("   ", item)
    return 0


if __name__ == "__main__":
    sys.exit(main())
