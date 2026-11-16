"""字幕域业务逻辑（P2 全量重写）。

口径（ADR-008/009/010）：
  - 计费归零：所有处理 0 积分，不产生任何费用；`pricingMode=free`
  - 本地修补走 B 档：ffmpeg + cv2.inpaint + 时序 mask（`repair.py`）
  - 云端去字幕指向自建服务（`infra/cloud`），仅用于本地搞不定的高频背景
  - 未配置云端时明确告知，并提示本地可用

不变量：
  - 上传/媒体读取永远不联网、不扣费
  - 任何"未生成"的分支都必须说清楚"未生成"，不允许静默成功
"""

from __future__ import annotations

import json
import pathlib
import threading
import time
import uuid
from typing import Any

from infra.cloud import CloudClient, CloudError

from . import mp4, repair
from . import region as region_rules
from .models import (
    CANCELED, DONE, ERROR, LOCAL_PREPARING, LOCAL_PROCESSING, QUOTED, READY,
    SUBMITTING, SubtitleRecord,
)
from .store import SubtitleStore

QUALITIES = ("standard", "fine")
FORMATS = ("mp4", "mov", "m4v")
PRICING_MODE = "free"
DEFAULT_MODEL_NAME = "视频去字幕"
DEFAULT_SOURCE_LIMIT = 52428800
MESSAGE_CLOUD_UNCONFIGURED = (
    "云端去字幕服务尚未配置（服务地址/令牌），本地移除字幕轨与像素修补仍可使用，"
    "两者都不产生任何费用。"
)
MESSAGE_STALE_QUOTE = "选区已变化，请重新确认后再提交。"
MESSAGE_TOO_LARGE = "首版支持不超过50MB的原片，不会自动压缩。"
MESSAGE_BAD_VIDEO = "无法解析该视频，请确认是 mp4/mov/m4v 且未损坏。"
MESSAGE_NO_SUBTITLE_TRACK = "未发现独立字幕轨：该片字幕可能是烧进画面的，请用本地像素修补或云端去字幕。"
MESSAGE_REPAIR_HINT = "像素修补会重编码视频，可能留下涂抹痕迹，不能还原真实背景。"


class SubtitleError(RuntimeError):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


