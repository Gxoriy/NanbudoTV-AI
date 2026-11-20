"""步骤 02 深链验收：资产 hash（下一步分镜守卫）+ 匹配弹窗数据结构 + 继承。

验收标准：
1. 资产提取后 project.workflowAssetSourceHash 非空（前端 openCutModeDialog 的守卫）
2. matches 返回**每个资产一行**，字段含 targetKey/name/kind/status/candidates，
   统计与行状态一致（total == 行数）
3. inherit 按 {targetKey,versionId} 命中后写入 imageFile，且数量守恒
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
    print(f"[{'OK  ' if ok else 'FAIL'}] {name:<32} {str(detail)[:110]}")


def wait(port, task_id, timeout=300):
    deadline = time.time() + timeout
    task = {}
    while time.time() < deadline:
        _, snap = http(port, f"/api/tasks/{task_id}")
        task = snap.get("task") or snap
        if task.get("state") in ("done", "error"):
            return task
        time.sleep(2)
    return task


def main() -> int:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="step2b-"))
    for name in ("llm-profiles.json", "model-config.json"):
        s = ROOT / "data" / name
        if s.exists():
            shutil.copy2(s, tmp / name)
    sys.path.insert(0, str(ROOT))
    from domain.license import LicenseStore
    from domain.license.service import DEFAULT_FEATURES

    store = LicenseStore(tmp / "license.db")
    store.import_card(CARD, days=0, features=DEFAULT_FEATURES, note="step2b")
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
                          {"projectName": "步骤02深链", "createRequestId": "s2b"})
        pid = (created.get("project") or {}).get("id") or ""
        script = ("第一场 图书馆 日 内\n林晚把剧本推到周野面前。\n"
                  "第二场 图书馆 夜 内\n灯管坏了一根，雨声盖过翻页的声音。")
        http(port, "/api/visual/project/source", "POST",
             {"projectId": pid, "sourceText": script})
        _, submitted = http(port, "/api/visual/assets/analyze", "POST",
                            {"projectId": pid, "sourceText": script,
                             "modelConfig": {"provider": "server_gateway"}})
        task = wait(port, submitted.get("taskId") or "")
        step("资产提取完成", task.get("state") == "done", f"state={task.get('state')}")

        _, project = http(port, f"/api/visual/project?id={pid}")
        body = project.get("project") or {}
        step("资产 hash 已写入", bool(body.get("workflowAssetSourceHash")),
             f"hash={body.get('workflowAssetSourceHash')}")

        # 造一条同名库资产，验证匹配与继承
        add_status, added = http(port, "/api/asset-library/add", "POST",
                                 {"name": "林晚",
                                  "file": "assets/library-linwan.png",
                                  "kind": "people"})
        print("[dbg] add:", add_status, str(added)[:120])
        status, matched = http(port, f"/api/asset-library/matches?projectId={pid}")
        targets = matched.get("targets") or []
        row = next((r for r in targets if r.get("name") == "林晚"), {})
        print("[dbg] first:", [(t.get("name"), t.get("kind"), t.get("status"))
                               for t in targets][:4])
        step("matches 每项一行", status == 200 and len(targets)
             == int(matched.get("totalAssets") or 0),
             f"rows={len(targets)} total={matched.get('totalAssets')}")
        step("命中推荐与候选", matched.get("recommendedAssets", 0) >= 1
             and bool(row.get("candidates"))
             and row.get("status") == "recommended",
             f"status={row.get('status')} cand={len(row.get('candidates') or [])}")
        step("候选带可用图片地址",
             str(((row.get("candidates") or [{}])[0]).get("url", "")).startswith(
                 "/api/asset-library/image?"),
             str(((row.get("candidates") or [{}])[0]).get("url", ""))[:60])

        version = ((row.get("candidates") or [{}])[0]).get("versionId")
        status, applied = http(port, "/api/asset-library/inherit", "POST",
                               {"projectId": pid,
                                "matchToken": matched.get("matchToken"),
                                "selections": [{"targetKey": row.get("targetKey"),
                                                "versionId": version}]})
        _, after = http(port, f"/api/visual/project?id={pid}")
        rows = (((after.get("project") or {}).get("assets") or {})
                .get("people")) or []
        picked = next((r for r in rows if r.get("id") == row.get("targetKey")), {})
        step("继承写入 imageFile", status == 200
             and picked.get("imageFile") == "assets/library-linwan.png",
             f"inherited={applied.get('inherited')} file={picked.get('imageFile')}")

        failed = [r for r in STEPS if not r["ok"]]
        print(f"\n合计 {len(STEPS)} 步，失败 {len(failed)}")
        (ROOT / ".local" / "step2b.json").write_text(
            json.dumps(STEPS, ensure_ascii=False, indent=1), encoding="utf-8")
        return 0 if not failed else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
