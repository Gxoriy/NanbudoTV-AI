"""步骤 01「提取大纲」与步骤 03「补齐分镜」契约验收。

判定标准：
1. POST /api/visual/project/scenes（前端点"提取大纲"的真实 payload）
   → directoryReady=true、project.workflowPreparedScript.sceneDirectory 非空
2. GET /api/visual/macro/state?projectId=
   → **顶层** source / currentSource 非空，scenes 每项都有 source
   （宏编排据此判断"原稿为空"，缺了就无法补齐分镜）
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
SOURCE = ("第一场 图书馆 日 内\n林晚把剧本推到周野面前。\n\n"
          "第二场 图书馆 夜 内\n灯管坏了一根，雨声盖过翻页的声音。\n\n"
          "第三场 出租屋 夜 内\n台灯下摊着改到第七遍的稿子。")


def http(port, path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data,
                                 method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=240) as resp:
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
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="step13-"))
    for name in ("llm-profiles.json", "model-config.json"):
        s = ROOT / "data" / name
        if s.exists():
            shutil.copy2(s, tmp / name)
    sys.path.insert(0, str(ROOT))
    from domain.license import LicenseStore
    from domain.license.service import DEFAULT_FEATURES

    store = LicenseStore(tmp / "license.db")
    store.import_card(CARD, days=0, features=DEFAULT_FEATURES, note="step13")
    store.close()

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

        _, created = http(port, "/api/visual/project/create", "POST",
                          {"projectName": "大纲与分镜", "createRequestId": "s13"})
        pid = (created.get("project") or {}).get("id") or ""
        http(port, "/api/visual/project/source", "POST",
             {"projectId": pid, "sourceText": SOURCE})

        status, body = http(port, "/api/visual/project/scenes", "POST",
                            {"projectId": pid, "regenerate": True, "view": "workspace"})
        directory = (((body.get("project") or {}).get("workflowPreparedScript") or {})
                     .get("sceneDirectory") or [])
        step("提取大纲返回 project", status == 200 and bool(body.get("project")),
             f"status={status} err={body.get('error') or ''}")
        step("分场目录已写入", body.get("directoryReady") is True
             and len(directory) >= 2,
             f"scenes={len(directory)}")

        status, snap = http(port, f"/api/visual/macro/state?projectId={pid}")
        scenes = snap.get("scenes") or []
        step("宏快照顶层有原稿", status == 200
             and bool(str(snap.get("source") or "").strip())
             and bool(str(snap.get("currentSource") or "").strip()),
             f"source={len(str(snap.get('source') or ''))}字")
        step("宏快照每场有正文", len(scenes) >= 2
             and all(str(row.get("source") or "").strip() for row in scenes),
             f"scenes={len(scenes)}")

        # 补齐分镜：报价 → 提交 → 任务完成 → 快照里有分镜卡
        status, quote = http(port, "/api/visual/macro/quote", "POST",
                             {"projectId": pid, "action": "plan",
                              "source": str(snap.get("currentSource") or "")})
        step("宏报价给凭据", status == 200 and bool(quote.get("quoteId"))
             and quote.get("totalCredits", 0) > 0, f"quoteId={str(quote.get('quoteId'))[:8]}")

        status, submitted = http(port, "/api/visual/macro/submit", "POST",
                                 {"projectId": pid, "confirmed": True,
                                  "quoteId": quote.get("quoteId")})
        step("宏提交返回任务", status == 200 and bool(submitted.get("taskId")),
             f"status={status} err={submitted.get('error') or ''}")

        task = {}
        task_id = submitted.get("taskId") or ""
        deadline = time.time() + 120
        while task_id and time.time() < deadline:
            _, snap2 = http(port, f"/api/tasks/{task_id}")
            task = snap2.get("task") or snap2
            if task.get("state") in ("done", "error"):
                break
            time.sleep(1)
        step("补齐分镜任务完成", task.get("state") == "done",
             f"state={task.get('state')} result={str(task.get('result'))[:60]}")

        _, after = http(port, f"/api/visual/macro/state?projectId={pid}")
        cards = [card for scene in (after.get("scenes") or [])
                 for card in (scene.get("cards") or [])]
        step("快照已有分镜卡", bool(cards), f"cards={len(cards)}")

        failed = [r for r in STEPS if not r["ok"]]
        print(f"\n合计 {len(STEPS)} 步，失败 {len(failed)}")
        (ROOT / ".local" / "step13.json").write_text(
            json.dumps(STEPS, ensure_ascii=False, indent=1), encoding="utf-8")
        return 0 if not failed else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
