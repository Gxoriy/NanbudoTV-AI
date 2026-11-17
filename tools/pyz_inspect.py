"""解析 PyInstaller 的 PYZ 归档（合法开源格式）：模块清单 + 指定模块的常量线索。

原包不是原生 exe 逻辑，而是 **PyInstaller 打包的 Python**（PYZ 魔数 0x0DCB → CPython 3.12）。
所以不需要 IDA：PYZ 里就是一个个 .pyc，用 marshal 直接读代码对象即可拿到
字符串常量（提示词、SQL、路由、错误文案）与函数/类名。
"""

from __future__ import annotations

import json
import marshal
import pathlib
import struct
import sys
import zlib
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parents[1]
EXTRACTED = ROOT / "spec" / "extracted"
PYZ = EXTRACTED / "PYZ.pyz.pyz"


def load_pyz(path: pathlib.Path) -> tuple[list[tuple[str, tuple]], bytes]:
    raw = path.read_bytes()
    if raw[:4] != b"PYZ\0":
        raise ValueError("不是 PYZ 归档")
    magic = raw[4:8]
    print(f"[*] PYZ 大小 {len(raw) / 1024 / 1024:.1f} MB, Python 魔数 {magic.hex()}")
    toc_offset = struct.unpack(">i", raw[8:12])[0]
    tail = raw[toc_offset:]
    # 不同 PyInstaller 版本：TOC 可能是裸 marshal，也可能先 zlib 压过
    for attempt in (lambda data: marshal.loads(data),
                    lambda data: marshal.loads(zlib.decompress(data))):
        try:
            toc = attempt(tail)
            break
        except Exception:  # noqa: BLE001
            continue
    else:
        raise ValueError("PYZ 的 TOC 既不是裸 marshal 也不是 zlib")
    return list(toc), raw


def iter_code(code, depth: int = 0):
    yield depth, code
    for const in code.co_consts:
        if hasattr(const, "co_code"):
            yield from iter_code(const, depth + 1)


def dump_module(raw: bytes, entry: tuple) -> dict[str, Any]:
    name, (typecode, offset, length) = entry
    blob = raw[offset:offset + length]
    code = marshal.loads(blob)
    strings: set[str] = set()
    names: set[str] = set()
    classes: set[str] = set()

    def walk(node, depth=0):
        if depth > 6:
            return
        for const in node.co_consts:
            if isinstance(const, str):
                if 4 <= len(const) <= 400:
                    strings.add(const)
            elif hasattr(const, "co_code"):
                if const.co_name[0].isupper():
                    classes.add(const.co_name)
                names.update(const.co_names)
                walk(const, depth + 1)

    names.update(code.co_names)
    walk(code)
    return {"module": name, "size": len(blob), "classes": sorted(classes),
            "names": sorted(names)[:200], "strings": sorted(strings),
            "stringCount": len(strings)}


def main() -> int:
    modules, raw = load_pyz(PYZ)
    names = [item[0] for item in modules]
    print(f"[*] 模块 {len(names)} 个")

    local = [n for n in names if n.startswith(("app", "domain", "infra", "api", "server"))]
    third = sorted({n.split(".")[0] for n in names} - {"app", "domain", "infra", "api"})
    print(f"[*] 业务模块 {len(local)} 个，第三方顶层包 {len(third)} 个")

    (EXTRACTED / "pyz-modules.txt").write_text("\n".join(names), encoding="utf-8")
    (EXTRACTED / "pyz-local-modules.txt").write_text("\n".join(local), encoding="utf-8")
    print("[*] 已写 spec/extracted/pyz-modules.txt 与 pyz-local-modules.txt")
    print("[*] 业务模块前 40 个:")
    for item in local[:40]:
        print("   ", item)

    with_entry = {item[0]: item for item in modules}
    targets = [n for n in local if n in with_entry][:1]
    if targets:
        info = dump_module(raw, with_entry[targets[0]])
        print(f"\n[*] 抽样 {info['module']}：类 {len(info['classes'])}、"
              f"字符串 {info['stringCount']}")
        for line in info["classes"][:10]:
            print("   class", line)
        for line in info["strings"][:10]:
            print("   str  ", line[:80])
    return 0


if __name__ == "__main__":
    sys.exit(main())
