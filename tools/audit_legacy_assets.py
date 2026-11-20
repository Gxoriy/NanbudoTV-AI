"""用真实数据的副本验收：上一版本提取的资产（没有 id）还能不能生成参考图。

只读复制 data/*.db 到临时目录，绝不改用户数据。
验收标准：
1. GET project 返回的 assets 每条都有 id（读取时补）
2. POST /api/visual/asset/generate 传空 assetId/空 prompt → 200+taskId（不再 invalid_input）
3. POST /api/visual/asset/prompt 未知 id → 200（不再 not_found 红条）
4. 资产数量不因这次生成而变化
"""

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
    print(f"[{'OK  ' if ok else 'FAIL'}] {name:<30} {str(detail)[:110]}")


def main() -> int:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="legacy-assets-"))
    for db in (ROOT / "data").glob("*.db"):
        shutil.copy2(db, tmp / db.name)
    for name in ("llm-profiles.json", "model-config.json"):
        source = ROOT / "data" / name
        if source.exists():
            shutil.copy2(source, tmp / name)

    sys.path.insert(0, str(ROOT))
    import sqlite3

    conn = sqlite3.connect(tmp / "visual.db")
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT id, settings FROM visual_projects "
                        "ORDER BY updated_at DESC").fetchall()
    conn.close()
    def _assets_of(raw: str) -> dict:
        try:
            return (json.loads(raw or "{}").get("assets") or {})
        except json.JSONDecodeError:
            return {}

    legacy = None
    for row in rows:
        assets = _assets_of(row["settings"])
        rows_all = [item for value in assets.values() for item in value]
        if rows_all and any(not item.get("id") for item in rows_all):
            legacy = row
            break
    target = legacy or next(
        (row for row in rows if any(_assets_of(row["settings"]).values())), rows[0])
    pid = target["id"]
    print(f"[*] 使用项目 {pid[:8]}（legacy={'yes' if legacy else 'no'})\n")

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

        _, body = http(port, f"/api/visual/project?id={pid}")
        project = body.get("project") or {}
        people = (project.get("assets") or {}).get("people") or []
        step("旧资产读取时补 id", all(row.get("id") for row in people),
             f"n={len(people)} ids={[r.get('id') for r in people][:3]}")

        status, prompt = http(port, "/api/visual/asset/prompt", "POST",
                              {"assetId": "people-999"})
        step("未知资产提示词 200", status == 200, f"status={status} body={str(prompt)[:60]}")

        status, submitted = http(port, "/api/visual/asset/generate", "POST", {
            "projectId": pid, "kind": "people",
            # 关键：旧卡片可能给不出 id、提示词框为空
            "assetId": "", "prompt": "",
            "imageModel": "google/nano-banana", "tier": "economy",
            "imageResolution": "1k", "size": "1024x1024", "ratio": "16:9",
        })
        step("空 id/空 prompt 也能提交", status == 200 and bool(submitted.get("taskId")),
             f"status={status} err={submitted.get('error') or ''}")

        task_id = submitted.get("taskId") or ""
        task = {}
        deadline = time.time() + 600
        while task_id and time.time() < deadline:
            _, snap = http(port, f"/api/tasks/{task_id}")
            task = snap.get("task") or snap
            if task.get("state") in ("done", "error"):
                break
            time.sleep(2)
        step("生成任务结束", task.get("state") in ("done", "error"),
             f"state={task.get('state')} err={str(task.get('error') or '')[:50]}")

        _, after = http(port, f"/api/visual/project?id={pid}")
        people2 = (((after.get("project") or {}).get("assets") or {})
                   .get("people")) or []
        step("资产数量未变化", len(people2) == len(people),
             f"before={len(people)} after={len(people2)}")

        failed = [row for row in STEPS if not row["ok"]]
        print(f"\n合计 {len(STEPS)} 步，失败 {len(failed)}")
        (ROOT / ".local" / "legacy-assets.json").write_text(
            json.dumps(STEPS, ensure_ascii=False, indent=1), encoding="utf-8")
        return 0 if not failed else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