class SubtitleService:
    def __init__(self, store: SubtitleStore, config_path: str | pathlib.Path, *,
                 storage_root: str | pathlib.Path | None = None,
                 task_store: Any = None, cloud: CloudClient | None = None) -> None:
        self.store = store
        self.config_path = pathlib.Path(config_path)
        self.storage_root = pathlib.Path(storage_root or self.config_path.parent / "subtitle")
        self.task_store = task_store
        self.cloud = cloud
        self._tasks: dict[str, str] = {}
        self._config: dict[str, Any] = {}
        self.reload_config()

    # ---------- 配置 ----------
    def reload_config(self) -> dict[str, Any]:
        data: dict[str, Any] = {}
        if self.config_path.exists():
            try:
                data = json.loads(self.config_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                data = {}
        self._config = data if isinstance(data, dict) else {}
        return self._config

    @property
    def model_name(self) -> str:
        return str(self._config.get("modelName") or DEFAULT_MODEL_NAME)

    @property
    def source_limit(self) -> int:
        try:
            return int(self._config.get("sourceSizeLimit") or DEFAULT_SOURCE_LIMIT)
        except (TypeError, ValueError):
            return DEFAULT_SOURCE_LIMIT

    def cloud_client(self) -> CloudClient | None:
        """优先用注入的客户端；否则按配置里的 baseUrl/token 现建一个（改配置无需重启）。"""
        if self.cloud is not None:
            return self.cloud
        base = str(self._config.get("baseUrl") or "").strip()
        if not base:
            return None
        return CloudClient(base, str(self._config.get("token") or ""))

    def is_configured(self) -> bool:
        """云端是否可用：只看服务地址（free 模式不需要价格与密钥）。"""
        client = self.cloud_client()
        return bool(client and client.enabled)

    # ---------- 能力 ----------
    def capabilities(self) -> dict[str, Any]:
        configured = self.is_configured()
        return {
            "ok": True,
            "configured": configured,
            "modelName": self.model_name,
            "qualities": list(QUALITIES),
            "sourceSizeLimit": self.source_limit,
            "formats": list(FORMATS),
            "pricingMode": PRICING_MODE,
            "prices": {"standard": 0.0, "fine": 0.0},
            "message": "" if configured else MESSAGE_CLOUD_UNCONFIGURED,
            "regionSchema": region_rules.SCHEMA,
            "localRepair": _repair_available(),
        }

    # ---------- 导入 / 媒体 ----------
    def upload(self, filename: str, data: bytes) -> SubtitleRecord:
        name = pathlib.PurePath(filename or "").name
        suffix = pathlib.PurePath(name).suffix.lower().lstrip(".")
        if not name or suffix not in FORMATS:
            raise SubtitleError(400, "invalid_input", MESSAGE_BAD_VIDEO)
        if not data:
            raise SubtitleError(400, "invalid_input", "上传内容为空。")
        if len(data) > self.source_limit:
            raise SubtitleError(413, "too_large", MESSAGE_TOO_LARGE)
        try:
            meta = mp4.probe(data)
        except ValueError as exc:
            raise SubtitleError(400, "invalid_input", MESSAGE_BAD_VIDEO) from exc

        record = self.store.create(
            pathlib.PurePath(name).stem, metadata=meta, size=len(data),
            processing_mode="cloud", record_id=uuid.uuid4().hex)
        rel = f"sources/{record.id}.{suffix}"
        target = self.storage_root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return self.store.update(record.id, source_file=rel,
                                 message="已导入，可本地处理或提交云端（本功能免费）。")

    def media_path(self, record_id: str, file_name: str) -> pathlib.Path:
        record = self.store.get(record_id)
        if record is None:
            raise SubtitleError(404, "not_found", "记录不存在。")
        allowed = {record.source_file, record.result_file}
        allowed |= {row.get("file", "") for row in record.history}
        if not file_name or file_name not in allowed:
            raise SubtitleError(404, "not_found", "文件不存在。")
        path = (self.storage_root / file_name).resolve()
        if self.storage_root.resolve() not in path.parents or not path.is_file():
            raise SubtitleError(404, "not_found", "文件不存在。")
        return path

    # ---------- 已有素材导入 / 续跑 ----------
    def import_existing(self, relative: str, name: str = "") -> SubtitleRecord:
        """把 data 下已有文件登记成记录（旧版"导入已有"语义）。"""
        root = self.storage_root.resolve()
        target = (root / relative).resolve()
        try:
            target.relative_to(root)
        except ValueError as exc:
            raise SubtitleError(400, "invalid_input", "文件路径不合法。") from exc
        if not target.is_file():
            raise SubtitleError(404, "not_found", "文件不存在，请先上传。")
        data = target.read_bytes()
        info = mp4.probe(data)
        metadata = {"duration": info["duration"], "width": info["width"],
                    "height": info["height"], "hasSubtitle": info["hasSubtitle"],
                    "bytes": len(data)}
        return self.store.create(name or target.name, metadata=metadata,
                                 size=len(data), source_file=relative)

    def resume(self, record_id: str) -> SubtitleRecord:
        record = self.store.get(record_id)
        if record is None:
            raise SubtitleError(404, "not_found", "记录不存在。")
        if record.phase in (DONE, READY, QUOTED):
            raise SubtitleError(409, "invalid_input", f"当前阶段 {record.phase} 无需续跑。")
        mode = getattr(record, "local_mode", "") or "strip"
        return self.local_start(record_id, mode, record.region)

    # ---------- 字幕候选检测 ----------
    def detect(self, record_id: str) -> SubtitleRecord:
        record = self.store.get(record_id)
        if record is None:
            raise SubtitleError(404, "not_found", "记录不存在，请重新导入原片。")
        if not record.source_file:
            raise SubtitleError(409, "invalid_input", "原片缺失，请重新导入。")
        available, why = _repair_available()
        if not available:
            raise SubtitleError(501, "unsupported", why)

        from . import detect as detector      # 延迟导入：缺 cv2 时不影响其它接口

        source = (self.storage_root / record.source_file).resolve()
        result = detector.detect_region(source)
        if result["region"] is None:
            message = (f"未在下方区域检测到字幕候选（抽样 {result['frames']} 帧）；"
                       "可手动框选，或用云端去字幕。")
            return self.store.update(record_id, detection={"region": None,
                                                           "message": message},
                                     message=message)
        message = (f"已定位字幕候选（{result['hits']}/{result['frames']} 帧命中），"
                   "选区已向外对齐到整数网格，请检查后再处理。")
        return self.store.update(record_id, region=result["region"],
                                 detection={"region": result["region"],
                                            "hits": result["hits"],
                                            "coverage": result["coverage"],
                                            "message": message},
                                 message=message)

    # ---------- 报价（免费） ----------
    def quote(self, record_id: str, region: Any, quality: str) -> SubtitleRecord:
        if quality not in QUALITIES:
            raise SubtitleError(400, "invalid_input", "仅支持标准/精细两档去字幕。")
        record = self.store.get(record_id)
        if record is None:
            raise SubtitleError(404, "not_found", "记录不存在，请重新导入原片。")
        effective = region_rules.require_canonical(region)
        duration = float((record.metadata or {}).get("duration") or 0)
        quote = {
            "quoteId": uuid.uuid4().hex,
            "modelName": self.model_name,
            "quality": quality,
            "duration": duration,
            "estimatedPoints": 0.0,
            "unitPrice": 0.0,
            "pricingMode": PRICING_MODE,
            "effectiveRegion": effective,
            "regionNormalization": region_rules.SCHEMA,
            "createdAt": time.time(),
        }
        return self.store.update(record.id, region=effective, quality=quality,
                                 quote=quote, phase=QUOTED,
                                 message="本功能免费；确认后开始处理，不会产生任何费用。")

    # ---------- 云端提交 ----------
    def submit(self, record_id: str, region: Any, quality: str, quote_id: str,
               confirmed: bool, *, background: bool = True) -> SubtitleRecord:
        record = self.store.get(record_id)
        if record is None:
            raise SubtitleError(404, "not_found", "记录不存在，请重新导入原片。")
        if not confirmed:
            raise SubtitleError(400, "invalid_input", "未确认，不能提交云端处理。")
        effective = region_rules.require_canonical(region)
        quote = record.quote or {}
        if (record.phase != QUOTED or quote.get("quoteId") != quote_id
                or quote.get("quality") != quality
                or quote.get("effectiveRegion") != effective):
            raise SubtitleError(409, "quote_stale", MESSAGE_STALE_QUOTE)
        if not self.is_configured():
            raise SubtitleError(409, "cloud_unconfigured", MESSAGE_CLOUD_UNCONFIGURED)
        if self.task_store is None:
            raise SubtitleError(503, "unsupported", "任务队列未就绪。")

        task = self.task_store.create("subtitle.cloud.remove", "D3",
                                      {"recordId": record_id, "quality": quality},
                                      idempotency_key=f"subtitle-cloud:{record_id}:"
                                                      f"{quote_id}")
        self._tasks[record_id] = task.id
        self.store.update(record_id, phase=SUBMITTING, progress=0.0, error="",
                          message="正在上传到云端处理（免费）…")
        if background:
            threading.Thread(target=self._run_cloud, args=(task.id, record_id, effective, quality),
                             name=f"subtitle-cloud-{record_id[:6]}", daemon=True).start()
        else:
            self._run_cloud(task.id, record_id, effective, quality)
        return self.store.get_or_raise(record_id)

    def _run_cloud(self, task_id: str, record_id: str, region: dict[str, int],
                   quality: str) -> None:
        assert self.task_store is not None
        try:
            task = self.task_store.start(task_id)
        except KeyError:
            return
        record = self.store.get_or_raise(record_id)
        source = (self.storage_root / record.source_file).resolve()
        self.store.update(record_id, progress=0.2, message="云端处理中…")
        try:
            client = self.cloud_client()
            if client is None:
                raise CloudError("unconfigured", MESSAGE_CLOUD_UNCONFIGURED)
            data = client.remove_subtitle(source, region, quality)
            rel = f"results/{record_id}-cloud.mp4"
            target = self.storage_root / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            self.store.append_history(record_id, {"file": rel, "processingMode": "cloud"})
            self.task_store.succeed(task.id, {"bytes": len(data)})
            self.store.update(record_id, phase=DONE, progress=1.0, result_file=rel,
                              message="云端处理完成（未产生费用）。")
        except CloudError as exc:
            self.task_store.fail(task.id, "network" if exc.code == "network" else "internal",
                                 exc.message)
            self.store.update(record_id, phase=ERROR, error=exc.message,
                              message="云端处理失败，原片未改动，未产生费用。")
        except Exception as exc:  # noqa: BLE001
            self.task_store.fail(task.id, "internal", repr(exc))
            self.store.update(record_id, phase=ERROR, error=str(exc),
                              message="云端处理失败，原片未改动，未产生费用。")

    # ---------- 本地处理 ----------
    def local_start(self, record_id: str, mode: str, region: Any = None, *,
                    background: bool = True) -> SubtitleRecord:
        if mode not in ("strip", "repair"):
            raise SubtitleError(400, "invalid_input", "未知的本地处理方式。")
        record = self.store.get(record_id)
        if record is None:
            raise SubtitleError(404, "not_found", "记录不存在，请重新导入原片。")
        if not record.source_file:
            raise SubtitleError(409, "invalid_input", "原片缺失，请重新导入。")

        area = None
        if mode == "repair":
            area = region_rules.require_canonical(region)
            available, why = _repair_available()
            if not available:
                raise SubtitleError(501, "unsupported", why)
        if self.task_store is None:
            raise SubtitleError(503, "unsupported", "任务队列未就绪，无法开始本地处理。")

        task = self.task_store.create(
            f"subtitle.local.{mode}", "D3",
            {"recordId": record_id, "mode": mode, "region": area},
            idempotency_key=f"subtitle-local:{record_id}:{uuid.uuid4().hex[:8]}")
        self._tasks[record_id] = task.id
        self.store.update(record_id, phase=LOCAL_PREPARING, progress=0.0, error="",
                          message="本地处理准备中（不上传、不扣费）。",
                          processing_mode="local", local_mode=mode,
                          region=area or record.region)
        if background:
            threading.Thread(target=self._run_local, args=(task.id, record_id, mode),
                             name=f"subtitle-local-{record_id[:6]}", daemon=True).start()
        else:
            self._run_local(task.id, record_id, mode)
        return self.store.get_or_raise(record_id)

    def local_stop(self, record_id: str) -> SubtitleRecord:
        record = self.store.get(record_id)
        if record is None:
            raise SubtitleError(404, "not_found", "记录不存在。")
        task_id = self._tasks.pop(record_id, None)
        if task_id and self.task_store is not None:
            try:
                self.task_store.cancel(task_id)
            except (KeyError, ValueError):
                pass
        return self.store.update(record_id, phase=CANCELED, error="",
                                 message="已取消处理；原片未改动。")

    def _run_local(self, task_id: str, record_id: str, mode: str) -> None:
        assert self.task_store is not None
        try:
            task = self.task_store.start(task_id)
        except KeyError:
            return
        record = self.store.get_or_raise(record_id)
        source = (self.storage_root / record.source_file).resolve()
        self.store.update(record_id, phase=LOCAL_PROCESSING, progress=0.1,
                          message="正在读取原片…")

        def progress(ratio: float, text: str) -> None:
            self.store.update(record_id, progress=min(0.99, 0.1 + ratio * 0.85),
                              message=text)

        def canceled() -> bool:
            current = self.task_store.get(task_id) if self.task_store else None
            return bool(current and current.state == CANCELED)

        try:
            if mode == "strip":
                data = source.read_bytes()
                stripped, dropped = mp4.strip_subtitle_tracks(data)
                if not dropped:
                    self.task_store.succeed(task.id, {"dropped": 0})
                    self.store.update(record_id, phase=DONE, progress=1.0,
                                      message=MESSAGE_NO_SUBTITLE_TRACK)
                    return
                rel = f"results/{record_id}-strip.mp4"
                target = self.storage_root / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(stripped)
                self.task_store.succeed(task.id, {"dropped": dropped, "file": rel})
                self.store.append_history(record_id, {"file": rel, "processingMode": "local"})
                self.store.update(record_id, phase=DONE, progress=1.0, result_file=rel,
                                  message=f"已移除 {dropped} 条独立字幕轨；原片保留。")
                return

            rel = f"results/{record_id}-repair.mp4"
            target = self.storage_root / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            stats = repair.repair_video(source, target, record.region or {}, on_progress=progress,
                                        should_cancel=canceled)
            self.task_store.succeed(task.id, stats)
            self.store.append_history(record_id, {"file": rel, "processingMode": "local"})
            self.store.update(record_id, phase=DONE, progress=1.0, result_file=rel,
                              message=f"已修补 {stats['frames']} 帧；原片保留。{MESSAGE_REPAIR_HINT}")
        except repair.RepairCanceled:
            self.store.update(record_id, phase=CANCELED, error="",
                              message="已取消本地修补；原片未改动。")
        except repair.RepairUnavailable as exc:
            self.task_store.fail(task.id, "unsupported", str(exc))
            self.store.update(record_id, phase=ERROR, error=str(exc),
                              message="本地修补不可用，原片未改动。")
        except Exception as exc:  # noqa: BLE001
            self.task_store.fail(task_id, "internal", repr(exc))
            self.store.update(record_id, phase=ERROR, error=str(exc),
                              message="本地处理失败，原片未改动。")


def _repair_available() -> tuple[bool, str]:
    """像素修补依赖 ffmpeg + numpy/cv2；缺失时要在启动阶段就告诉用户。"""
    try:
        repair._require_tools()
    except repair.RepairUnavailable as exc:
        return False, str(exc)
    return True, MESSAGE_REPAIR_HINT
