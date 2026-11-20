"""实盘审计三处视频相关修复：资产提取 / 爆款拆解结果 / 画布删除。"""

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


def http(port, path, method="GET", body=None, raw=None, headers=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body else None)
    merged = {"User-Agent": "video-audit"}
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
        raw_resp = exc.read()
        try:
            return exc.code, json.loads(raw_resp.decode() or "{}")
        except json.JSONDecodeError:
            return exc.code, {}


def step(name, ok, detail=""):
    STEPS.append({"name": name, "ok": ok, "detail": detail})
    print(f"[{'OK  ' if ok else 'FAIL'}] {name:<28} {detail[:110]}")


def wait_task(port, task_id, timeout=300):
    deadline = time.time() + timeout
    task = {}
    while time.time() < deadline:
        _, snap = http(port, f"/api/tasks/{task_id}")
        task = snap.get("task") or snap
        if task.get("state") in ("done", "error"):
            return task
        time.sleep(1.5)
    return task


def main() -> int:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="video-audit-"))
    for name in ("llm-profiles.json", "model-config.json"):
        s = ROOT / "data" / name
        if s.exists():
            shutil.copy2(s, tmp / name)
    sys.path.insert(0, str(ROOT))
    from domain.license import LicenseStore
    from domain.license.service import DEFAULT_FEATURES

    store = LicenseStore(tmp / "license.db")
    store.import_card(CARD, days=0, features=DEFAULT_FEATURES, note="video audit")
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

        # ---------- 1) 资产提取 ----------
        print("=== 视觉：剧本资产提取 ===")
        _, body = http(port, "/api/visual/project/create", "POST",
                       {"projectName": "视频域审计", "createRequestId": "va-1"})
        pid = (body.get("project") or {}).get("id") or ""
        script = ("第一场 图书馆 日 内\n林晚把剧本推到周野面前。\n"
                  "周野拿起桌上的旧杯子，窗外下着雨。")
        http(port, "/api/visual/project/source", "POST",
             {"projectId": pid, "sourceText": script})
        status, body = http(port, "/api/visual/assets/analyze", "POST",
                            {"projectId": pid, "sourceText": script,
                             "sourceProjectId": pid, "regenerate": False,
                             "modelConfig": {"provider": "server_gateway"}})
        task = wait_task(port, body.get("taskId") or "")
        result = task.get("result") or {}
        counts = result.get("assetCounts") or {}
        step("资产识别任务", status == 200 and task.get("state") == "done",
             f"state={task.get('state')} err={task.get('error') or ''}")
        step("返回项目与资产计数", bool(result.get("project"))
             and sum(counts.values()) > 0, json.dumps(counts, ensure_ascii=False))

        # ---------- 2) 爆款拆解 ----------
        print("\n=== 爆款拆解：结果可见 ===")
        ffmpeg = r"E:\PublicWork\ffmpeg\bin\ffmpeg.exe"
        clip = tmp / "sample.mp4"
        subprocess.run([ffmpeg, "-v", "error", "-y", "-f", "lavfi",
                        "-i", "color=c=black:s=320x180:d=3", "-f", "lavfi",
                        "-i", "sine=frequency=440:duration=3", "-shortest",
                        str(clip)], check=True, capture_output=True)
        status, body = http(port, "/api/breakdown/upload", "POST",
                            raw=clip.read_bytes(),
                            headers={"X-Filename": "sample.mp4",
                                     "Content-Type": "application/octet-stream"})
        bid = str((body.get("project") or {}).get("id")
                  or body.get("projectId") or body.get("id") or "")
        step("上传拆解素材", status == 200 and bool(bid),
             f"id={bid[:10]} body={str(body)[:90]}")
        if bid:
            status, body = http(port, "/api/breakdown/analyze", "POST",
                                {"projectId": bid, "start": 0, "limit": 30})
            task = wait_task(port, body.get("taskId") or "")
            _, fresh = http(port, f"/api/breakdown/project?id={bid}")
            project = fresh.get("project") or {}
            results = project.get("payload", {}).get("results") or project.get("results") or []
            step("拆解任务完成", task.get("state") == "done",
                 f"state={task.get('state')}")
            step("结果列表可见", len(results) > 0,
                 f"results={len(results)} files={[r.get('file') for r in results[:1]]}")

        # ---------- 3) 画布删除 ----------
        print("\n=== 画布：删除后列表消失 ===")
        status, body = http(port, "/api/canvas/create", "POST",
                            {"name": "审计画布", "document": {"nodes": []}})
        cid = str(body.get("id") or (body.get("canvas") or {}).get("id") or "")
        step("创建画布", status == 200 and bool(cid), cid[:10])
        if cid:
            status, body = http(port, "/api/canvas/delete", "POST", {"id": cid})
            _, listed = http(port, "/api/canvas/list")
            ids = [row.get("id") for row in listed.get("canvases") or []]
            step("删除接口 200", status == 200,
                 f"deleted={body.get('deleted')} pending={body.get('pending')}")
            step("列表不再显示", cid not in ids, f"left={ids[:3]}")

        failed = [r for r in STEPS if not r["ok"]]
        print(f"\n合计 {len(STEPS)} 步，失败 {len(failed)}")
        (ROOT / ".local" / "video-audit.json").write_text(
            json.dumps(STEPS, ensure_ascii=False, indent=1), encoding="utf-8")
        return 0 if not failed else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
