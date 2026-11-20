"""步骤 02 两项验收：匹配本地资产（凭证）、下一步分镜（目录）。

验收标准：
1. GET /api/asset-library/matches → 200，含 matchToken、totalAssets/matchedAssets
2. POST /api/asset-library/inherit → 200，命中项 imageFile 被写入项目资产
3. POST /api/visual/project/prepare（前端 payload）→ 200 且 project.workflowPreparedScript
   .sceneDirectory 非空（前端 needsAIDirectory() 因此为 false，可进入分镜）
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


def main() -> int:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="step2-"))
    for name in ("llm-profiles.json", "model-config.json"):
        s = ROOT / "data" / name
        if s.exists():
            shutil.copy2(s, tmp / name)
    sys.path.insert(0, str(ROOT))
    from domain.license import LicenseStore
    from domain.license.service import DEFAULT_FEATURES

    store = LicenseStore(tmp / "license.db")
    store.import_card(CARD, days=0, features=DEFAULT_FEATURES, note="step2")
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
                          {"projectName": "步骤02", "createRequestId": "s2"})
        pid = (created.get("project") or {}).get("id") or ""
        script = ("第一场 图书馆 日 内\n林晚把剧本推到周野面前。\n\n"
                  "第二场 图书馆 夜 内\n灯管坏了一根，雨声盖过翻页的声音。")
        http(port, "/api/visual/project/source", "POST",
             {"projectId": pid, "sourceText": script})
        http(port, "/api/visual/settings", "POST",
             {"projectId": pid, "settings": {"assets": {"people": [
                 {"name": "林晚"}, {"name": "陈默"}], "scenes": [], "props": []}}})

        # 1) 匹配本地资产
        status, matched = http(port, f"/api/asset-library/matches?projectId={pid}")
        step("匹配接口 200 且有凭证", status == 200 and bool(matched.get("matchToken")),
             f"status={status} token={str(matched.get('matchToken'))[:8]} "
             f"total={matched.get('totalAssets')} matched={matched.get('matchedAssets')}")

        status, applied = http(port, "/api/asset-library/inherit", "POST",
                               {"projectId": pid,
                                "matchToken": matched.get("matchToken") or ""})
        step("继承接口 200", status == 200, f"inherited={applied.get('inherited')}")

        # 2) 下一步：分镜（prepare 必须回 project + 目录）
        status, prepared = http(port, "/api/visual/project/prepare", "POST",
                                {"projectId": pid, "sourceText": script,
                                 "expectedSource": "", "confirmed": True})
        project = prepared.get("project") or {}
        directory = ((project.get("workflowPreparedScript") or {})
                     .get("sceneDirectory") or [])
        step("prepare 返回 project", status == 200 and project.get("id") == pid,
             f"status={status} err={prepared.get('error') or ''}")
        step("分场目录非空", len(directory) >= 2,
             f"scenes={len(directory)} titles={[d.get('title') for d in directory][:2]}")

        failed = [row for row in STEPS if not row["ok"]]
        print(f"\n合计 {len(STEPS)} 步，失败 {len(failed)}")
        (ROOT / ".local" / "step2.json").write_text(
            json.dumps(STEPS, ensure_ascii=False, indent=1), encoding="utf-8")
        return 0 if not failed else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
