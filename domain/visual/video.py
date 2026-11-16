"""视觉域视频生成管线：上游任务 -> 轮询 -> 下载 -> 落素材库。

为什么单独成类：`/api/visual/episode/video` 与 `/api/visual/macro/media/submit`
是同一件事（给提示词出一段视频），只是用途不同，不该各写一套轮询逻辑。

上游是异步任务（常见 5~60 分钟），所以：
  - 立刻返回 taskId，前端用现成的 /api/tasks/<id> 轮询；
  - 后台线程负责轮询与落库，失败写进任务错误详情，不吞异常。
"""

from __future__ import annotations

import threading
from typing import Any

from infra.media import videos as video_api
from infra.media.videos import VideoConfig, VideoError


class VideoPipeline:
    def __init__(self, library, task_store, config: VideoConfig | None = None) -> None:
        self.library = library
        self.task_store = task_store
        self.config = config or VideoConfig()

    def start(self, kind: str, *, prompt: str, project_id: str = "",
              duration: str | None = None, aspect_ratio: str | None = None,
              version: str | None = None, images: list[str] | None = None
              ) -> dict[str, Any]:
        if not prompt.strip():
            return {"ok": False, "status": 400, "error": "invalid_input",
                    "message": "提示词不能为空。"}
        if not self.config.enabled:
            return {"ok": False, "status": 503, "error": "model_unconfigured",
                    "message": "视频模型未配置：请在 data/model-config.json 的 videos 段填 "
                               "baseUrl/apiKey/model。"}
        if self.task_store is None:
            return {"ok": False, "status": 503, "error": "unsupported",
                    "message": "任务队列未就绪。"}
        duration = str(duration or self.config.duration)
        ratio = str(aspect_ratio or self.config.aspect_ratio)
        version = str(version or self.config.version)

        task = self.task_store.create(f"visual.{kind}", "D2",
                                      {"projectId": project_id, "prompt": prompt[:200],
                                       "duration": duration, "aspectRatio": ratio})
        threading.Thread(target=self._work,
                         args=(task.id, kind, project_id, prompt, duration, ratio,
                               version, images or []),
                         daemon=True).start()
        return {"ok": True, "taskId": task.id, "duration": duration,
                "aspectRatio": ratio}

    def observe(self, task_id: str) -> dict[str, Any] | None:
        if not task_id or self.task_store is None:
            return None
        task = self.task_store.get(task_id)
        return task.public() if task else None
    def _work(self, task_id: str, kind: str, project_id: str, prompt: str,
              duration: str, ratio: str, version: str,
              images: list[str]) -> None:
        try:
            self.task_store.start(task_id)
        except KeyError:
            return
        try:
            upstream_id = video_api.create_task(
                self.config, prompt, duration=duration, aspect_ratio=ratio,
                version=version, images=images)
            self.task_store.set_progress(task_id, 0.05, "视频任务已提交，等待生成...")

            def on_progress(state: dict[str, Any]) -> None:
                percent = state.get("progress") or "0"
                try:
                    value = min(0.95, float(str(percent).rstrip("%")) / 100.0)
                except ValueError:
                    value = 0.1
                self.task_store.set_progress(task_id, value,
                                            f"视频生成中（{percent or state['state']}）")

            final = video_api.poll(self.config, upstream_id, on_progress=on_progress)
            data = video_api.download(self.config, final["resultUrl"])
            relative = self.library.save_file("videos", "clip.mp4", data)
            record = self.library.create(
                "asset", prompt[:40] or "生成视频",
                {"file": relative, "type": "video", "projectId": project_id,
                 "kind": kind, "prompt": prompt, "upstreamTaskId": upstream_id})
            self.task_store.succeed(task_id, {"file": relative, "assetId": record["id"],
                                             "upstreamTaskId": upstream_id})
        except VideoError as exc:
            self.task_store.fail(task_id, "network" if exc.code == "network" else "internal",
                                 exc.message)
        except Exception as exc:  # noqa: BLE001
            self.task_store.fail(task_id, "internal", repr(exc))