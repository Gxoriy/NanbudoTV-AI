"""定位 app.pyc 的真实 marshal 起点，并看 PYZ 里有哪些业务包名。"""

from __future__ import annotations

import marshal
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
EXTRACTED = ROOT / "spec" / "extracted"


def try_offsets(path: pathlib.Path) -> tuple[int, object] | None:
    raw = path.read_bytes()
    for skip in range(0, 25):
        try:
            code = marshal.loads(raw[skip:])
        except Exception:  # noqa: BLE001
            continue
        if hasattr(code, "co_code"):
            return skip, code
    return None


def main() -> int:
    target = EXTRACTED / "app.pyc"
    found = try_offsets(target)
    if found:
        skip, code = found
        print(f"[*] app.pyc 可用偏移 {skip}，顶层 co_name={code.co_name} "
              f"常量 {len(code.co_consts)} 个")
        names = {c.co_name for c in code.co_consts if hasattr(c, "co_code")}
        print(f"[*] 顶层函数/类 {len(names)} 个，示例：{sorted(names)[:12]}")
    else:
        print("[!] app.pyc 无法直接 marshal，可能被 PyInstaller 压缩/加密")

    module_list = (EXTRACTED / "pyz-modules.txt").read_text(encoding="utf-8").splitlines()
    tops = sorted({name.split(".")[0] for name in module_list})
    print(f"\n[*] PYZ 顶层包 {len(tops)} 个：{tops[:30]}")
    hits = [n for n in module_list
            if any(key in n.lower() for key in ("route", "server", "web", "api",
                                                "core", "main", "app"))]
    print(f"[*] 疑似业务模块 {len(hits)} 个：{hits[:25]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
