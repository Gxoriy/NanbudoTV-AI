"""用**真实数据副本**验收：匹配弹窗计数 + 宏报价（卡片结构对齐后）。"""

from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
CARD = "DW-PWMB-AXYU-ASP8-C8H8-5X4P-ZSZW-RQ7G-QGTJ"
STEPS: list[dict] = []


def http(port, path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data,
                                 method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw.decode() or "{}")
        except json.JSONDecodeError:
            return exc.code, {}


def step(name, ok, detail=""):
    STEPS.append({"name": name, "ok": ok, "detail": detail})
    print(f"[{'OK  ' if ok else 'FAIL'}] {name:<32} {str(detail)[:110]}")


def main() -> int:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="real-project-"))
    for db in (ROOT / "data").glob("*.db"):
        shutil.copy2(db, tmp / db.name)
    for name in ("llm-profiles.json", "model-config.json"):
        s = ROOT / "data" / name
        if s.exists():
            shutil.copy2(s, tmp / name)

    sys.path.insert(0, str(ROOT))
    import sqlite3

    conn = sqlite3.connect(tmp / "visual.db")
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT id,name,settings FROM visual_projects "
                       "ORDER BY updated_at DESC").fetchone()
    pid = row["id"]
    settings = json.loads(row["settings"] or "{}")
    assets = settings.get("assets") or {}
    total = sum(len(assets.get(k) or []) for k in ("people", "scenes", "props"))
    with_images = sum(1 for k in ("people", "scenes", "props")
                      for item in (assets.get(k) or []) if item.get("imageFile"))
    conn.close()
    print(f"[*] 真实项目 {pid[:8]} {row['name']}：{total} 资产，{with_images} 有图\n")

    proc = subprocess.Popen([sys.executable, "-m", "app.main", "--no-gui", "--port", "0",
                             "--data-dir", str(tmp)], cwd=str(ROOT),
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        port = None
        for _ in range(120):
            files = list(tmp.glob("runtime-*.json"))
            if files:
                port = json.loads(files[0].read_text(encoding="utf-8"))["port"]
                break
            time.sleep(0.3)
        print("[*] 端口", port)

        status, matched = http(port, f"/api/asset-library/matches?projectId={pid}")
        targets = matched.get("targets") or []
        existing = [r for r in targets if r.get("status") == "existing"]
        step("匹配返回全部资产", status == 200 and len(targets) == total,
             f"rows={len(targets)} total={matched.get('totalAssets')}")
        step("已有图片被识别", len(existing) == with_images,
             f"existing={len(existing)}/{with_images}")
        step("已有图片可预览", all(
            str((r.get("candidates") or [{}])[0].get("url", "")).startswith(
                "/api/asset-library/image?")
            for r in existing[:3]) if existing else True,
            str(((existing[0].get("candidates") or [{}])[0].get("url")
                 if existing else ""))[:60])

        status, snap = http(port, f"/api/visual/macro/state?projectId={pid}")
        scenes = snap.get("scenes") or []
        segments = snap.get("segments") or {}
        cards = []
        if scenes:
            scene_id = str(scenes[0].get("id"))
            cards = list(((segments.get(scene_id) or {}).get("result") or {})
                         .get("cards") or [])
        step("快照含 segments[].result.cards", bool(cards), f"cards={len(cards)}")

        if cards:
            status, quote = http(port, "/api/visual/macro/quote", "POST",
                                 {"projectId": pid, "action": "segment",
                                  "segmentId": str(scenes[0].get("id")),
                                  "completionMode": "all",
                                  "source": snap.get("currentSource") or ""})
            numbers = [int(c.get("number") or i + 1)
                       for i, c in enumerate(cards)]
            ok = (quote.get("cardNumbers") == numbers
                  and quote.get("cardCount") == len(cards)
                  and quote.get("maxCalls") == len(cards)
                  and abs(float(quote.get("totalCredits") or 0)
                          - float(quote.get("unitCredits") or 0) * len(cards)) < 1e-8)
            step("all 报价与卡片一致", ok,
                 f"maxCalls={quote.get('maxCalls')} numbers={quote.get('cardNumbers')}")

        failed = [r for r in STEPS if not r["ok"]]
        print(f"\n合计 {len(STEPS)} 步，失败 {len(failed)}")
        (ROOT / ".local" / "real-project.json").write_text(
            json.dumps(STEPS, ensure_ascii=False, indent=1), encoding="utf-8")
        return 0 if not failed else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
