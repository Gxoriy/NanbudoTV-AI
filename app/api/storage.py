"""S4 本地存储：缓存统计、存储设置、清理与重试。

全部是本地文件系统操作，不依赖模型；契约字段与旧样本一致
（`api_local-cache.json`、`api_local-storage_settings.json`、`api_storage_status.json`）。
"""

from __future__ import annotations

import pathlib
import shutil

from .router import Request, Response, Router
from domain.workspace.store import DocStore

FEATURES = [
    ("rewrite", "剧本改写"), ("original", "一键原创"), ("workflow", "短剧工作流"),
    ("breakdown", "爆款拆解"), ("canvas", "视频画布"), ("prompt_reverse", "提示词反推"),
    ("characters", "数字人角色库"), ("ecommerce", "AI电商宣传片"), ("store", "门店视频"),
    ("advertising", "广告投放"),
]

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".mkv", ".webm"}
AUDIO_EXT = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}


def _bucket(ext: str) -> str:
    if ext in IMAGE_EXT:
        return "images"
    if ext in VIDEO_EXT:
        return "videos"
    if ext in AUDIO_EXT:
        return "audio"
    return "other"


def _empty() -> dict[str, dict[str, int]]:
    return {key: {"files": 0, "bytes": 0}
            for key in ("images", "videos", "audio", "other")}


def _scan(root: pathlib.Path) -> dict[str, dict[str, int]]:
    stats = _empty()
    if not root.exists():
        return stats
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        bucket = stats[_bucket(path.suffix.lower())]
        bucket["files"] += 1
        bucket["bytes"] += path.stat().st_size
    return stats


def build(router: Router, store: DocStore, *, data_dir: pathlib.Path,
          install_root: pathlib.Path) -> None:
    uploads = data_dir / "uploads"
    generated = data_dir / "subtitle"
    downloads = data_dir / "downloads"

    def _sum(stats: dict[str, dict[str, int]]) -> int:
        return sum(item["bytes"] for item in stats.values())

    def local_cache(req: Request) -> Response:
        scope = req.q1("scope") or "project_thumbnails"
        gen, down, src = _scan(generated), _scan(downloads), _scan(uploads)
        return Response(200, {
            "ok": True, "scope": scope,
            "generated": gen, "downloads": down, "sources": src,
            "totalBytes": _sum(gen) + _sum(down) + _sum(src),
        })

    def settings_get(_req: Request) -> Response:
        paths = store.get_setting("storage.paths", {}) or {}
        return Response(200, {
            "ok": True,
            "features": [{"id": fid, "label": label, "path": paths.get(fid, "")}
                         for fid, label in FEATURES],
            "errors": [], "pendingCount": 0,
        })

    def settings_save(req: Request) -> Response:
        body = req.json()
        paths = body.get("paths") or body.get("features") or {}
        clean: dict[str, str] = {}
        errors: list[str] = []
        if isinstance(paths, dict):
            for key, value in paths.items():
                text = str(value or "").strip()
                if not text:
                    continue
                target = pathlib.Path(text)
                if not target.is_absolute():
                    errors.append(f"{key}: 必须是绝对路径")
                    continue
                clean[str(key)] = text
        store.set_setting("storage.paths", clean)
        return Response(200, {"ok": True, "saved": len(clean), "errors": errors})

    def storage_status(_req: Request) -> Response:
        upload_stats = _scan(uploads)
        return Response(200, {
            "ok": True,
            "uploadBytes": _sum(upload_stats),
            "uploadFileCount": sum(item["files"] for item in upload_stats.values()),
            "historyCount": len(store.list("rewrite", limit=1000))
            + len(store.list("breakdown", limit=1000)),
            "downloadedSeriesCount": sum(item["files"] for item in
                                         _scan(downloads).values()),
            "storagePath": str(uploads),
            "installPath": str(install_root),
            "busy": False,
        })

    def storage_clear(req: Request) -> Response:
        body = req.json() if req.body else {}
        scope = str(body.get("scope") or req.q1("scope") or "downloads")
        targets = {"downloads": downloads, "generated": generated,
                   "uploads": uploads}.get(scope)
        if targets is None:
            return Response.error(400, "invalid_input", f"未知清理范围: {scope}")
        freed = _sum(_scan(targets))
        if targets.exists():
            shutil.rmtree(targets, ignore_errors=True)
        targets.mkdir(parents=True, exist_ok=True)
        return Response(200, {"ok": True, "scope": scope, "freedBytes": freed})

    def retry(_req: Request) -> Response:
        stats = _scan(uploads)
        return Response(200, {"ok": True, "pendingCount": 0,
                              "checkedFiles": sum(i["files"] for i in stats.values()),
                              "message": "本地存储无需重试，已重新扫描。"})

    router.register("S4", "/api/local-cache", local_cache)
    router.register("S4", "/api/local-storage/settings", settings_get)
    router.register("S4", "/api/local-storage/save", settings_save, methods=("POST",))
    router.register("S4", "/api/storage/status", storage_status)
    router.register("S4", "/api/storage/clear", storage_clear, methods=("POST",))
    router.register("S4", "/api/local-storage/retry", retry, methods=("POST",))
