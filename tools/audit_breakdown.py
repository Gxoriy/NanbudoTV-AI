"""爆款拆解端到端验收：真实项目副本 → 抽帧分析 → 视频生成 → 前端结果。"""

from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.error

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
# 最近一次“素材不可读”的真实项目
PID = "ea394c3d981743af9a62471ba459f535"


def http(port: int, path: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data,
                                 headers=headers, method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        print("[HTTP]", exc.code, path, (exc.read() or b"")[:180].decode("utf-8", "replace"))
        raise


def wait_task(port: int, task_id: str, limit: int = 180) -> dict:
    for _ in range(limit):
        result = http(port, f"/api/tasks/{task_id}")
        task = result.get("task") or result
        if task.get("state") in ("done", "error"):
            return task
        time.sleep(1)
    return {"state": "timeout"}


def main() -> int:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="breakdown-audit-"))
    for path in list(DATA.glob("*.db")) + list(DATA.glob("*.db-wal")) \
            + list(DATA.glob("*.db-shm")):
        shutil.copy2(path, tmp / path.name)
    for name in ("llm-profiles.json", "model-config.json"):
        shutil.copy2(DATA / name, tmp / name)
    source = DATA / "workspace" / "breakdown"
    if source.exists():
        shutil.copytree(source, tmp / "workspace" / "breakdown",
                        dirs_exist_ok=True)

    proc = subprocess.Popen([sys.executable, "-m", "app.main", "--no-gui", "--port", "0",
                             "--data-dir", str(tmp)], cwd=str(ROOT),
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        port = None
        for _ in range(100):
            files = list(tmp.glob("runtime-*.json"))
            if files:
                port = json.loads(files[0].read_text(encoding="utf-8"))["port"]
                break
            time.sleep(0.3)
        print("[*] port", port)
        listed = http(port, "/api/breakdown/projects")
        print("[*] breakdown projects",
              ([row.get("id") for row in (listed.get("projects") or [])], PID in [row.get("id") for row in (listed.get("projects") or [])]))

        analyze = http(port, "/api/breakdown/analyze", {
            "projectId": PID, "model": "qwen4-max", "analysisMode": "detailed",
            "start": 0, "limit": 15, "rightsConfirmed": True})
        task = wait_task(port, analyze["taskId"], limit=600)
        print("[*] analyze state", task.get("state"),
              "err", task.get("error") or "", "msg", task.get("message") or "",
              "result", str(task.get("result"))[:260])
        project = http(port, f"/api/breakdown/project?id={PID}")["project"]
        analysis = project.get("analysis") or {}
        shots = analysis.get("shots") or []
        print(f"[{'OK  ' if shots else 'FAIL'}] 拆解有镜头结果  shots={len(shots)} "
              f"frames={(analysis.get('performance') or {}).get('sampledFrames')}")
        print("     hook=", str(analysis.get("hook") or "")[:80])

        generate = http(port, "/api/breakdown/generate", {
            "projectId": PID, "model": "seedance-2.0-anci", "mode": "creative",
            "referenceStrategy": "text", "duration": 5, "resolution": "720p",
            "ratio": "9:16", "extra": "", "rightsConfirmed": True,
            "billingConfirmed": True})
        task2 = wait_task(port, generate["taskId"], limit=700)
        video_id = str((task2.get("result") or {}).get("videoTaskId") or "")
        if video_id:
            inner = wait_task(port, video_id, limit=700)
            print("[*] video task", inner.get("state"),
                  "err", inner.get("error") or "",
                  "result", str(inner.get("result"))[:220])
        print("[*] generate state", task2.get("state"),
              "err", task2.get("error") or "",
              "result", str(task2.get("result"))[:300])
        project = http(port, f"/api/breakdown/project?id={PID}")["project"]
        videos = [row for row in (project.get("results") or [])
                  if str(row.get("file") or "").endswith(".mp4")]
        ok = bool(videos) and task2.get("state") == "done"
        print(f"[{'OK  ' if ok else 'FAIL'}] 结果列表有视频  videos={len(videos)}")
        for row in videos[-2:]:
            print("    ", row.get("name"), row.get("file"),
                  row.get("upstreamTaskId"))
        return 0 if ok and shots else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
