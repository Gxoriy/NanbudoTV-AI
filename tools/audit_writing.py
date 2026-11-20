"""实盘审计三条写作链：剧本改写 / 一键创作 / 小说转剧本。

不是只看"路由注册了没有"，而是用前端真实 payload 调用并轮询任务，断言结果字段
（前端拿到字段不对就会显示"正在设计差异化方案… 0%"或直接 invalid_input）。

用法：python tools/audit_writing.py
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


def http(port: int, path: str, method: str = "GET", body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    headers["User-Agent"] = "writing-audit"
    request = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data,
                                     method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=180) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw.decode() or "{}")
        except json.JSONDecodeError:
            return exc.code, {}


def step(name: str, ok: bool, detail: str = "") -> None:
    STEPS.append({"name": name, "ok": ok, "detail": detail})
    print(f"[{'OK  ' if ok else 'FAIL'}] {name:<30} {detail[:110]}")


def wait_task(port: int, task_id: str, timeout: float = 360.0) -> dict:
    deadline = time.time() + timeout
    task: dict = {}
    while time.time() < deadline:
        _, snap = http(port, f"/api/tasks/{task_id}")
        task = snap.get("task") or snap
        if task.get("state") in ("done", "error"):
            return task
        time.sleep(1.5)
    return task


def submit(port: int, path: str, payload: dict, label: str, *, check=None) -> None:
    status, body = http(port, path, "POST", payload)
    if status != 200 or not body.get("taskId"):
        step(label, False, f"status={status} err={body.get('error') or ''}")
        return
    task = wait_task(port, body["taskId"])
    result = task.get("result") or {}
    ok = task.get("state") == "done" and (check(result) if check else True)
    step(label, ok,
         f"state={task.get('state')} err={str(task.get('error') or '')[:50]} "
         f"keys={sorted(result)[:6]}")


def main() -> int:
    data_dir = pathlib.Path(tempfile.mkdtemp(prefix="writing-audit-"))
    for name in ("llm-profiles.json", "model-config.json"):
        source = ROOT / "data" / name
        if source.exists():
            shutil.copy2(source, data_dir / name)
    sys.path.insert(0, str(ROOT))
    from domain.license import LicenseStore
    from domain.license.service import DEFAULT_FEATURES

    store = LicenseStore(data_dir / "license.db")
    store.import_card(CARD, days=0, features=DEFAULT_FEATURES, note="writing audit")
    store.close()

    proc = subprocess.Popen([sys.executable, "-m", "app.main", "--no-gui", "--port", "0",
                             "--data-dir", str(data_dir)], cwd=str(ROOT),
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        port = None
        for _ in range(120):
            files = list(data_dir.glob("runtime-*.json"))
            if files:
                port = json.loads(files[0].read_text(encoding="utf-8"))["port"]
                break
            time.sleep(0.3)
        if port is None:
            print("[!] 内核未启动")
            return 1
        print(f"[*] 端口 {port}\n")

        source_text = ("第一场 图书馆 日 内\n林晚把剧本推到周野面前：这段冲突太软。\n"
                       "周野没有接，只把杯子往她那边挪了半寸。\n"
                       "第二场 图书馆 夜 内\n灯管坏了一根，雨声盖过翻页的声音。")

        print("=== D1-1 剧本改写 ===")
        submit(port, "/api/source/proposals",
               {"sourceText": source_text, "sourceScriptKey": "audit|1|1",
                "settings": {"projectName": "审计项目"},
                "modelConfig": {"provider": "custom"}},
               "差异化提案（3 套）",
               check=lambda r: len(r.get("proposals") or []) >= 3
               and all(p.get("title") for p in r["proposals"]))
        submit(port, "/api/source/proposal-refine",
               {"proposal": {"id": "A", "title": "雨夜对峙", "hook": "剧本太软",
                             "summary": "图书馆争执", "score": 78},
                "instruction": "加强冲突与悬念",
                "sourceText": source_text, "sourceScriptKey": "audit|1|1",
                "settings": {}, "modelConfig": {"provider": "custom"}},
               "单套提案优化",
               check=lambda r: bool(r.get("proposals")))

        print("\n=== D1-2 一键创作 ===")
        submit(port, "/api/original/recommend",
               {"action": "settings",
                "settings": {"originalTheme": "外卖员雨夜送餐",
                             "protagonistGender": "女", "storyEra": "当代"},
                "modelConfig": {"provider": "custom"}},
               "原创设定推荐",
               check=lambda r: bool(r.get("recommendation")))
        submit(port, "/api/original/field-optimize",
               {"field": "originalTheme",
                "settings": {"originalTheme": "外卖员雨夜送餐"},
                "modelConfig": {"provider": "custom"}},
               "单项字段优化",
               check=lambda r: bool(r.get("text")) and r.get("field") == "originalTheme")

        print("\n=== D1-3 小说转剧本 ===")
        novel = ("林晚在图书馆待到熄灯。她把改写过七遍的剧本塞进帆布袋，"
                 "窗外雨下得很密。周野站在书架那头，手里拿着同一份稿子的旧版本。"
                 "他问她为什么把结局改了。她说，因为真实的结局不该是一个人走。") * 5
        submit(port, "/api/novel-screenplay/start",
               {"sourceText": novel, "requirements": "保留雨夜氛围，增加对话冲突",
                "style": "短剧", "episodeSeconds": 60, "episodeCount": 3,
                "priorContext": "", "quoteKey": "audit",
                "auxReceiptId": "audit-receipt-1"},
               "小说转剧本",
               check=lambda r: bool(str(r.get("screenplay") or "").strip()))

        failed = [row for row in STEPS if not row["ok"]]
        print(f"\n合计 {len(STEPS)} 步，失败 {len(failed)}")
        (ROOT / ".local" / "writing-audit.json").write_text(
            json.dumps(STEPS, ensure_ascii=False, indent=1), encoding="utf-8")
        return 0 if not failed else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
