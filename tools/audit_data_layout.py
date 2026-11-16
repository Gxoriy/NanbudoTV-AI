"""P0-05：运行目录数据形态清点。

只读操作：遍历 data/，统计目录/文件，并对发现的 sqlite 库导出 schema 与行数。
产出 spec/data-layout.json / spec/data-layout.md
"""

from __future__ import annotations

import json
import pathlib
import sqlite3
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = ROOT / "spec"
DATA = pathlib.Path(r"F:\WorkAPP\短剧改写工作台\data")
INTERNAL = pathlib.Path(r"F:\WorkAPP\短剧改写工作台\_internal")


def tree(base: pathlib.Path, max_depth: int = 3) -> list[dict]:
    rows = []
    for p in sorted(base.rglob("*")):
        rel = p.relative_to(base)
        depth = len(rel.parts)
        if depth > max_depth:
            continue
        rows.append(
            {
                "path": str(rel).replace("\\", "/"),
                "type": "dir" if p.is_dir() else "file",
                "depth": depth,
                "size": p.stat().st_size if p.is_file() else None,
            }
        )
    return rows


def sqlite_schema(path: pathlib.Path) -> dict:
    info = {"path": str(path), "tables": []}
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        names = [r[0] for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
        for name in names:
            cols = [r[1] for r in con.execute(f'PRAGMA table_info("{name}")')]
            try:
                count = con.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
            except sqlite3.Error as exc:
                count = f"err: {exc}"
            info["tables"].append({"name": name, "columns": cols, "rows": count})
        info["journal_mode"] = con.execute("PRAGMA journal_mode").fetchone()[0]
    finally:
        con.close()
    return info


def main() -> int:
    if not DATA.exists():
        raise SystemExit(f"数据目录不存在: {DATA}")

    rows = tree(DATA)
    dbs = [sqlite_schema(DATA / r["path"]) for r in rows
           if r["type"] == "file" and r["path"].endswith((".sqlite3", ".db"))]

    # 中文路径与长度统计（打包坑：长路径/中文名）
    longest = max(rows, key=lambda r: len(r["path"])) if rows else None
    cn_top = [r["path"] for r in rows if r["depth"] == 1]

    internal_top = sorted(
        p.name for p in INTERNAL.iterdir() if p.is_dir()
    ) if INTERNAL.exists() else []

    out = {
        "data_root": str(DATA),
        "entries": rows,
        "top_level": cn_top,
        "longest_path": longest,
        "sqlite": dbs,
        "internal_top_dirs": internal_top,
    }
    (SPEC / "data-layout.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    md = ["# 数据形态清点（P0-05）", "", f"数据根目录：`{DATA}`", "",
          "## 一级目录", ""]
    for name in cn_top:
        md.append(f"- `{name}`")
    md += ["", "## 目录树（深度 ≤3）", "", "```"]
    for r in rows:
        indent = "  " * (r["depth"] - 1)
        size = f"  ({r['size']}B)" if r["size"] is not None else "/"
        md.append(f"{indent}{r['path']}{size}")
    md += ["```", "", "## SQLite 库", ""]
    if not dbs:
        md.append("_未发现 sqlite 库_")
    for db in dbs:
        md.append(f"### `{db['path']}`  journal={db['journal_mode']}")
        md.append("")
        md.append("| 表 | 行数 | 列 |")
        md.append("|---|---|---|")
        for t in db["tables"]:
            md.append(f"| {t['name']} | {t['rows']} | {', '.join(t['columns'])} |")
        md.append("")
    md += ["## 路径风险点", "",
           f"- 最长相对路径：`{longest['path']}` ({len(longest['path'])} 字符)" if longest else "",
           f"- 顶层目录含中文：{'是' if any(any('\u4e00' <= ch <= '\u9fff' for ch in n) for n in cn_top) else '否'}",
           "- 结论：展示名直接落盘为目录名，迁移 `infra/store` 时必须做 hash 目录 + 展示名分离"]
    (SPEC / "data-layout.md").write_text("\n".join(md), encoding="utf-8")

    print(f"[*] 条目 {len(rows)}，sqlite 库 {len(dbs)}")
    for db in dbs:
        print(f"    {db['path']}: {len(db['tables'])} 表")
    return 0


if __name__ == "__main__":
    sys.exit(main())
