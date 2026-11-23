"""只跑 breakdown.analyze：验证 elements 是否回来。"""

from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
PID = sys.argv[1] if len(sys.argv) > 1 else "7ed89611b60a4cd7a2c3e463f53e1893"


def http(port: int, path: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data,
                                 headers=headers, method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode() or "{}")


def main() -> int:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="bd-analyze-"))
    for path in list(DATA.glob("*.db")) + list(DATA.glob("*.db-wal")) \
            + list(DATA.glob("*.db-shm")):
        shutil.copy2(path, tmp / path.name)
    for name in ("llm-profiles.json", "model-config.json"):
        shutil.copy2(DATA / name, tmp / name)
    shutil.copytree(DATA / "workspace" / "breakdown", tmp / "workspace" / "breakdown",
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
        started = http(port, "/api/breakdown/analyze",
                       {"projectId": PID, "start": 0, "limit": 15,
                        "rightsConfirmed": True})
        task = {}
        for _ in range(180):
            task = http(port, f"/api/tasks/{started['taskId']}")
            if task.get("state") in ("done", "error"):
                break
            time.sleep(1)
        project = http(port, f"/api/breakdown/project?id={PID}")["project"]
        analysis = project.get("analysis") or {}
        print("state", task.get("state"), "error", task.get("error") or "")
        print("shots", len(analysis.get("shots") or []),
              "elements", len(analysis.get("elements") or []))
        print("hook", str(analysis.get("hook") or "")[:100])
        return 0 if analysis.get("elements") else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
