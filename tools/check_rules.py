"""CI 门禁（P1-07）：把"下次不许再犯"的规则变成可执行检查。

检查项：
  R1 单文件 <= 800 行                      （旧 app.py 单体 2.5~3 万行的直接后果）
  R2 禁止数字后缀命名（xxx242 / _cache_cleanup_busy279）
  R3 app/main.py 必须 freeze_support 且位于 __main__ 保护内
  R4 domain/ 不得 import http.server       （业务层不许碰传输层）
  R5 infra/ 不得 import webview            （基础设施不许依赖桌面壳）

用法：python tools/check_rules.py [--root .]
退出码 0 = 通过，1 = 有违规（可直接挂 CI）。
"""

from __future__ import annotations

import argparse
import ast
import pathlib
import re
import sys

MAX_LINES = 800
# 旧实现的后缀是"补丁轮次"，实测集中在 195~279 区间，均为三位数
NUM_SUFFIX_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*?(\d{3})$")
# 合法含数字结尾的标识符（单位/算法/版本缩写），不视为"补丁后缀"
NUMBER_SUFFIX_ALLOW = {
    "sha256", "sha1", "sha512", "md5", "utf8", "utf16", "utf32", "base64",
    "http2", "py312", "win64", "x64", "mp3", "mp4", "webp", "avif",
    "int8", "int16", "int32", "int64", "float32", "float64",
}
# HTTP 状态码结尾是自然命名（non200 / MUST_501），不算补丁后缀
HTTP_STATUS_ALLOW = {
    "100", "200", "201", "202", "204", "206", "301", "302", "304", "400", "401",
    "403", "404", "405", "409", "410", "413", "415", "422", "429", "500", "501",
    "502", "503", "504",
}
SKIP_DIRS = {".git", "__pycache__", "spec", "static", "data", ".local", "venv", ".venv"}


def iter_py(root: pathlib.Path):
    for path in root.rglob("*.py"):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        yield path


def check_line_count(path: pathlib.Path) -> list[str]:
    lines = len(path.read_text(encoding="utf-8", errors="replace").splitlines())
    if lines > MAX_LINES:
        return [f"R1 {path}: {lines} 行 > {MAX_LINES}（请按域拆分模块）"]
    return []


def check_numeric_suffix(path: pathlib.Path, tree: ast.AST) -> list[str]:
    problems = []
    for node in ast.walk(tree):
        names: list[tuple[str, int]] = []
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.append((node.name, node.lineno))
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    names.append((target.id, node.lineno))
        for name, lineno in names:
            if name in NUMBER_SUFFIX_ALLOW:
                continue
            match = NUM_SUFFIX_RE.match(name)
            if not match or match.group(1) in HTTP_STATUS_ALLOW:
                continue
            problems.append(
                f"R2 {path}:{lineno} 标识符 `{name}` 带数字后缀（旧实现 279 轮补丁的遗迹）")
    return problems


def check_main_freeze(root: pathlib.Path, tree: ast.AST) -> list[str]:
    main_py = root / "app" / "main.py"
    if not main_py.exists():
        return []
    calls = {n.func.id for n in ast.walk(tree)
             if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)}
    if "freeze_support" not in calls:
        return [f"R3 {main_py}: 缺少 freeze_support()（冻结后会无限重启）"]
    guarded = False
    for node in tree.body:
        if isinstance(node, ast.If) and "__main__" in ast.dump(node.test):
            if any(isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
                   and n.func.id == "freeze_support" for n in ast.walk(node)):
                guarded = True
    if not guarded:
        return [f"R3 {main_py}: freeze_support 必须位于 if __name__ == '__main__' 内"]
    return []


def check_imports(root: pathlib.Path, path: pathlib.Path, tree: ast.AST) -> list[str]:
    problems = []
    rel = path.relative_to(root).as_posix()
    for node in ast.walk(tree):
        names: list[str] = []
        if isinstance(node, ast.Import):
            names = [a.name for a in node.names]
        elif isinstance(node, ast.ImportFrom) and node.module:
            names = [node.module]
        for name in names:
            if rel.startswith("domain/") and name.split(".")[0] in ("http", "socketserver"):
                problems.append(f"R4 {rel}:{node.lineno} domain 层不得依赖传输层（{name}）")
            if rel.startswith("infra/") and name.split(".")[0] == "webview":
                problems.append(f"R5 {rel}:{node.lineno} infra 层不得依赖桌面壳（{name}）")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(pathlib.Path(__file__).resolve().parents[1]))
    args = ap.parse_args()
    root = pathlib.Path(args.root).resolve()

    problems: list[str] = []
    checked = 0
    for path in iter_py(root):
        checked += 1
        rel = path.relative_to(root)
        problems += check_line_count(path)
        try:
            tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"))
        except SyntaxError as exc:
            problems.append(f"R0 {rel}: 语法错误 {exc}")
            continue
        problems += check_numeric_suffix(rel, tree)
        problems += check_imports(root, path, tree)
        if rel.as_posix() == "app/main.py":
            problems += check_main_freeze(root, tree)

    print(f"[*] 检查 {checked} 个 py 文件")
    if problems:
        print(f"[FAIL] {len(problems)} 项违规")
        for p in problems:
            print("   -", p)
        return 1
    print("[PASS] 全部规则通过（R1 行长 / R2 命名 / R3 freeze / R4-R5 依赖方向）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
