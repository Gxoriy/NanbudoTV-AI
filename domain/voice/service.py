"""配音域服务：音色目录、报价（免费）、整片配音任务（P3-01）。

整片配音的前端契约（`static/video_voice.js`）：
  GET  /api/video-voice/status?projectId=&file=   → {totalCount, completedCount, canContinue, canObserve, ...}
  GET  /api/video-voice/source?projectId=&file=   → {project:{sourceUrl, characterVoices, ...}}
  POST /api/video-voice/quote  {projectId, file, segments, rightsConfirmed}
       → {estimatedPoints, availablePoints, intentHash, canGenerate, message}
  POST /api/video-voice/generate {…, intentHash, acceptedPrice, billingConfirmed}
       → {taskId}（随后前端轮询 /api/tasks/<id>）
  POST /api/video-voice/observe {projectId}        → 最近一次任务状态

计费：全部 0（ADR-008），`intentHash` 只用于"内容变了必须重新报价"的一致性校验。
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import threading
import time
import uuid
from typing import Any

from .pipeline import ffmpeg_ready, render_segments
from .provider import SapiProvider, TTSError, TTSProvider
from .store import VoiceJobStore


def intent_of(project_id: str, file: str, segments: list[dict]) -> str:
    canonical = json.dumps(
        {"projectId": project_id, "file": file,
         "segments": [{k: row.get(k) for k in ("start", "end", "text", "voiceId",
                                              "speakerName")} for row in segments]},
        ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


class VoiceError(RuntimeError):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


class VoiceService:
    def __init__(self, provider: TTSProvider | None = None, *,
                 store: VoiceJobStore | None = None, task_store: Any = None,
                 workspace: str | pathlib.Path | None = None) -> None:
        self.provider = provider or SapiProvider()
        self.store = store
        self.task_store = task_store
        self.workspace = pathlib.Path(workspace or pathlib.Path.cwd() / "data" / "voice")

    # ---------- 能力 ----------
    def available(self) -> bool:
        provider = self.provider
        check = getattr(provider, "available", None)
        if callable(check):
            try:
                return bool(check())
            except TTSError:
                return False
        return True

    def catalog(self) -> dict[str, Any]:
        try:
            voices = self.provider.voices()
        except TTSError:
            voices = []
        items = [voice.public() for voice in voices]
        ready = sum(1 for item in items if item["synthesisReady"])
        ok = ffmpeg_ready() and ready > 0
        return {
            "ok": True,
            "ready": ok,
            "cloneReady": False,
            "message": "" if ok else
            "本地语音引擎不可用（缺 PowerShell/语音包/ffmpeg），配音功能暂不可用。",
            "cloneMessage": "本地引擎不支持音色克隆；克隆音色需接入云端。",
            "clonePoints": 0.0,
            "pointsPerCharacter": 0.0,
            "systemCount": len(items),
            "readyCount": ready,
            "sourceUrl": "",
            "voices": items,
            "pending": [],
            "pricingMode": "free",
        }

    def quote(self, text: str) -> dict[str, Any]:
        return {"ok": True, "characters": len(text.strip()),
                "estimatedPoints": 0.0, "unitPrice": 0.0, "pricingMode": "free",
                "message": "配音功能免费（学习研究用途），不产生任何费用。"}

    def status(self) -> dict[str, Any]:
        catalog = self.catalog()
        return {"ok": True, "ready": catalog["ready"],
                "systemCount": catalog["systemCount"],
                "readyCount": catalog["readyCount"],
                "message": catalog["message"] or "本地语音引擎就绪，可直接合成。",
                "pricingMode": "free"}

    # ---------- 整片配音 ----------
    def _validate(self, segments: list[dict]) -> list[dict]:
        if not segments:
            raise VoiceError(400, "invalid_input", "至少需要一段对白。")
        clean = []
        for index, row in enumerate(segments, start=1):
            text = str(row.get("text") or "").strip()
            if not text:
                raise VoiceError(400, "invalid_input", f"第 {index} 段台词为空。")
            try:
                start = float(row.get("start"))
                end = float(row.get("end"))
            except (TypeError, ValueError) as exc:
                raise VoiceError(400, "invalid_input",
                                 f"第 {index} 段时间格式不正确。") from exc
            if start < 0 or end <= start:
                raise VoiceError(400, "invalid_input", f"第 {index} 段时间区间无效。")
            if duration_overlap(clean, start, end):
                raise VoiceError(400, "invalid_input", f"第 {index} 段与上一段时间重叠。")
            clean.append({"start": start, "end": end, "text": text,
                          "voiceId": str(row.get("voiceId") or ""),
                          "speakerName": str(row.get("speakerName") or "视频人物")})
        return clean

    def quote_segments(self, project_id: str, file: str, segments: list[dict]) -> dict[str, Any]:
        clean = self._validate(segments)
        return {
            "ok": True,
            "estimatedPoints": 0.0,
            "availablePoints": 0.0,
            "warning": "",
            "canGenerate": self.available(),
            "intentHash": intent_of(project_id, file, clean),
            "segments": len(clean),
            "pricingMode": "free",
            "message": "本功能免费；确认后开始合成，不产生任何费用。",
        }

    def generate(self, project_id: str, file: str, segments: list[dict], *,
                 intent_hash: str, rights_confirmed: bool,
                 background: bool = True) -> dict[str, Any]:
        if not rights_confirmed:
            raise VoiceError(400, "invalid_input", "请先确认素材与声音授权。")
        if not self.available():
            raise VoiceError(501, "unsupported",
                             "本地语音引擎不可用，无法合成。")
        if self.store is None or self.task_store is None:
            raise VoiceError(503, "unsupported", "任务队列未就绪。")
        clean = self._validate(segments)
        if intent_hash != intent_of(project_id, file, clean):
            raise VoiceError(409, "quote_stale", "配音内容已变化，请重新报价。")

        task = self.task_store.create("voice.dub", "D4",
                                      {"projectId": project_id, "file": file,
                                       "segments": len(clean)},
                                      idempotency_key=f"voice:{intent_hash}")
        self.store.save(project_id, file, segments=clean,
                        status={"phase": "queued", "completedCount": 0,
                                "totalCount": len(clean), "taskId": task.id,
                                "message": "排队中"}, result_file="")
        if background:
            threading.Thread(target=self._run, args=(task.id, project_id, file, clean),
                             name=f"voice-{task.id[:6]}", daemon=True).start()
        else:
            self._run(task.id, project_id, file, clean)
        return {"ok": True, "taskId": task.id, "totalCount": len(clean),
                "message": "已开始合成。"}

    def _run(self, task_id: str, project_id: str, file: str,
             segments: list[dict]) -> None:
        assert self.store is not None and self.task_store is not None
        try:
            self.task_store.start(task_id)
        except KeyError:
            return
        workdir = self.workspace / "jobs" / task_id
        out = workdir / "dub.wav"

        def progress(ratio: float, text: str) -> None:
            self.task_store.set_progress(task_id, ratio, text)
            self.store.save(project_id, file, segments=segments,
                            status={"phase": "running", "completedCount": int(ratio * len(segments)),
                                    "totalCount": len(segments), "taskId": task_id,
                                    "message": text})

        try:
            result = render_segments(self.provider, segments, out, workdir,
                                     on_progress=progress)
            relative = out.relative_to(self.workspace).as_posix()
            self.task_store.succeed(task_id, {"file": relative, **result})
            self.store.save(project_id, file, segments=segments,
                            status={"phase": "done", "completedCount": len(segments),
                                    "totalCount": len(segments), "taskId": task_id,
                                    "message": "配音完成"}, result_file=relative)
        except Exception as exc:  # noqa: BLE001
            self.task_store.fail(task_id, "internal", repr(exc))
            self.store.save(project_id, file, segments=segments,
                            status={"phase": "error", "completedCount": 0,
                                    "totalCount": len(segments), "taskId": task_id,
                                    "message": f"配音失败: {exc}"}, result_file="")

    def job_status(self, project_id: str, file: str) -> dict[str, Any]:
        record = self.store.get(project_id, file) if self.store else None
        if record is None:
            return {"ok": True, "totalCount": 0, "completedCount": 0,
                    "canContinue": False, "canObserve": False,
                    "message": "尚无配音记录，可直接报价开始。"}
        status = record["status"]
        return {
            "ok": True,
            "totalCount": status.get("totalCount", 0),
            "completedCount": status.get("completedCount", 0),
            "canContinue": status.get("phase") in ("error", "queued", "running"),
            "canObserve": bool(record["resultFile"]),
            "taskId": status.get("taskId"),
            "resultFile": record["resultFile"],
            "message": status.get("message", ""),
            "updatedAt": record["updatedAt"],
        }

    def observe(self, project_id: str) -> dict[str, Any]:
        record = self.store.latest(project_id) if self.store else None
        if record is None:
            raise VoiceError(404, "not_found", "该项目还没有配音任务。")
        status = record["status"]
        body = self.job_status(record["projectId"], record["file"])
        body["file"] = record["file"]
        body["phase"] = status.get("phase", "")
        return body

    def source(self, project_id: str, file: str, scope: str = "") -> dict[str, Any]:
        """源素材/角色音色由其他域提供；未迁移前如实返回空角色列表。"""
        return {
            "ok": True,
            "project": {
                "id": project_id,
                "name": project_id,
                "sourceFile": file,
                "sourceUrl": "",
                "storageFeature": "workflow" if scope in ("visual", "canvas") else "breakdown",
                "characterVoices": [],
            },
            "message": "角色音色来自原创作工程（视觉/分镜域），该域尚未迁移，需手动选择音色。",
        }


def duration_overlap(existing: list[dict], start: float, end: float) -> bool:
    return any(not (end <= row["start"] or start >= row["end"]) for row in existing)
