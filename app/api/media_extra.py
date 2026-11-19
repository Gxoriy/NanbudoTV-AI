"""D3/D4/S4 的尾巴：ASR 状态、图片水印、语音试听、通用上传、音频还原。

原则：
  - 有本地能力就真做（cv2 修补水印、ffmpeg 还原音轨、SAPI 合成试听）
  - 没有能力就 501 并说明缺什么（ASR 需要语音识别模型）
"""

from __future__ import annotations

import json
import mimetypes
import os
import pathlib
import shutil
import subprocess
import tempfile
import threading
from urllib.parse import unquote

from .router import Request, Response, Router
from domain.workspace.store import DocStore

MAX_UPLOAD = 64 * 1024 * 1024


def build(router: Router, store: DocStore, *, data_dir: pathlib.Path,
          voice_service=None, task_store=None) -> None:
    def _file(relative: str, ctype: str | None = None) -> Response:
        path = store.file_path(relative)
        if path is None:
            return Response.error(404, "not_found", "文件不存在。")
        return Response(200, None, {}, raw=path.read_bytes(),
                        content_type=ctype or mimetypes.guess_type(path.name)[0]
                        or "application/octet-stream")

    def _upload(req: Request, folder: str) -> Response:
        if len(req.body) > MAX_UPLOAD:
            return Response.error(413, "too_large", "文件超过 64MB 上限。")
        if not req.body:
            return Response.error(400, "invalid_input", "上传内容为空。")
        name = unquote(req.headers.get("x-filename", "")) or "upload.bin"
        relative = store.save_file(folder, name, req.body)
        # 前端要用：state.videoId = data.videoId（空则"识别视频对白"永远禁用）、
        # originalName（否则显示 "undefined"）、durationSeconds（否则 00:00）。
        duration = 0.0
        try:
            from infra.media import avio  # noqa: PLC0415

            path = store.file_path(relative)
            if path is not None:
                info = avio.probe(path)
                duration = float(info.get("duration") or 0)
        except Exception:  # noqa: BLE001
            duration = 0.0
        return Response(200, {
            "ok": True, "file": relative, "size": len(req.body),
            "videoId": pathlib.PurePath(relative).stem,
            "originalName": name,
            "durationSeconds": round(duration, 3),
            "mediaUrl": f"/api/media?file={relative}",
        })

    def voices_import(req: Request) -> Response:
        """把已有音色保存成"我的音色"：只做登记，不复制音频文件。"""
        body = req.json() if req.body else {}
        voice_id = str(body.get("voiceId") or body.get("id") or "").strip()
        if not voice_id:
            return Response.error(400, "invalid_input", "缺少 voiceId。")
        name = str(body.get("name") or "").strip() or voice_id.split(":")[-1]
        record = store.create("voice_profile", name,
                              {"voiceId": voice_id, "source": "import"})
        return Response(200, {"ok": True, "voice": {"id": record["id"], "name": name,
                                                    "voiceId": voice_id,
                                                    "createdAt": record["createdAt"]}})

    router.register("D4", "/api/voices/import", voices_import, methods=("POST",))

    # ---------- D3：ASR / 图片水印 / 通用转写 ----------
    def asr_status(_req: Request) -> Response:
        from infra.asr import DEFAULT_MODEL, available  # noqa: PLC0415

        ready, message = available()
        return Response(200, {"ok": True, "ready": ready, "engine": "faster-whisper",
                              "model": os.environ.get("NANBUDO_ASR_MODEL") or DEFAULT_MODEL,
                              "running": False, "progress": 0, "message": message})

    def asr_download(req: Request) -> Response:
        record = store.get(req.q1("id") or "")
        if record is None or record["kind"] != "transcript":
            return Response.error(404, "not_found", "没有这条转写结果。")
        return _file(str(record["payload"].get("srtFile") or ""), "text/plain; charset=utf-8")

    def _find_upload(video_id: str) -> pathlib.Path | None:
        """按 videoId（上传文件名去扩展名）找回已上传的视频。"""
        folder = store.files_root / "uploads"
        if not folder.is_dir() or not video_id:
            return None
        for candidate in folder.iterdir():
            if candidate.is_file() and candidate.stem == video_id:
                return candidate
        for candidate in folder.iterdir():
            if candidate.is_file() and candidate.stem.startswith(video_id):
                return candidate
        return None

    def _transcribe_worker(task_id: str, path: pathlib.Path, *, size: str | None,
                           language: str | None, auto_correct: bool) -> None:
        from infra.asr import to_srt, transcribe as run_asr  # noqa: PLC0415

        try:
            task_store.start(task_id)
        except KeyError:
            return
        warning = ""
        try:
            task_store.set_progress(task_id, 0.15, "正在解码音频…")
            try:
                result = run_asr(path, size=size, language=language)
            except Exception as exc:  # noqa: BLE001
                # 权重没下载且连不上 Hub 时降级到本地已缓存的 tiny，
                # 否则用户看到的是"识别失败"，而其实只是精度档位拿不到。
                from infra.asr.whisper import DEFAULT_MODEL  # noqa: PLC0415

                if not size or size == DEFAULT_MODEL:
                    raise
                warning = (f"未能加载 {size} 权重（{str(exc)[:60]}），"
                           f"已改用本地缓存的 {DEFAULT_MODEL} 模型，识别精度较低。")
                result = run_asr(path, size=DEFAULT_MODEL, language=language)
            task_store.set_progress(task_id, 0.8, "正在整理台词…")
            text = (result.text or "").strip()
            payload = {
                "transcript": text,
                "srt": to_srt(result.segments) if result.segments else "",
                "segments": result.segments or [],
                "language": result.language,
                "meta": {"segment_count": len(result.segments or []),
                         "duration": round(float(result.duration or 0), 2),
                         # 只有真的改了文本才置 True；我们当前没有纠错环节，
                         # 之前恒 True 会让界面谎称"已自动修正明显错别字"。
                         "auto_corrected": False},
                "warning": warning or ("" if text else "未识别到语音（静音或纯音乐）。"),
            }
            if text:
                store.create("transcript", path.stem,
                             {"sourceFile": f"uploads/{path.name}", "text": text})
            task_store.succeed(task_id, payload)
        except Exception as exc:  # noqa: BLE001
            task_store.fail(task_id, "asr_failed", f"识别失败: {exc}")

    def transcribe(req: Request) -> Response:
        """两条契约：

        - JSON `{videoId,...}`（首页"识别视频对白"）→ 建异步任务，返回 `taskId`
        - 原始音频字节（内部/脚本调用）→ 同步返回 text/segments/srt
        """
        body_json = None
        if req.body[:1] in (b"{", b" ") and b"videoId" in req.body[:400]:
            try:
                body_json = req.json()
            except Exception:  # noqa: BLE001
                body_json = None
        if body_json is not None:
            video_id = str(body_json.get("videoId") or "").strip()
            if not video_id:
                return Response.error(400, "invalid_input", "缺少 videoId。")
            path = _find_upload(video_id)
            if path is None:
                return Response.error(404, "not_found",
                                      "找不到已上传的视频，请重新上传后再识别。")
            from infra.asr import available  # noqa: PLC0415

            ready, message = available()
            if not ready:
                return Response.error(501, "model_required", message)
            if task_store is None:
                return Response.error(503, "unsupported", "任务队列未就绪，无法识别。")
            size = str(body_json.get("modelSize") or "").strip() or None
            task = task_store.create("asr.transcribe", "D3",
                                     {"videoId": video_id, "size": size or ""})
            import threading  # noqa: PLC0415

            threading.Thread(
                target=_transcribe_worker, args=(task.id, path),
                kwargs={"size": size,
                        "language": str(body_json.get("language") or "") or None,
                        "auto_correct": bool(body_json.get("autoCorrect"))},
                daemon=True).start()
            return Response(200, {"ok": True, "taskId": task.id})

        if not req.body:
            return Response.error(400, "invalid_input", "缺少音频数据。")
        # 几百字节以下不可能是有效音频，交给 ASR 只会得到 asr_failed（审计发现的 502）
        if len(req.body) < 512:
            return Response.error(400, "invalid_input",
                                  f"音频过小（{len(req.body)} 字节），请上传完整文件。")
        from infra.asr import available, to_srt, transcribe as run_asr  # noqa: PLC0415

        ready, message = available()
        if not ready:
            return Response.error(501, "model_required", message)

        name = unquote(req.headers.get("x-filename", "")) or "audio.wav"
        source = store.save_file("asr", name, req.body)
        language = (req.headers.get("x-language") or "").strip() or None
        try:
            result = run_asr(store.files_root / source, language=language)
        except Exception as exc:  # noqa: BLE001
            return Response.error(502, "asr_failed", f"识别失败: {exc}")
        if not result.segments:
            return Response(200, {"ok": True, "text": "", "segments": [], "count": 0,
                                  "language": result.language, "srt": "",
                                  "message": "未识别到语音（静音或纯音乐）。"})

        srt = to_srt(result.segments)
        srt_file = store.save_file("asr", "transcript.srt", srt.encode("utf-8"))
        record = store.create("transcript", name, {"sourceFile": source, "srtFile": srt_file,
                                                   "language": result.language,
                                                   "segments": len(result.segments)},)
        return Response(200, {**result.public(), "srt": srt, "srtFile": srt_file,
                              "id": record["id"], "sourceFile": source})

    def watermark_detect(req: Request) -> Response:
        """用 cv2 找"高频亮色小块"，给出候选区域；没有图就 400。"""
        raw = req.body
        if not raw:
            return Response.error(400, "invalid_input", "缺少图片数据。")
        try:
            import cv2  # noqa: PLC0415
            import numpy as np  # noqa: PLC0415
        except ImportError:
            return Response.error(501, "unsupported", "未安装 opencv，无法检测水印。")
        image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            return Response.error(400, "invalid_input", "图片无法解码。")
        height, width = image.shape[:2]
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        _value, mask = cv2.threshold(gray, 225, 255, cv2.THRESH_BINARY)
        mask[: int(height * 0.15), :] = 0          # 顶部多为标题/状态栏
        mask[int(height * 0.85):, :] = 0
        mask[:, : int(width * 0.05)] = 0
        mask[:, int(width * 0.95):] = 0
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        boxes = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            if w * h < (width * height) * 0.0004:
                continue
            boxes.append({"x": round(x / width * 100, 2), "y": round(y / height * 100, 2),
                          "width": round(w / width * 100, 2),
                          "height": round(h / height * 100, 2)})
        boxes.sort(key=lambda b: b["width"] * b["height"], reverse=True)
        return Response(200, {"ok": True, "candidates": boxes[:5],
                              "count": len(boxes[:5]),
                              "message": "" if boxes else "未检测到明显水印候选。"})

    def watermark_repair(req: Request) -> Response:
        body = req.body
        try:
            import cv2  # noqa: PLC0415
            import numpy as np  # noqa: PLC0415
        except ImportError:
            return Response.error(501, "unsupported", "未安装 opencv，无法修补水印。")
        if not body:
            return Response.error(400, "invalid_input", "缺少图片数据。")
        region = json.loads(req.headers.get("x-region") or "{}")
        image = cv2.imdecode(np.frombuffer(body, np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            return Response.error(400, "invalid_input", "图片无法解码。")
        height, width = image.shape[:2]
        x = int(region.get("x", 0) / 100 * width)
        y = int(region.get("y", 0) / 100 * height)
        w = max(1, int(region.get("width", 100) / 100 * width))
        h = max(1, int(region.get("height", 100) / 100 * height))
        box = (x, y, min(x + w, width), min(y + h, height))
        mask = np.zeros((height, width), np.uint8)
        mask[box[1]:box[3], box[0]:box[2]] = 255
        repaired = cv2.inpaint(image, mask, 3, cv2.INPAINT_TELEA)
        ok, encoded = cv2.imencode(".png", repaired)
        if not ok:
            return Response.error(500, "internal", "修补结果编码失败。")
        return Response(200, None, {}, raw=encoded.tobytes(), content_type="image/png")

    # ---------- D4：音色试听 / 整片配音列表 ----------
    def voices_root(_req: Request) -> Response:
        return Response(200, voice_service.catalog() if voice_service else {"ok": True,
                                                                           "voices": []})

    def voice_media(req: Request) -> Response:
        if voice_service is None:
            return Response.error(501, "unsupported", "语音服务未接入。")
        text = (req.q1("text") or "这是一段试听").strip()[:120]
        voice_id = req.q1("id") or req.q1("voiceId") or ""
        try:
            with tempfile.TemporaryDirectory() as tmp:
                out = pathlib.Path(tmp) / "sample.wav"
                voice_service.provider.synthesize(text, out, voice_id)
                return Response(200, None, {}, raw=out.read_bytes(),
                                content_type="audio/wav")
        except Exception as exc:  # noqa: BLE001
            return Response.error(502, "tts_failed", f"试听合成失败: {exc}")

    def video_voice_list(req: Request) -> Response:
        jobs = store.list("voice_job", limit=100)
        items = [{"id": row["id"], "name": row["name"],
                  "createdAt": row["createdAt"]} for row in jobs]
        return Response(200, {"ok": True, "jobs": items})

    # ---------- S4：通用上传 ----------
    def upload(req: Request) -> Response:
        return _upload(req, "uploads")

    # ---------- D1：音轨还原 / 音频观察 ----------
    def restore_audio(req: Request) -> Response:
        """从原片把音轨抽出来（ffmpeg），失败时说明原因。"""
        if not shutil.which("ffmpeg"):
            return Response.error(501, "unsupported", "未安装 ffmpeg，无法还原音轨。")
        source = store.file_path(req.q1("file") or "")
        if source is None:
            return Response.error(404, "not_found", "原片不存在。")
        target = store.files_root / "audio" / f"{source.stem}-audio.m4a"
        target.parent.mkdir(parents=True, exist_ok=True)
        proc = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(source),
                               "-vn", "-c:a", "copy", str(target)],
                              capture_output=True, text=True)
        if proc.returncode != 0 or not target.exists():
            return Response.error(502, "ffmpeg_failed",
                                  f"音轨提取失败: {proc.stderr.strip()[:200]}")
        return Response(200, {"ok": True,
                              "file": target.relative_to(store.files_root).as_posix(),
                              "size": target.stat().st_size})

    def audio_observe(req: Request) -> Response:
        relative = req.q1("file") or ""
        path = store.file_path(relative)
        if path is None:
            return Response(200, {"ok": True, "hasAudio": False, "message": "未提供可读文件。"})
        proc = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a",
                               "-show_entries", "stream=codec_name,channels,duration",
                               "-of", "json", str(path)], capture_output=True, text=True)
        if proc.returncode != 0:
            return Response(200, {"ok": True, "hasAudio": False,
                                  "message": proc.stderr.strip()[:160]})
        streams = json.loads(proc.stdout or "{}").get("streams") or []
        return Response(200, {"ok": True, "hasAudio": bool(streams),
                              "streams": streams,
                              "message": "" if streams else "该视频没有音轨。"})

    router.register("D3", "/api/asr/status", asr_status)
    router.register("D3", "/api/asr/download", asr_download)
    router.register("D3", "/api/transcribe", transcribe, methods=("POST",))
    router.register("D3", "/api/image-watermark/detect", watermark_detect,
                    methods=("POST",))
    router.register("D3", "/api/image-watermark/repair", watermark_repair,
                    methods=("POST",))
    router.register("D4", "/api/voices/", voices_root)
    router.register("D4", "/api/voices/media", voice_media)
    router.register("D4", "/api/video-voice/", video_voice_list)
    router.register("S4", "/api/upload", upload, methods=("POST",))
    router.register("D1", "/api/breakdown/restore-audio", restore_audio,
                    methods=("POST",))
    router.register("D1", "/api/prompt-reverse/restore-audio", restore_audio,
                    methods=("POST",))
    router.register("D1", "/api/breakdown/audio-observe", audio_observe)
    router.register("D1", "/api/prompt-reverse/audio", audio_observe)
