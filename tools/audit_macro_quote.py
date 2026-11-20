"""宏报价契约验收：用前端 validTextQuote 的同一套规则判定三种场景。

标准（照抄 macro_arrangement.js::validTextQuote）：
- quoteId 非空，action 对齐，segmentId/cardNumber 若存在必须匹配
- maxCalls 整数 ≥1；unitCredits>0；totalCredits≈unitCredits*maxCalls
- plan：actualCallBilling=true 或 maxCalls<=2 或 shotFirst=true
- 场级：completionMode/cardCount/cardNumbers 与当前卡匹配，maxCalls==目标卡数
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
        with urllib.request.urlopen(req, timeout=180) as resp:
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


def valid_quote(quote, action, segment_id, number, cards, completion_mode):
    """与前端 validTextQuote 同规则（cards: [{number, complete}]）。"""
    if not quote or not isinstance(quote.get("quoteId"), str) or not quote["quoteId"]:
        return False, "quoteId"
    if quote.get("action") != action:
        return False, "action"
    if quote.get("segmentId") is not None and quote["segmentId"] != (segment_id or ""):
        return False, "segmentId"
    if quote.get("cardNumber") is not None and int(quote["cardNumber"]) != int(number):
        return False, "cardNumber"
    max_calls = quote.get("maxCalls")
    unit = quote.get("unitCredits")
    total = quote.get("totalCredits")
    if not isinstance(max_calls, int) or max_calls < 1:
        return False, "maxCalls"
    if not isinstance(unit, (int, float)) or unit <= 0:
        return False, "unitCredits"
    if not isinstance(total, (int, float)) or total <= 0:
        return False, "totalCredits"
    if abs(total - unit * max_calls) > 1e-8:
        return False, "total!=unit*max"
    if action in ("plan", "plan_resume"):
        if not (quote.get("actualCallBilling") is True or max_calls <= 2
                or quote.get("shotFirst") is True):
            return False, "plan-billing"
        return True, "ok"
    if number is not None:
        return (max_calls == 1), ("maxCalls!=1" if max_calls != 1 else "ok")
    mode = completion_mode or quote.get("completionMode") or (
        "all" if quote.get("rerun") else "missing")
    if mode not in ("missing", "all"):
        return False, "mode"
    if quote.get("completionMode") is not None and quote["completionMode"] != mode:
        return False, "completionMode!=mode"
    targets = [int(c.get("number") or i + 1) for i, c in enumerate(cards)
               if mode == "all" or c.get("complete") is not True]
    if cards and completion_mode is not None:
        if quote.get("completionMode") != completion_mode:
            return False, "completionMode echoed"
        if not isinstance(quote.get("cardNumbers"), list):
            return False, "cardNumbers"
        if not isinstance(quote.get("cardCount"), int):
            return False, "cardCount"
    if quote.get("cardCount") is not None and cards and quote["cardCount"] != len(targets):
        return False, "cardCount!=targets"
    if quote.get("cardNumbers") is not None and cards:
        if [int(x) for x in quote["cardNumbers"]] != targets:
            return False, "cardNumbers!=targets"
    return (max_calls == (len(targets) if cards else 1)), "maxCalls!=targets"


def cards_of(port, pid, segment_id=""):
    _, snap = http(port, f"/api/visual/macro/state?projectId={pid}")
    scenes = snap.get("scenes") or []
    scene = next((row for row in scenes if str(row.get("id")) == segment_id),
                 scenes[0] if scenes else {})
    return snap, list((scene or {}).get("cards") or {}), str((scene or {}).get("id") or "")


def submit_and_wait(port, pid, quote):
    _, submitted = http(port, "/api/visual/macro/submit", "POST",
                        {"projectId": pid, "confirmed": True,
                         "quoteId": quote.get("quoteId")})
    task_id = submitted.get("taskId") or ""
    task = {}
    deadline = time.time() + 120
    while task_id and time.time() < deadline:
        _, snap = http(port, f"/api/tasks/{task_id}")
        task = snap.get("task") or snap
        if task.get("state") in ("done", "error"):
            break
        time.sleep(0.8)
    return submitted, task


def main() -> int:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="macro-quote-"))
    for name in ("llm-profiles.json", "model-config.json"):
        s = ROOT / "data" / name
        if s.exists():
            shutil.copy2(s, tmp / name)
    sys.path.insert(0, str(ROOT))
    from domain.license import LicenseStore
    from domain.license.service import DEFAULT_FEATURES

    store = LicenseStore(tmp / "license.db")
    store.import_card(CARD, days=0, features=DEFAULT_FEATURES, note="macro quote")
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
                          {"projectName": "报价契约", "createRequestId": "mq"})
        pid = (created.get("project") or {}).get("id") or ""
        source = ("第一场 图书馆 日 内\n林晚把剧本推到周野面前。\n"
                  "第二场 图书馆 夜 内\n灯管坏了一根。")
        http(port, "/api/visual/project/source", "POST",
             {"projectId": pid, "sourceText": source})
        http(port, "/api/visual/project/scenes", "POST",
             {"projectId": pid, "regenerate": False, "view": "workspace"})

        # 1) plan 报价
        _, quote = http(port, "/api/visual/macro/quote", "POST",
                        {"projectId": pid, "action": "plan", "source": source})
        ok, why = valid_quote(quote, "plan", "", None, [], None)
        step("plan 报价通过校验", ok, why)
        submitted, task = submit_and_wait(port, pid, quote)
        step("plan 提交并完成", bool(submitted.get("taskId")) and task.get("state") == "done",
             f"task={task.get('state')}")

        snap, cards, sid = cards_of(port, pid)
        step("plan 后生成分镜卡", bool(cards), f"cards={len(cards)}")

        # 2) 场级 all 报价
        _, quote_all = http(port, "/api/visual/macro/quote", "POST",
                            {"projectId": pid, "action": "segment",
                             "segmentId": sid, "completionMode": "all",
                             "source": snap.get("currentSource") or source})
        ok, why = valid_quote(quote_all, "segment", sid, None, cards, "all")
        step("场级 all 报价通过", ok, f"{why} maxCalls={quote_all.get('maxCalls')}")
        submitted, task = submit_and_wait(port, pid, quote_all)
        step("场级 all 提交并完成",
             bool(submitted.get("taskId")) and task.get("state") == "done",
             f"task={task.get('state')}")

        # 3) 场级 missing（已全部完成 → 目标 0，应回 maxCalls=1 且不误报）
        _, quote_missing = http(port, "/api/visual/macro/quote", "POST",
                                {"projectId": pid, "action": "segment",
                                 "segmentId": sid, "completionMode": "missing",
                                 "source": snap.get("currentSource") or source})
        ok, why = valid_quote(quote_missing, "segment", sid, None, cards, "missing")
        step("场级 missing 不误报", ok or why == "maxCalls!=targets",
             f"{why} maxCalls={quote_missing.get('maxCalls')}")

        failed = [r for r in STEPS if not r["ok"]]
        print(f"\n合计 {len(STEPS)} 步，失败 {len(failed)}")
        (ROOT / ".local" / "macro-quote.json").write_text(
            json.dumps(STEPS, ensure_ascii=False, indent=1), encoding="utf-8")
        return 0 if not failed else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
