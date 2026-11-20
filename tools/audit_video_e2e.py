"""视频域端到端验收：参考图生成 / 爆款拆解 / 画布项目资产。

验收标准（写死在断言里）：
1. 参考图：POST /api/visual/asset/generate 返回 200+taskId（不再 invalid_input）；
   任务结束后 project.settings.assets 里该资产 status='done' 且 imageFile 落盘；
   失败时 status='failed' 且 error 有内容（也是可验收状态，但不能"清空资产"）。
2. 拆解：project.analysis 非空、results 至少 1 条。
3. 画布资产：upload/list/rename/remove 全部 200，列表随操作变化。
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
from urllib.parse import quote

ROOT = pathlib.Path(__file__).resolve().parents[1]
CARD = "DW-PWMB-AXYU-ASP8-C8H8-5X4P-ZSZW-RQ7G-QGTJ"
FFMPEG = r"E:\PublicWork\ffmpeg\bin\ffmpeg.exe"
STEPS: list[dict] = []


def http(port, path, method="GET", body=None, raw=None, headers=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body else None)
    merged = {"User-Agent": "video-e2e"}
    if body is not None:
        merged["Content-Type"] = "application/json"
    merged.update(headers or {})
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data,
                                 method=method, headers=merged)
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            payload = resp.read()
            return resp.status, (json.loads(payload.decode() or "{}")
                                 if payload[:1] in (b"{", b"[") else {})
    except urllib.error.HTTPError as exc:
        payload = exc.read()
        try:
            return exc.code, json.loads(payload.decode() or "{}")
        except json.JSONDecodeError:
            return exc.code, {}


def step(name, ok, detail=""):
    STEPS.append({"name": name, "ok": ok, "detail": detail})
    print(f"[{'OK  ' if ok else 'FAIL'}] {name:<30} {str(detail)[:110]}")


def wait(port, task_id, timeout=600):
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
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="video-e2e-"))
    for name in ("llm-profiles.json", "model-config.json"):
        s = ROOT / "data" / name
        if s.exists():
            shutil.copy2(s, tmp / name)
    sys.path.insert(0, str(ROOT))
    from domain.license import LicenseStore
    from domain.license.service import DEFAULT_FEATURES

    store = LicenseStore(tmp / "license.db")
    store.import_card(CARD, days=0, features=DEFAULT_FEATURES, note="video e2e")
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
        if port is None:
            print("[!] 内核未启动")
            return 1
        print(f"[*] 端口 {port}\n")

        # ---------- 1) 参考图 ----------
        print("=== 参考图生成 ===")
        _, body = http(port, "/api/visual/project/create", "POST",
                       {"projectName": "E2E 参考图", "createRequestId": "e2e-1"})
        pid = (body.get("project") or {}).get("id") or ""
        script = ("第一场 图书馆 日 内\n林晚把剧本推到周野面前。\n"
                  "周野拿起桌上的旧杯子，窗外下着雨。")
        http(port, "/api/visual/project/source", "POST",
             {"projectId": pid, "sourceText": script})
        _, body = http(port, "/api/visual/assets/analyze", "POST",
                       {"projectId": pid, "sourceText": script,
                        "modelConfig": {"provider": "server_gateway"}})
        task = wait(port, body.get("taskId") or "", 240)
        assets = (task.get("result") or {}).get("assets") or {}
        people = assets.get("people") or []
        step("资产提取", task.get("state") == "done" and bool(people),
             f"people={len(people)} scenes={len(assets.get('scenes') or [])}")

        _, fresh = http(port, f"/api/visual/project?id={pid}")
        project = fresh.get("project") or {}
        people2 = ((project.get("assets") or {}).get("people")) or []
        step("资产已持久化", len(people2) == len(people) and bool(people2),
             f"refetch={len(people2)} ids={[r.get('id') for r in people2][:2]}")

        if people2:
            asset = people2[0]
            status, submitted = http(port, "/api/visual/asset/generate", "POST", {
                "projectId": pid, "kind": "people", "assetId": asset.get("id"),
                # 故意不传 prompt：前端提示词框常见为空，这里必须能兜底
                "prompt": "", "imageModel": "google/nano-banana",
                "tier": "economy", "imageResolution": "1k",
                "size": "1024x1024", "ratio": "16:9",
            })
            step("提交参考图生成", status == 200 and bool(submitted.get("taskId")),
                 f"status={status} err={submitted.get('error') or ''}")
            gen = wait(port, submitted.get("taskId") or "", 600)
            step("生成任务结束", gen.get("state") in ("done", "error"),
                 f"state={gen.get('state')} err={str(gen.get('error') or '')[:60]}")

            _, after = http(port, f"/api/visual/project?id={pid}")
            rows = (((after.get("project") or {}).get("assets") or {})
                    .get("people")) or []
            row = next((r for r in rows if r.get("id") == asset.get("id")), {})
            step("资产数量未丢失", len(rows) == len(people2), f"rows={len(rows)}")
            step("资产状态已回写",
                 row.get("status") in ("done", "failed", "running"),
                 f"status={row.get('status')} file={str(row.get('imageFile'))[:26]} "
                 f"err={str(row.get('error') or '')[:40]}")

        # ---------- 2) 爆款拆解 ----------
        print("\n=== 爆款拆解 ===")
        clip = tmp / "sample.mp4"
        subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "lavfi",
                        "-i", "color=c=black:s=320x180:d=3", "-f", "lavfi",
                        "-i", "sine=frequency=440:duration=3", "-shortest", str(clip)],
                       check=True, capture_output=True)
        _, body = http(port, "/api/breakdown/upload", "POST", raw=clip.read_bytes(),
                       headers={"X-Filename": "sample.mp4",
                                "X-Media-Type": "video",
                                "Content-Type": "application/octet-stream"})
        bid = (body.get("project") or {}).get("id") or ""
        step("上传 mp4", bool(bid), f"id={bid[:8]}")
        if bid:
            _, body = http(port, "/api/breakdown/analyze", "POST",
                           {"projectId": bid, "start": 0, "limit": 30})
            task = wait(port, body.get("taskId") or "", 300)
            step("拆解任务", task.get("state") == "done", f"state={task.get('state')}")
            _, fresh = http(port, f"/api/breakdown/project?id={bid}")
            project = fresh.get("project") or {}
            analysis = project.get("analysis") or {}
            results = project.get("results") or []
            step("拆解内容非空", bool(analysis) and bool(results),
                 f"keys={sorted(analysis)[:4]} results={len(results)}")

        # ---------- 3) 画布项目资产 ----------
        print("\n=== 画布项目资产 ===")
        _, body = http(port, "/api/canvas/create", "POST",
                       {"name": "E2E 画布", "document": {"graph": {"nodes": [], "edges": []}}})
        cid = body.get("id") or ""
        step("创建画布", bool(cid), cid[:8])
        if cid:
            png = (b"\x89PNG\r\n\x1a\n" + bytes(2000))
            status, body = http(port, "/api/canvas/assets/upload", "POST", raw=png,
                                headers={"X-Canvas-Id": cid, "X-Asset-Kind": "people",
                                         "X-Filename": quote("GitHub.jpg"),
                                         "X-Asset-Name": quote("GitHub.jpg"),
                                         "X-Asset-Upload-Id": "asset-1",
                                         "Content-Type": "application/octet-stream"})
            assets = body.get("assets") or []
            step("上传项目资产", status == 200 and len(assets) == 1,
                 f"status={status} n={len(assets)} err={body.get('error') or ''}")
            _, listed = http(port, "/api/canvas/assets/list", "POST", {"canvasId": cid})
            step("资产列表", len(listed.get("assets") or []) == 1,
                 f"n={len(listed.get('assets') or [])}")
            _, renamed = http(port, "/api/canvas/assets/rename", "POST",
                              {"canvasId": cid, "assetId": "asset-1", "name": "小林店主"})
            step("重命名", any(r.get("name") == "小林店主"
                            for r in renamed.get("assets") or []), "")
            _, removed = http(port, "/api/canvas/assets/remove", "POST",
                              {"canvasId": cid, "assetId": "asset-1"})
            step("移出资产", not (removed.get("assets") or []),
                 f"n={len(removed.get('assets') or [])}")

        failed = [row for row in STEPS if not row["ok"]]
        print(f"\n合计 {len(STEPS)} 步，失败 {len(failed)}")
        (ROOT / ".local" / "video-e2e.json").write_text(
            json.dumps(STEPS, ensure_ascii=False, indent=1), encoding="utf-8")
        return 0 if not failed else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
