"""演示前体检：确认真实 data/ 目录能撑起一场现场演示。

判据全部照**真实库结构**写（license.db 是 cards/activations，visual.db 是
visual_projects，subtitle.db 是 subtitle_records……），不靠猜表名。

检查项：
  1. 各 sqlite 库完整（PRAGMA quick_check）+ 关键表存在
  2. 授权卡：功能是否覆盖演示所需的六项、是否被吊销、是否已绑定设备
  3. 模型渠道：LLM / 图像（含备用）/ 视频 的密钥是否齐
  4. 残留 runtime 文件（僵尸 pid 会让前端"看起来在跑"）
  5. 依赖：ffmpeg / Playwright / PyAV / opencv
  6. 演示素材：是否有现成项目/素材库条目

用法：python tools/demo_check.py [--json] [--clean]
      --clean 会删除僵尸 runtime 文件（只删指向已退出进程的）
"""

from __future__ import annotations

import json
import os
import pathlib
import shutil
import sqlite3
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
AS_JSON = "--json" in sys.argv
CLEAN = "--clean" in sys.argv

# 演示必须覆盖的功能项（授权卡里的 features 必须包含这些）
DEMO_FEATURES = ("rewrite", "original", "workflow", "ecommerce", "store", "advertising")

# 库 → 关键表（真实结构）
DB_TABLES: dict[str, tuple[str, ...]] = {
    "license.db": ("cards", "activations"),
    "workspace.db": ("docs",),
    "visual.db": ("visual_projects",),
    "visual-library.db": ("docs",),
    "assets.db": ("projects", "assets", "aliases", "versions"),
    "state.db": ("tasks",),
    "subtitle.db": ("subtitle_records",),
    "voice.db": ("voice_jobs",),
}

report: dict[str, dict] = {}


def add(section: str, key: str, ok: bool, detail: str = "") -> None:
    report.setdefault(section, {"ok": True, "items": []})
    if not ok:
        report[section]["ok"] = False
    report[section]["items"].append({"key": key, "ok": ok, "detail": detail})


def _connect(name: str) -> sqlite3.Connection | None:
    path = DATA / name
    if not path.is_file():
        return None
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=5)


