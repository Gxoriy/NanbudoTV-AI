"""验收「视频对白自动识别」：真合成一段中文语音 → 上传 → 异步识别 → 断言出文本。

覆盖前端真实契约：POST /api/transcribe {videoId, modelSize} → {taskId} → 轮询任务
→ {transcript, meta:{segment_count,duration}}。之前这里返回 400 invalid_input。

用法：python tools/repro_asr.py [--keep]
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
SAMPLE_TEXT = "第一场，图书馆，白天。林晚把剧本推到周野面前，说这段冲突太软。"
steps: list[dict] = []


def http(port: int, path: str, method: str = "GET", body: dict | None = None,
         raw: bytes | None = None, headers: dict[str, str] | None = None):
    data = raw if raw is not None else (json.dumps(body).encode() if body else None)
    merged = {"User-Agent": "asr-repro"}
    if body is not None:
        merged["Content-Type"] = "application/json"
    merged.update(headers or {})
    request = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data,
                                     method=method, headers=merged)
    try:
        with urllib.request.urlopen(request, timeout=120) as resp:
            payload = resp.read()
            return resp.status, (json.loads(payload.decode() or "{}")
                                 if payload[:1] in (b"{", b"[") else {})
    except urllib.error.HTTPError as exc:
        payload = exc.read()
        try:
            return exc.code, json.loads(payload.decode() or "{}")
        except json.JSONDecodeError:
            return exc.code, {}


def step(name: str, ok: bool, detail: str = "") -> None:
    steps.append({"name": name, "ok": ok, "detail": detail})
    print(f"[{'OK  ' if ok else 'FAIL'}] {name:<26} {detail[:100]}")


def make_speech(target: pathlib.Path, text: str) -> bool:
    script = (
        "Add-Type -AssemblyName System.Speech; "
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        "$s.SelectVoice('Microsoft Huihui Desktop'); "
        f"$s.SetOutputToWaveFile('{target}'); "
        f"$s.Speak('{text}'); $s.Dispose()")
    try:
        subprocess.run(["powershell", "-NoProfile", "-Command", script],
                       check=True, capture_output=True, timeout=120)
    except Exception as exc:  # noqa: BLE001
        print("[!] 合成语音失败:", str(exc)[:120])
        return False
    return target.is_file() and target.stat().st_size > 4096


def main() -> int:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="asr-repro-"))
    for name in ("llm-profiles.json", "model-config.json"):
        source = ROOT / "data" / name
        if source.exists():
            shutil.copy2(source, tmp / name)
    sys.path.insert(0, str(ROOT))
    from domain.license import LicenseStore
    from domain.license.service import DEFAULT_FEATURES

    store = LicenseStore(tmp / "license.db")
    store.import_card(CARD, days=0, features=DEFAULT_FEATURES, note="asr repro")
    store.close()

    wav = tmp / "对白样例.wav"
    if not make_speech(wav, SAMPLE_TEXT):
        return 1
    print(f"[*] 样本 {wav.name} {wav.stat().st_size} 字节\n")

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

        # 文件名必须 percent-encode：HTTP 头只能是 latin-1，前端也是 encodeURIComponent
        status, uploaded = http(port, "/api/upload", "POST", raw=wav.read_bytes(),
                                headers={"X-Filename": quote("对白样例.wav"),
                                         "Content-Type": "application/octet-stream"})
        video_id = str(uploaded.get("videoId") or "")
        step("上传返回 videoId", status == 200 and bool(video_id), video_id[:16])

        # 本机只缓存了 tiny 权重；用 small 会先下载 ~480MB，验收会像"卡住"。
        # 默认走 tiny 验证链路；要验推荐精度可加 --size small。
        size = "small" if "--size" in sys.argv else "tiny"
        status, started = http(port, "/api/transcribe", "POST",
                               {"videoId": video_id, "modelSize": size,
                                "autoCorrect": True})
        task_id = str(started.get("taskId") or "")
        step("提交识别任务", status == 200 and bool(task_id),
             f"task={task_id[:8]} err={started.get('error') or ''}")

        task: dict = {}
        deadline = time.time() + 420
        while task_id and time.time() < deadline:
            _, snap = http(port, f"/api/tasks/{task_id}")
            task = snap.get("task") or {}
            if task.get("state") in ("done", "error"):
                break
            time.sleep(2)
        result = task.get("result") or {}
        transcript = str(result.get("transcript") or "")
        meta = result.get("meta") or {}
        step("任务完成", task.get("state") == "done",
             f"state={task.get('state')} err={task.get('error') or ''}")
        step("识别出文本", bool(transcript.strip()), transcript[:60])
        step("分段与时长", int(meta.get("segment_count") or 0) > 0,
             json.dumps(meta, ensure_ascii=False))

        failed = [row for row in steps if not row["ok"]]
        print(f"\n合计 {len(steps)} 步，失败 {len(failed)}")
        if not failed and "--keep" not in sys.argv:
            shutil.rmtree(tmp, ignore_errors=True)
        return 0 if not failed else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
