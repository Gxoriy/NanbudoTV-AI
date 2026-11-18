"""通道巡检：按域把每条主链路的「关键一跳」跑一遍，只回答"通没通"。

定位：这是**冒烟**不是压测，也不是质量评估。目的是回答"哪条通道断了"，
所以每步只要求 200 + 关键字段存在，不校验内容好坏。

用法：
  python tools/lane_smoke.py                 # 默认跳过要花钱的出图/出视频
  python tools/lane_smoke.py --with-media    # 连出图/出视频一起跑
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
WITH_MEDIA = "--with-media" in sys.argv

STEPS: list[dict] = []


def http(port: int, path: str, method: str = "GET", body: dict | None = None,
         raw: bytes | None = None, headers: dict[str, str] | None = None,
         timeout: float = 300.0):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    merged = dict(headers or {})
    if body is not None:
        merged.setdefault("Content-Type", "application/json")
    request = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data,
                                     method=method, headers=merged)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            payload = resp.read()
            if "json" in (resp.headers.get("content-type") or ""):
                return resp.status, json.loads(payload.decode() or "{}")
            return resp.status, {"_bytes": len(payload)}
    except urllib.error.HTTPError as exc:
        payload = exc.read()
        try:
            return exc.code, json.loads(payload.decode() or "{}")
        except json.JSONDecodeError:
            return exc.code, {"_bytes": len(payload)}
    except Exception as exc:  # noqa: BLE001
        return 0, {"_error": repr(exc)[:120]}


def note(lane: str, step: str, status: int, detail=None, ok: bool | None = None) -> bool:
    """记录一步。detail 可以是字符串或响应体（dict）。

    响应体是 dict 时自动挑几个关键字段做摘要，并把 `error` 当成失败——
    因为有的接口会 200 + {"ok": false}，只看状态码会误判为通过。
    """
    if isinstance(detail, dict):
        summary = {key: detail[key] for key in ("ok", "error", "message", "count", "id")
                   if key in detail}
        text = json.dumps(summary, ensure_ascii=False)
        if ok is None and detail.get("error"):
            ok = False
    elif detail is None:
        text = ""
    else:
        text = str(detail)
    passed = ok if ok is not None else (200 <= status < 300)
    STEPS.append({"lane": lane, "step": step, "status": status,
                  "detail": text[:120], "ok": passed})
    mark = "OK  " if passed else "FAIL"
    print(f"[{mark}] {lane:<6} {step:<28} {status:<4} {text[:90]}")
    return passed


def poll(port: int, task_id: str, *, timeout: float = 300.0) -> dict:
    deadline = time.time() + timeout
    task: dict = {}
    while time.time() < deadline:
        _, snap = http(port, f"/api/tasks/{task_id}")
        task = snap.get("task") or {}
        if task.get("state") in ("done", "error"):
            return task
        time.sleep(2)
    return task


def make_clip(target: pathlib.Path, *, with_subtitle: bool = True) -> bool:
    """造一个带音轨（以及可选的 mov_text 字幕轨）的小视频。

    带字幕轨才能验证"拆字幕轨"真的产出文件；否则 dropped=0，接口会如实回
    "没有独立字幕轨"，那不是失败。
    """
    ffmpeg = shutil.which("ffmpeg") or r"E:\PublicWork\ffmpeg\bin\ffmpeg.exe"
    srt = target.with_suffix(".srt")
    srt.write_text("1\n00:00:00,200 --> 00:00:02,800\n巡检字幕\n", encoding="utf-8")
    # 注意：多输入时不能用 -vf（ffmpeg 会报"只有一个输入"），必须 filter_complex
    box = "drawbox=x=60:y=300:w=520:h=36:color=white@1.0:t=fill"
    base = [ffmpeg, "-v", "error", "-y", "-f", "lavfi",
            "-i", "color=c=black:s=640x360:d=3", "-f", "lavfi",
            "-i", "sine=frequency=440:duration=3"]
    try:
        if with_subtitle:
            base += ["-i", str(srt),
                     "-filter_complex", f"[0:v]{box}[v]",
                     "-map", "[v]", "-map", "1:a", "-map", "2:s",
                     "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac",
                     "-c:s", "mov_text", "-pix_fmt", "yuv420p", "-shortest", str(target)]
        else:
            base += ["-vf", box, "-pix_fmt", "yuv420p", "-shortest", str(target)]
        subprocess.run(base, check=True, capture_output=True, timeout=180)
    except Exception as exc:  # noqa: BLE001
        print("    (造样本失败，退回无字幕轨)", str(exc)[:80])
        return make_clip(target, with_subtitle=False) if with_subtitle else False
    finally:
        srt.unlink(missing_ok=True)
    return target.is_file()


def run(port: int, data_dir: pathlib.Path) -> None:
    # ---------- S1 会话/授权 ----------
    note("S1", "license/status", *http(port, "/api/license/status"))
    status, body = http(port, "/api/session/login", "POST", {"cardKey": CARD})
    note("S1", "session/login", status, str(body.get("authenticated")))
    note("S1", "session/status", *http(port, "/api/session/status"))

    # ---------- S2 运行时/存储 ----------
    note("S2", "runtime/status", *http(port, "/api/runtime/status"))
    note("S2", "storage/status", *http(port, "/api/storage/status"))
    status, body = http(port, "/api/upload", "POST", raw=b"hello lane",
                        headers={"X-Filename": "lane.txt",
                                 "Content-Type": "application/octet-stream"})
    note("S2", "upload", status, str(body.get("file")))

    # ---------- D1 改写（LLM） ----------
    status, body = http(port, "/api/source/analyze", "POST",
                        {"text": "外卖员雨夜送最后一单，收件人是失联多年的父亲。"})
    note("D1", "source/analyze", status, str(body.get("analysis", {}).get("genre", "")))
    status, body = http(port, "/api/rewrite/generate", "POST",
                        {"sourceText": "林晚推门进来，雨声被关在门外。",
                         "settings": {"projectName": "巡检", "segments": 1}})
    if note("D1", "rewrite/generate 提交", status, str(body.get("taskId"))[:8]):
        task = poll(port, body.get("taskId") or "", timeout=420)
        note("D1", "rewrite/generate 完成", 200 if task.get("state") == "done" else 502,
             f"state={task.get('state')} file={str((task.get('result') or {}).get('metaFile'))[:40]}")

    # ---------- D2 视觉 ----------
    status, body = http(port, "/api/visual/project/create", "POST",
                        {"projectName": "巡检项目", "createRequestId": "lane-1"})
    project = (body.get("project") or {})
    pid = project.get("id", "")
    if note("D2", "project/create", status, pid[:8]):
        note("D2", "project/source 保存", *http(
            port, "/api/visual/project/source", "POST",
            {"projectId": pid, "sourceText": "第一场 图书馆 日 内\n林晚把剧本推到周野面前。"}))
        status, body = http(port, "/api/visual/project/prepare", "POST",
                            {"projectId": pid, "shots": 1,
                             "requirement": "雨夜送餐"})
        note("D2", "project/prepare", status,
             str([s["name"] for s in (body.get("stages") or [])]))
        status, body = http(port, f"/api/visual/episode/state?projectId={pid}")
        note("D2", "episode/state", status, str(body.get("scenes"))[:40])
        if WITH_MEDIA:
            status, body = http(port, "/api/visual/episode/frame", "POST",
                                {"projectId": pid, "sceneIndex": 1,
                                 "prompt": "雨夜街道，霓虹反光"})
            if note("D2", "episode/frame 提交", status, str(body.get("taskId"))[:8]):
                task = poll(port, body.get("taskId") or "", timeout=420)
                rel = str((task.get("result") or {}).get("file") or "")
                note("D2", "episode/frame 完成",
                     200 if task.get("state") == "done" and rel else 502,
                     f"state={task.get('state')} file={rel[:40]}")

    # ---------- D3 字幕 ----------
    clip = data_dir / "clip.mp4"
    if make_clip(clip):
        status, body = http(port, "/api/subtitle/upload", "POST", raw=clip.read_bytes(),
                            headers={"X-Filename": "clip.mp4",
                                     "Content-Type": "application/octet-stream"})
        record = body.get("record") or {}
        source_rel = record.get("sourceFile") or ""
        if note("D3", "subtitle/upload", status, source_rel[:36]):
            status, body = http(port, "/api/subtitle/detect", "POST",
                                {"id": record.get("id"), "file": source_rel})
            region = ((body.get("record") or {}).get("region") or {})
            note("D3", "subtitle/detect", status, json.dumps(region, ensure_ascii=False)[:60])
            note("D3", "subtitle/quote", *http(port, "/api/subtitle/quote", "POST",
                                               {"id": record.get("id"),
                                                "region": region,
                                                "quality": "standard"}))
            # 本地处理要求 confirmed=true（防误触），与前端"确认后再处理"一致
            status, body = http(port, "/api/subtitle/local-start", "POST",
                                {"id": record.get("id"), "mode": "strip",
                                 "confirmed": True})
            started = note("D3", "subtitle/local-start(strip)", status,
                           str((body.get("record") or {}).get("phase")))
            if started:
                deadline = time.time() + 120
                final: dict = {}
                while time.time() < deadline:
                    _, snap = http(port, f"/api/subtitle/record?id={record.get('id')}")
                    final = snap.get("record") or {}
                    if final.get("phase") in ("done", "error"):
                        break
                    time.sleep(1.5)
                result_file = str(final.get("resultFile") or "")
                message = str(final.get("message") or "")
                # 没有字幕轨时接口如实回"没有独立字幕轨"——那是通过，不是失败
                no_track = final.get("phase") == "done" and "字幕轨" in message
                note("D3", "subtitle/strip 完成",
                     200 if (result_file or no_track) and final.get("phase") == "done"
                     else 502,
                     f"phase={final.get('phase')} file={result_file[:30]} "
                     f"msg={message[:24]}")
    else:
        note("D3", "无 ffmpeg 造样本", 0, "跳过字幕链路", ok=False)

    # ---------- D4 配音 ----------
    status, body = http(port, "/api/voices/catalog")
    voices = body.get("voices") or body.get("items") or []
    if note("D4", "voices/catalog", status, f"{len(voices)} 个音色"):
        from urllib.parse import quote
        note("D4", "voices/media 试听", *http(
            port, f"/api/voices/media?text={quote('巡检')}"
                  f"&id={quote(str(voices[0].get('id')))}"))
    note("D4", "video-voice/quote", *http(port, "/api/video-voice/quote", "POST", {}))

    # ---------- D5 电商 ----------
    status, body = http(port, "/api/ecommerce/create", "POST", {"name": "巡检商品"})
    doc_id = body.get("id", "")
    if note("D5", "ecommerce/create", status, str(doc_id)[:8]):
        note("D5", "ecommerce/batch/create", *http(
            port, "/api/ecommerce/batch/create", "POST",
            {"id": doc_id, "settings": {"style": "干净"}}))
        note("D5", "ecommerce/quote", *http(port, "/api/ecommerce/quote", "POST", {}))
        note("D5", "ecommerce/save", *http(port, "/api/ecommerce/save", "POST",
                                           {"id": doc_id, "name": "巡检商品-改"}))

    # ---------- D6 采集 ----------
    page = data_dir / "lane_page.html"
    page.write_text('<html><head><title>巡检页</title></head><body>'
                    '<video src="about:blank"></video></body></html>', encoding="utf-8")
    probe = data_dir / "probe.html"
    probe.write_text('<html><body><p>采集探针</p></body></html>', encoding="utf-8")
    status, body = http(port, "/api/link/analyze", "POST",
                        {"url": f"http://127.0.0.1:{port}/probe.html"})
    note("D6", "link/analyze", status, str(body.get("title"))[:30])
    note("D6", "watch/status", *http(port, "/api/watch/status"))


def main() -> int:
    data_dir = pathlib.Path(tempfile.mkdtemp(prefix="lane-"))
    for name in ("llm-profiles.json", "model-config.json"):
        source = ROOT / "data" / name
        if source.exists():
            shutil.copy2(source, data_dir / name)
    (ROOT / "static").mkdir(exist_ok=True)
    sys.path.insert(0, str(ROOT))
    from domain.license import LicenseStore
    from domain.license.service import DEFAULT_FEATURES

    store = LicenseStore(data_dir / "license.db")
    store.import_card(CARD, days=0,
                      features=(*DEFAULT_FEATURES, "ecommerce", "store", "advertising"),
                      note="lane smoke")
    store.close()

    proc = subprocess.Popen([sys.executable, "-m", "app.main", "--no-gui", "--port", "0",
                             "--data-dir", str(data_dir)], cwd=str(ROOT),
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        port = None
        for _ in range(120):
            files = list(data_dir.glob("runtime-*.json"))
            if files:
                port = json.loads(files[0].read_text(encoding="utf-8"))["port"]
                break
            time.sleep(0.3)
        if port is None:
            print("[!] 内核没起来")
            return 1
        print(f"[*] 端口 {port}  with_media={WITH_MEDIA}\n")
        run(port, data_dir)

        lanes: dict[str, list[bool]] = {}
        for step in STEPS:
            lanes.setdefault(step["lane"], []).append(step["ok"])
        print("\n=== 分域结果 ===")
        for lane, results in lanes.items():
            print(f"  {lane:<4} {sum(results)}/{len(results)} 通过")
        failed = [s for s in STEPS if not s["ok"]]
        print(f"\n合计 {len(STEPS)} 步，失败 {len(failed)}")
        for step in failed:
            print(f"  - {step['lane']} {step['step']} status={step['status']} {step['detail']}")
        (ROOT / ".local" / "lane-smoke.json").write_text(
            json.dumps(STEPS, ensure_ascii=False, indent=1), encoding="utf-8")
        http(port, "/api/shutdown", "POST", {})
        return 0 if not failed else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