def check_db(name: str, tables: tuple[str, ...]) -> dict[str, int]:
    path = DATA / name
    if not path.is_file():
        add("数据库", name, False, "文件不存在")
        return {}
    try:
        conn = _connect(name)
        assert conn is not None
        try:
            integrity = conn.execute("PRAGMA quick_check").fetchone()[0]
            if integrity != "ok":
                add("数据库", name, False, f"quick_check={integrity}")
                return {}
            present = {row[0] for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'")}
            missing = [table for table in tables if table not in present]
            counts = {}
            for table in tables:
                if table in present:
                    counts[table] = conn.execute(
                        f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            detail = ", ".join(f"{table}={count}" for table, count in counts.items())
            if missing:
                detail += f"（缺表: {', '.join(missing)}）"
            add("数据库", name, not missing, detail or "无表")
            return counts
        finally:
            conn.close()
    except sqlite3.Error as exc:
        add("数据库", name, False, f"打不开: {exc}")
        return {}


def check_license() -> None:
    conn = _connect("license.db")
    if conn is None:
        add("授权", "license.db", False, "不存在：需要先导入卡密")
        return
    try:
        names = [row[1] for row in conn.execute("PRAGMA table_info(cards)")]
        rows = conn.execute("SELECT * FROM cards").fetchall()
        if not rows:
            add("授权", "卡数量", False, "0 张")
            return
        add("授权", "卡数量", True, f"{len(rows)} 张")
        for row in rows:
            item = dict(zip(names, row, strict=False))
            features = [part.strip() for part in
                        str(item.get("features") or "").split(",") if part.strip()]
            missing = [name for name in DEMO_FEATURES if name not in features]
            revoked = bool(item.get("revoked"))
            days = item.get("days") or 0
            digest = str(item.get("card_hash") or "")[:8]
            add("授权", f"卡 {digest}…", not missing and not revoked,
                f"功能 {len(features)} 项"
                + (f"（缺 {', '.join(missing)}）" if missing else "（覆盖演示六项）")
                + f" 有效期={'永久' if not days else f'{days} 天'}"
                + (" 【已吊销】" if revoked else ""))
        activated = conn.execute("SELECT COUNT(*) FROM activations").fetchone()[0]
        add("授权", "设备绑定", True,
            f"{activated} 台" + ("（首次登录会自动绑定）" if not activated else ""))
    except sqlite3.Error as exc:
        add("授权", "读取失败", False, str(exc))
    finally:
        conn.close()


def check_models() -> None:
    config = DATA / "model-config.json"
    if not config.is_file():
        add("模型", "model-config.json", False, "不存在")
    else:
        try:
            data = json.loads(config.read_text(encoding="utf-8"))
            for section in ("images", "videos"):
                block = data.get(section) or {}
                filled = all(str(block.get(key) or "").strip()
                             for key in ("baseUrl", "apiKey", "model"))
                fallback = (block.get("fallback") or {}).get("model")
                add("模型", section, filled,
                    f"model={block.get('model') or '空'} "
                    f"key={'已填' if block.get('apiKey') else '缺失'} "
                    f"备用={'有 ' + fallback if fallback else '无'}")
        except json.JSONDecodeError as exc:
            add("模型", "model-config.json", False, f"JSON 坏了: {exc}")

    profiles = DATA / "llm-profiles.json"
    if not profiles.is_file():
        add("模型", "llm-profiles.json", False, "不存在（LLM 不可用）")
        return
    try:
        body = json.loads(profiles.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        add("模型", "llm-profiles.json", False, f"JSON 坏了: {exc}")
        return
    providers = body.get("profiles") or body.get("providers") or body
    ready = ([name for name, item in providers.items()
              if isinstance(item, dict) and str(item.get("apiKey") or "").strip()]
             if isinstance(providers, dict) else [])
    add("模型", "LLM 渠道", bool(ready), f"有密钥: {ready or '无'}")


def check_runtime() -> None:
    stale, alive = [], []
    for path in DATA.glob("runtime-*.json"):
        try:
            body = json.loads(path.read_text(encoding="utf-8"))
            pid = int(body.get("pid") or 0)
            url = str(body.get("baseUrl") or "")
        except (json.JSONDecodeError, ValueError, OSError):
            stale.append(path.name)
            continue
        running = False
        if pid:
            try:
                os.kill(pid, 0)
                running = True
            except OSError:
                running = False
        (alive if running else stale).append(path.name if not running else f"{pid}@{url}")
    if stale and CLEAN:
        removed = []
        for name in stale:
            try:
                (DATA / name).unlink()
                removed.append(name)
            except OSError:
                pass
        add("运行时", "清理僵尸 runtime", True, f"已删除 {len(removed)} 个: {removed}")
        stale = []
    add("运行时", "残留 runtime 文件", not stale,
        f"僵尸 {len(stale)} 个" + (f"（{', '.join(stale[:3])}）" if stale else "，干净"))
    if alive:
        add("运行时", "已在运行", True, ", ".join(alive))


def check_deps() -> None:
    ffmpeg = shutil.which("ffmpeg") or (
        r"E:\PublicWork\ffmpeg\bin\ffmpeg.exe"
        if pathlib.Path(r"E:/PublicWork/ffmpeg/bin/ffmpeg.exe").is_file() else "")
    add("依赖", "ffmpeg", bool(ffmpeg), ffmpeg or "缺失（只影响像素修补）")
    root = pathlib.Path(os.environ.get("NANBUDO_PLAYWRIGHT_DIR", r"E:\PublicWork\Playwright"))
    add("依赖", "Playwright", (root / "node_modules" / "playwright").exists(), str(root))
    try:
        import av  # noqa: PLC0415

        add("依赖", "PyAV", True, str(av.__version__))
    except Exception:  # noqa: BLE001
        add("依赖", "PyAV", False, "缺失（检测/转写退回 ffmpeg）")
    try:
        import cv2  # noqa: PLC0415

        add("依赖", "opencv", True, str(cv2.__version__))
    except Exception:  # noqa: BLE001
        add("依赖", "opencv", False, "缺失（检测/像素修补不可用）")


def check_demo_material() -> None:
    """演示素材：有现成项目/素材条目，讲的时候不用现场从零开始。"""
    conn = _connect("visual.db")
    if conn is not None:
        try:
            rows = conn.execute(
                "SELECT name, updated_at FROM visual_projects ORDER BY updated_at DESC"
                " LIMIT 5").fetchall()
            add("演示素材", "视觉项目", bool(rows),
                "; ".join(str(row[0]) for row in rows) or "无（演示时新建）")
        except sqlite3.Error:
            add("演示素材", "视觉项目", False, "读取失败")
        finally:
            conn.close()
    conn = _connect("visual-library.db")
    if conn is not None:
        try:
            rows = conn.execute("SELECT kind, name FROM docs LIMIT 5").fetchall()
            add("演示素材", "素材库/样式", True,
                f"{len(rows)} 条: " + ", ".join(f"{row[0]}/{row[1]}" for row in rows[:3]))
        except sqlite3.Error:
            pass
        finally:
            conn.close()
    usage = shutil.disk_usage(str(DATA))
    add("磁盘", "剩余空间", usage.free / 1024 ** 3 > 5,
        f"{usage.free / 1024 ** 3:.1f} GB")


def main() -> int:
    counts: dict[str, int] = {}
    for name, tables in DB_TABLES.items():
        counts.update({f"{name}:{table}": count
                       for table, count in check_db(name, tables).items()})
    check_license()
    check_models()
    check_runtime()
    check_deps()
    check_demo_material()

    if AS_JSON:
        print(json.dumps({"report": report, "counts": counts}, ensure_ascii=False,
                         indent=1))
    failed = [(section, item) for section, info in report.items()
              for item in info["items"] if not item["ok"]]
    if not AS_JSON:
        for section, info in report.items():
            mark = "OK  " if info["ok"] else "FAIL"
            print(f"\n[{mark}] {section}")
            for item in info["items"]:
                print(f"   {'ok ' if item['ok'] else '!! '}{item['key']:<20}"
                      f"{item['detail']}")
    total = sum(len(info["items"]) for info in report.values())
    print(f"\n合计 {total} 项，不通过 {len(failed)} 项")
    if failed:
        print("需处理：" + "；".join(f"{item['key']}({item['detail']})"
                                 for _, item in failed))
    return 0 if not failed else 3


if __name__ == "__main__":
    sys.exit(main())
