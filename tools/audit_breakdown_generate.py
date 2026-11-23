"""只跑 breakdown.generate：真实项目副本 → 视频任务 → 结果列表。"""

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
DATA = ROOT / "data"
PID = sys.argv[1] if len(sys.argv) > 1 else "7ed89611b60a4cd7a2c3e463f53e1893"


def http(port: int, path: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data,
                                 headers=headers, method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        print("[HTTP]", exc.code, path,
              (exc.read() or b"")[:200].decode("utf-8", "replace"))
        raise


def main() -> int:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="bd-generate-"))
    for path in list(DATA.glob("*.db")) + list(DATA.glob("*.db-wal")) \
            + list(DATA.glob("*.db-shm")):
        shutil.copy2(path, tmp / path.name)
    for name in ("llm-profiles.json", "model-config.json"):
        shutil.copy2(DATA / name, tmp / name)
    source = DATA / "workspace" / "breakdown"
    if source.exists():
        shutil.copytree(source, tmp / "workspace" / "breakdown", dirs_exist_ok=True)

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
        project = http(port, f"/api/breakdown/project?id={PID}")["project"]
        analysis = project.get("analysis") or {}
        print("[*] project", PID, "shots", len(analysis.get("shots") or []),
              "elements", len(analysis.get("elements") or []))

        generated = http(port, "/api/breakdown/generate", {
            "projectId": PID, "model": "seedance-2.0-anci", "mode": "creative",
            "referenceStrategy": "source", "duration": 5, "resolution": "480p",
            "ratio": "9:16", "extra": "", "rightsConfirmed": True,
            "billingConfirmed": True})
        task_id = generated["taskId"]
        print("[*] generate task", task_id)
        task = {}
        for i in range(720):
            task = http(port, f"/api/tasks/{task_id}")
            if i % 10 == 0 or task.get("state") in ("done", "error"):
                print(i, task.get("state"), task.get("progress"),
                      (task.get("message") or "")[:50],
                      "err", task.get("error") or task.get("errorCode") or "")
            if task.get("state") in ("done", "error"):
                break
            time.sleep(1)
        print("[*] outer result", str(task.get("result"))[:400])
        video_id = str((task.get("result") or {}).get("videoTaskId") or "")
        if video_id:
            inner = http(port, f"/api/tasks/{video_id}")
            print("[*] video task", inner.get("state"),
                  str(inner.get("error") or inner.get("errorCode") or "")[:120],
                  str(inner.get("result"))[:300])
        project = http(port, f"/api/breakdown/project?id={PID}")["project"]
        videos = [row for row in (project.get("results") or [])
                  if str(row.get("file") or "").endswith(".mp4")]
        print(f"[{'OK  ' if videos else 'FAIL'}] 结果视频 {len(videos)}")
        for row in videos[-3:]:
            print("   ", row.get("name"), row.get("file"),
                  row.get("upstreamTaskId"))
        return 0 if videos else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
