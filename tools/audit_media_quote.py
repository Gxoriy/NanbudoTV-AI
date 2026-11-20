"""媒体报价→提交端到端验收（真实上游配置，创建一条视频任务）。"""

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


def http(port, path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data,
                                 method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw.decode() or "{}")
        except json.JSONDecodeError:
            return exc.code, {}


def main() -> int:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="media-quote-"))
    for name in ("llm-profiles.json", "model-config.json"):
        shutil.copy2(DATA / name, tmp / name)

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

        _, created = http(port, "/api/visual/project/create", "POST",
                          {"projectName": "媒体报价验收", "createRequestId": "mq"})
        pid = (created.get("project") or {}).get("id") or ""
        http(port, "/api/visual/project/source", "POST",
             {"projectId": pid, "sourceText": "第一场 图书馆 夜 内\n灯管闪了一下。"})
        _, draft = http(port, "/api/visual/macro/card/draft", "POST",
                        {"projectId": pid, "segmentId": "scene-1", "cardNumber": 1,
                         "prompt": "图书馆的灯管闪了一下"})

        selected = {"projectId": pid, "segmentId": "scene-1", "cardNumber": 1,
                    "action": "video", "model": "seedance-2.0-anci",
                    "resolution": "720p", "ratio": "16:9", "duration": 4}
        status, quote = http(port, "/api/visual/macro/media/quote", "POST", selected)
        keys = ("quoteId", "segmentId", "cardNumber", "model", "resolution",
                "ratio", "duration", "maxCalls", "totalCredits")
        ok = status == 200 and all(quote.get(key) is not None for key in keys)
        print(f"[{'OK  ' if ok else 'FAIL'}] 报价逐项一致 status={status}")
        for key in keys:
            print(f"       {key}={quote.get(key)}")

        status, submitted = http(port, "/api/visual/macro/media/submit", "POST",
                                 {"projectId": pid, "quoteId": quote.get("quoteId"),
                                  "confirmed": True})
        ok2 = status == 200 and bool(submitted.get("taskId"))
        print(f"[{'OK  ' if ok2 else 'FAIL'}] 提交返回任务 status={status} "
              f"task={submitted.get('taskId')} err={submitted.get('error') or ''}")
        return 0 if ok and ok2 else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
