"""视觉域"分镜/剧集/成片"这一段：把原来整片 501 的 18 条路由做成真实实现。

分工：
  - **纯本地**：剧集设置与状态、素材分析（cv2 读像素，不靠模型）、素材删除、
    成片预览/下载、归档、重置
  - **LLM**：项目准备、分镜生成、剧本转分镜（cut-storyboard / episode-cut /
    script-storyboard 三个入口其实是同一件事）、单镜提示词

为什么单独成模块：这些路由都围绕"剧集/分镜"这一层状态，塞进 visual_extra
会让那个文件继续膨胀，而它们之间又需要共享 upsert 语义。
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import time
from typing import Any

from .router import Request, Response, Router
from domain.prompts import compose
from domain.visual.service import VisualError, VisualService
from domain.visual.library import KIND_ASSET

SETTING_KIND = "episode_setting"
STORYBOARD_KIND = "storyboard"
CUT_CACHE_KIND = "cut_cache"
PREPARED_KIND = "project_prepared"

MAX_VIDEO_BYTES = 512 * 1024 * 1024


def build(router: Router, service: VisualService, library, *,
          assist=None) -> None:
    store = library
    if store is None:
        return

    # ---------- 小工具 ----------
    def _project(project_id: str) -> dict | None:
        if not project_id or service.store is None:
            return None
        return service.store.get(project_id)

    def _require_project(project_id: str) -> Response | None:
        if not project_id:
            return Response.error(400, "invalid_input", "缺少 projectId。")
        if _project(project_id) is None:
            return Response.error(404, "not_found", "项目不存在或已删除。")
        return None

    def _find(kind: str, project_id: str) -> dict | None:
        for row in store.list(kind, limit=1000):
            if row["payload"].get("projectId") == project_id:
                return row
        return None

    def _upsert(kind: str, project_id: str, data: dict[str, Any],
                name: str = "") -> dict:
        row = _find(kind, project_id)
        if row is not None:
            merged = {**row["payload"], **data, "projectId": project_id}
            return store.update(row["id"], payload=merged)
        return store.create(kind, name or f"{kind}-{project_id[:8]}",
                            {"projectId": project_id, **data})

    def _cut_key(source: str, shots: int, purpose: str) -> str:
        """切分指纹：源文本 + 镜数 + 用途。源文本一改，指纹立刻不同。"""
        raw = f"{purpose}\x01{shots}\x01{source.strip()}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]

    def _cut_lookup(key: str) -> dict | None:
        for row in store.list(CUT_CACHE_KIND, limit=500):
            if row["payload"].get("key") == key:
                return row
        return None

    def _cut_store(key: str, purpose: str, source: str, shots: int,
                   data: Any) -> dict:
        existing = _cut_lookup(key)
        payload = {"key": key, "purpose": purpose, "shots": shots,
                   "data": data, "textLength": len(source),
                   "createdAt": time.time()}
        if existing is not None:
            return store.update(existing["id"],
                                payload={**existing["payload"], **payload})
        return store.create(CUT_CACHE_KIND, f"{purpose}-{key[:8]}", payload)

    def _require_assist() -> Response | None:
        if assist is None:
            return Response.error(503, "model_unconfigured",
                                  "LLM 未接入：请在 data/llm-profiles.json 配置渠道。")
        if not assist.ready():
            return Response.error(503, "model_unconfigured",
                                  "LLM 未就绪：llm-profiles.json 里没有可用密钥。")
        return None

    def _serve(relative: str, content_type: str) -> Response:
        path = store.file_path(relative)
        if path is None:
            return Response.error(404, "not_found", "文件不存在。")
        if path.stat().st_size > MAX_VIDEO_BYTES:
            return Response.error(413, "too_large", "文件过大，请直接从磁盘打开。")
        return Response(200, None, {}, raw=path.read_bytes(), content_type=content_type)

    # ---------- 项目准备 / 源素材 ----------
    def project_source(req: Request) -> Response:
        """GET 读原稿；POST 保存原稿（前端就是 POST 到同一个路径）。"""
        if req.method == "POST":
            body = req.json() if req.body else {}
            project_id = str(body.get("projectId") or req.q1("projectId") or "")
            problem = _require_project(project_id)
            if problem:
                return problem
            text = str(body.get("sourceText") or body.get("text") or "")
            current = _find("project_source", project_id)
            previous = str((current or {}).get("payload", {}).get("text") or "")
            expected = str(body.get("expectedSource") or "")
            if expected and previous and expected != previous:
                return Response.error(409, "conflict",
                                      "原稿已被其他窗口修改，请刷新后再保存。")
            _upsert("project_source", project_id, {"text": text}, name="项目源素材")
            project = _project(project_id)
            if project is not None and service.store is not None:
                try:
                    service.store.update(project_id, description=project["description"])
                except (KeyError, TypeError):
                    pass
            return Response(200, {"ok": True, "projectId": project_id,
                                  "project": project, "sourceText": text,
                                  "saved": True})

        project_id = req.q1("projectId") or req.q1("id") or ""
        problem = _require_project(project_id)
        if problem:
            return problem
        row = _find("project_source", project_id)
        payload = row["payload"] if row else {}
        source_file = str(payload.get("file") or "")
        return Response(200, {"ok": True, "projectId": project_id,
                              "text": str(payload.get("text") or ""),
                              "file": source_file,
                              "hasSource": bool(payload.get("text") or source_file)})

    def project_source_save(req: Request) -> Response:
        body = req.json()
        project_id = str(body.get("projectId") or "")
        problem = _require_project(project_id)
        if problem:
            return problem
        text = str(body.get("text") or "")
        row = _upsert("project_source", project_id,
                      {"text": text, "file": str(body.get("file") or "")},
                      name="项目源素材")
        return Response(200, {"ok": True, "source": row["payload"]})

    def project_prepare(req: Request) -> Response:
        """按需求做一次"准备"：LLM 归一 + 分镜规划，结果留档。"""
        body = req.json()
        project_id = str(body.get("projectId") or "")
        problem = _require_project(project_id)
        if problem:
            return problem
        problem = _require_assist()
        if problem:
            return problem
        requirement = str(body.get("requirement") or body.get("text") or "").strip()
        if not requirement:
            source = _find("project_source", project_id)
            requirement = str((source or {}).get("payload", {}).get("text") or "").strip()
        if not requirement:
            return Response.error(400, "invalid_input", "缺少需求描述或项目源素材。")
        shots = int(body.get("shots") or 6)
        cut_key = _cut_key(requirement, shots, "prepare")
        if not body.get("force"):
            hit = _cut_lookup(cut_key)
            if hit is not None:
                cached = hit["payload"].get("data") or {}
                return Response(200, {
                    "ok": True, "prepared": cached,
                    "stages": [{"name": "cache", "ok": True, "ms": 0}],
                    "summary": cached.get("summary") or {},
                    "cached": True, "fingerprint": cut_key,
                    "message": "命中上次准备结果，未调用模型。"})
        stages: list[dict[str, Any]] = []

        def stage(name: str, fn, *, min_ms: int = 0):
            started = time.perf_counter()
            try:
                value = fn()
                ok = True
            except Exception as exc:  # noqa: BLE001
                elapsed = int((time.perf_counter() - started) * 1000)
                stages.append({"name": name, "ok": False, "ms": elapsed,
                               "error": str(getattr(exc, "message", exc))[:120]})
                raise
            elapsed = int((time.perf_counter() - started) * 1000)
            stages.append({"name": name, "ok": ok, "ms": max(elapsed, min_ms)})
            return value

        try:
            normalized = stage("normalize", lambda: assist.normalize(requirement))
            planned = stage(
                "storyboard",
                lambda: assist.plan(
                    requirement, shots=max(1, min(shots, 12)),
                    concurrency=int(body.get("concurrency") or 2),
                    system=compose(
                        "storyboard",
                        role="你是短剧分镜规划师。",
                        task="把需求拆成可拍摄的镜头，每镜给出时长、画面与出图提示词。",
                        output="只输出 JSON，不要解释。")))
        except Exception as exc:  # noqa: BLE001
            response = _assist_error(exc)
            response.payload["stages"] = stages
            return response

        scenes = planned.get("shots") or []

        def assemble() -> dict[str, Any]:
            total = 0.0
            for index, scene in enumerate(scenes, start=1):
                scene.setdefault("index", index)
                try:
                    total += float(scene.get("seconds") or 0)
                except (TypeError, ValueError):
                    continue
            return {"count": len(scenes), "totalSeconds": round(total, 1)}

        summary = stage("assemble", assemble)
        row = _upsert(PREPARED_KIND, project_id,
                      {"requirement": requirement,
                       "normalized": normalized.get("normalized", normalized),
                       "shots": scenes, "summary": summary, "stages": stages},
                      name="项目准备")
        _cut_store(cut_key, "prepare", requirement, shots,
                   {"requirement": requirement,
                    "normalized": normalized.get("normalized", normalized),
                    "shots": scenes, "summary": summary})
        return Response(200, {"ok": True, "prepared": row["payload"],
                              "stages": stages, "summary": summary,
                              "cached": False, "fingerprint": cut_key})

    def project_scenes(req: Request) -> Response:
        """分镜生成：LLM 规划 + 落库，可重复调用（覆盖旧结果）。"""
        body = req.json()
        project_id = str(body.get("projectId") or "")
        problem = _require_project(project_id)
        if problem:
            return problem
        problem = _require_assist()
        if problem:
            return problem
        requirement = str(body.get("requirement") or "").strip()
        if not requirement:
            prepared = _find(PREPARED_KIND, project_id)
            requirement = str((prepared or {}).get("payload", {})
                              .get("requirement") or "").strip()
        if not requirement:
            source = _find("project_source", project_id)
            requirement = str((source or {}).get("payload", {}).get("text") or "").strip()
        if not requirement:
            return Response.error(400, "invalid_input",
                                  "缺少需求描述：请先保存项目源素材或传 requirement。")
        shots_wanted = int(body.get("shots") or 6)
        cut_key = _cut_key(requirement, shots_wanted, "scenes")
        if not body.get("force"):
            hit = _cut_lookup(cut_key)
            if hit is not None:
                cached = hit["payload"].get("data") or []
                return Response(200, {"ok": True, "scenes": cached,
                                      "count": len(cached), "cached": True,
                                      "fingerprint": cut_key,
                                      "storyboardId": hit["id"],
                                      "message": "命中上次切分，未调用模型。"})
        try:
            planned = assist.plan(
                requirement, shots=shots_wanted,
                concurrency=int(body.get("concurrency") or 2),
                system=compose(
                    "storyboard",
                    role="你是短剧分镜规划师。",
                    task="把剧本拆成镜头：时间连续、按序、无重叠；每镜写清构图、机位或运镜。",
                    output="只输出 JSON，不要解释。",
                    also=("continuity",)))
        except Exception as exc:  # noqa: BLE001
            return _assist_error(exc)
        scenes = planned.get("shots") or []
        row = _upsert(STORYBOARD_KIND, project_id, {"scenes": scenes,
                                                    "requirement": requirement},
                      name="分镜")
        if service.store is not None:
            try:
                service.store.update(project_id, scenes=scenes)
            except (KeyError, TypeError):
                pass
        _cut_store(cut_key, "scenes", requirement, shots_wanted, scenes)
        return Response(200, {"ok": True, "scenes": scenes, "count": len(scenes),
                              "storyboardId": row["id"], "cached": False,
                              "fingerprint": cut_key})

    # ---------- 素材分析与删除 ----------
    def assets_analyze(req: Request) -> Response:
        body = req.json()
        asset_id = str(body.get("assetId") or body.get("id") or "")
        record = store.get(asset_id) if asset_id else None
        relative = str((record or {}).get("payload", {}).get("file")
                       or body.get("file") or "")
        path = store.file_path(relative)
        if path is None:
            return Response.error(404, "not_found", "素材文件不存在。")
        if path.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp", ".bmp"):
            return Response.error(400, "invalid_input", "只支持分析图片素材。")
        try:
            import cv2  # noqa: PLC0415
            import numpy as np  # noqa: PLC0415
        except ImportError:
            return Response.error(501, "unsupported", "未安装 opencv，无法分析图片。")
        image = cv2.imread(str(path))
        if image is None:
            return Response.error(400, "invalid_input", "图片无法解码。")
        height, width = image.shape[:2]
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        small = cv2.resize(image, (64, 64), interpolation=cv2.INTER_AREA)
        pixels = small.reshape(-1, 3)
        quantized = (pixels // 32) * 32
        colors, counts = np.unique(quantized, axis=0, return_counts=True)
        order = counts.argsort()[::-1][:3]
        palette = [{"hex": "#{:02X}{:02X}{:02X}".format(int(colors[i][2]),
                                                        int(colors[i][1]),
                                                        int(colors[i][0])),
                    "ratio": round(float(counts[i]) / len(pixels), 3)}
                   for i in order]
        analysis = {
            "width": int(width), "height": int(height),
            "aspectRatio": round(width / height, 3) if height else 0,
            "brightness": round(float(gray.mean()) / 255, 3),
            "contrast": round(float(gray.std()) / 128, 3),
            "orientation": "portrait" if height > width else (
                "landscape" if width > height else "square"),
            "palette": palette,
            "suggestedRatio": "9:16" if height >= width else "16:9",
        }
        if record is not None:
            store.update(asset_id, payload={**record["payload"], "analysis": analysis})
        return Response(200, {"ok": True, "analysis": analysis, "file": relative})

    def assets_delete(req: Request) -> Response:
        body = req.json()
        ids = body.get("ids")
        if not isinstance(ids, list):
            single = str(body.get("assetId") or body.get("id") or "")
            ids = [single] if single else []
        if not ids:
            return Response.error(400, "invalid_input", "缺少 assetId 或 ids。")
        removed = 0
        missing: list[str] = []
        for asset_id in ids:
            record = store.get(str(asset_id))
            if record is None or record["kind"] != KIND_ASSET:
                missing.append(str(asset_id))
                continue
            relative = str(record["payload"].get("file") or "")
            path = store.file_path(relative) if relative else None
            if path is not None:
                path.unlink(missing_ok=True)
            store.delete(str(asset_id))
            removed += 1
        return Response(200, {"ok": True, "removed": removed, "missing": missing})

    def asset_delete_one(req: Request) -> Response:
        """前端用的是单数路径：{projectId, kind, assetId} → 返回项目最新状态。"""
        body = req.json()
        asset_id = str(body.get("assetId") or body.get("id") or "")
        project_id = str(body.get("projectId") or "")
        record = store.get(asset_id) if asset_id else None
        if record is None:
            return Response.error(404, "not_found", "素材不存在或已删除。")
        relative = str(record["payload"].get("file") or "")
        path = store.file_path(relative) if relative else None
        if path is not None:
            path.unlink(missing_ok=True)
        store.delete(asset_id)
        project = None
        if project_id and service.store is not None:
            project = service.store.get(project_id)
        return Response(200, {"ok": True, "assetId": asset_id,
                              "project": project,
                              "message": "已移除素材与关联引用；图片文件已删除。"})

    # ---------- 剧本转分镜（三个入口同一实现） ----------
    def _storyboard(req: Request, *, default_shots: int = 8) -> Response:
        body = req.json()
        project_id = str(body.get("projectId") or "")
        if project_id:
            problem = _require_project(project_id)
            if problem:
                return problem
        problem = _require_assist()
        if problem:
            return problem
        script = str(body.get("text") or body.get("script") or "").strip()
        if not script and project_id:
            source = _find("project_source", project_id)
            script = str((source or {}).get("payload", {}).get("text") or "").strip()
        if not script:
            return Response.error(400, "invalid_input", "缺少剧本正文。")
        shots_wanted = int(body.get("shots") or default_shots)
        cut_key = _cut_key(script, shots_wanted, "storyboard")
        if not body.get("force"):
            hit = _cut_lookup(cut_key)
            if hit is not None:
                cached = hit["payload"].get("data") or []
                return Response(200, {"ok": True, "storyboard": {"shots": cached},
                                      "scenes": cached, "count": len(cached),
                                      "cached": True, "fingerprint": cut_key,
                                      "message": "命中上次切分，未调用模型。"})
        try:
            planned = assist.plan(
                script, shots=shots_wanted,
                concurrency=int(body.get("concurrency") or 2),
                system=compose(
                    "storyboard",
                    role="你是短剧分镜师。",
                    task="按剧本时空承接连戏；动作、台词、表演与承接状态归入同一剧情单元。",
                    output="只输出 JSON，不要解释。",
                    also=("continuity",)))
        except Exception as exc:  # noqa: BLE001
            return _assist_error(exc)
        shots = planned.get("shots") or []
        if project_id:
            _upsert(STORYBOARD_KIND, project_id,
                    {"scenes": shots, "requirement": script}, name="分镜")
        _cut_store(cut_key, "storyboard", script, shots_wanted, shots)
        return Response(200, {"ok": True, "storyboard": {"shots": shots},
                              "scenes": shots, "count": len(shots),
                              "cached": False, "fingerprint": cut_key})

    def cut_storyboard(req: Request) -> Response:
        return _storyboard(req)

    def episode_cut(req: Request) -> Response:
        return _storyboard(req)

    def script_storyboard(req: Request) -> Response:
        return _storyboard(req)

    # ---------- 剧集设置与状态 ----------
    def episode_settings(req: Request) -> Response:
        body = req.json()
        project_id = str(body.get("projectId") or "")
        problem = _require_project(project_id)
        if problem:
            return problem
        data = {k: v for k, v in body.items() if k != "projectId"}
        row = _upsert(SETTING_KIND, project_id, {"settings": data}, name="剧集设置")
        return Response(200, {"ok": True, "settings": row["payload"].get("settings") or {}})

    def episode_state(req: Request) -> Response:
        project_id = req.q1("projectId") or req.q1("id") or ""
        problem = _require_project(project_id)
        if problem:
            return problem
        setting = _find(SETTING_KIND, project_id)
        board = _find(STORYBOARD_KIND, project_id)
        assets = [row for row in store.list(KIND_ASSET, limit=500)
                  if row["payload"].get("projectId") == project_id]
        return Response(200, {
            "ok": True, "projectId": project_id,
            "settings": (setting or {}).get("payload", {}).get("settings") or {},
            "scenes": (board or {}).get("payload", {}).get("scenes") or [],
            "assets": {"total": len(assets),
                        "images": sum(1 for r in assets
                                      if r["payload"].get("type") == "image"),
                        "videos": sum(1 for r in assets
                                      if r["payload"].get("type") == "video")},
        })

    def episode_prompt(req: Request) -> Response:
        """单镜提示词：短输出场景，符合当前 LLM 渠道的脾气。"""
        body = req.json()
        project_id = str(body.get("projectId") or "")
        if project_id:
            problem = _require_project(project_id)
            if problem:
                return problem
        problem = _require_assist()
        if problem:
            return problem
        subject = str(body.get("scene") or body.get("shot") or body.get("text") or "").strip()
        if not subject:
            return Response.error(400, "invalid_input", "缺少镜头描述。")
        try:
            text = assist.complete(
                compose(
                    "image_prompt",
                    role="你是短剧出图提示词工程师。",
                    task="把镜头描述改写成可直接出图的中文提示词。",
                    output="只输出提示词本身，不超过 60 字，不要解释。"),
                f"镜头：{subject[:200]}")
        except Exception as exc:  # noqa: BLE001
            return _assist_error(exc)
        prompt = text.strip()
        if project_id:
            _upsert(SETTING_KIND, project_id, {"lastPrompt": prompt}, name="剧集设置")
        return Response(200, {"ok": True, "prompt": prompt})

    def episode_references(req: Request) -> Response:
        body = req.json() if req.body else {}
        project_id = str(body.get("projectId") or req.q1("projectId") or "")
        problem = _require_project(project_id)
        if problem:
            return problem
        references = body.get("references")
        if references is None:
            row = _find(SETTING_KIND, project_id)
            return Response(200, {"ok": True,
                                  "references": (row or {}).get("payload", {})
                                  .get("references") or []})
        if not isinstance(references, list):
            return Response.error(400, "invalid_input", "references 必须是数组。")
        _upsert(SETTING_KIND, project_id, {"references": references}, name="剧集设置")
        return Response(200, {"ok": True, "references": references})

    def episode_video_reset(req: Request) -> Response:
        body = req.json()
        project_id = str(body.get("projectId") or "")
        problem = _require_project(project_id)
        if problem:
            return problem
        removed = 0
        for row in store.list(KIND_ASSET, limit=1000):
            payload = row["payload"]
            if payload.get("projectId") != project_id or payload.get("type") != "video":
                continue
            path = store.file_path(str(payload.get("file") or ""))
            if path is not None:
                path.unlink(missing_ok=True)
            store.delete(row["id"])
            removed += 1
        return Response(200, {"ok": True, "removed": removed})

    # ---------- 成片预览 / 下载 / 归档 ----------
    def video_preview(req: Request) -> Response:
        asset_id = req.q1("id") or req.q1("assetId") or ""
        record = store.get(asset_id) if asset_id else None
        relative = str((record or {}).get("payload", {}).get("file") or req.q1("file") or "")
        return _serve(relative, "video/mp4")

    def project_download(req: Request) -> Response:
        project_id = req.q1("id") or req.q1("projectId") or ""
        problem = _require_project(project_id)
        if problem:
            return problem
        source = _find("project_source", project_id)
        relative = str((source or {}).get("payload", {}).get("file") or "")
        if not relative:
            for row in store.list(KIND_ASSET, limit=1000):
                payload = row["payload"]
                if payload.get("projectId") == project_id and payload.get("type") == "video":
                    relative = str(payload.get("file") or "")
                    break
        if not relative:
            return Response.error(404, "not_found",
                                  "该项目还没有可下载的成片或源文件。")
        return _serve(relative, "application/octet-stream")

    def archive(req: Request) -> Response:
        body = req.json()
        project_id = str(body.get("projectId") or "")
        problem = _require_project(project_id)
        if problem:
            return problem
        archived = bool(body.get("archived", True))
        _upsert(SETTING_KIND, project_id, {"archived": archived}, name="剧集设置")
        return Response(200, {"ok": True, "archived": archived})

    # ---------- 错误归一 ----------
    def _assist_error(exc: Exception) -> Response:
        code = getattr(exc, "code", "")
        message = getattr(exc, "message", str(exc))
        status = getattr(exc, "status", 502)
        if code == "upstream_closed":
            message = ("上游中断连接（该渠道对长输出会断连）；已自动降级重试仍失败，"
                       "请减少镜头数或更换渠道。")
        return Response.error(int(status), str(code or "llm_failed"), str(message))

    # ---------- 注册 ----------
    router.register("D2", "/api/visual/project/source", project_source,
                    methods=("GET", "POST"))
    router.register("D2", "/api/visual/project/source/save", project_source_save,
                    methods=("POST",))
    router.register("D2", "/api/visual/project/prepare", project_prepare,
                    methods=("POST",))
    router.register("D2", "/api/visual/project/scenes", project_scenes,
                    methods=("POST",))
    router.register("D2", "/api/visual/assets/analyze", assets_analyze,
                    methods=("POST",))
    router.register("D2", "/api/visual/assets/delete", assets_delete, methods=("POST",))
    router.register("D2", "/api/visual/asset/delete", asset_delete_one, methods=("POST",))
    router.register("D2", "/api/visual/cut-storyboard", cut_storyboard, methods=("POST",))
    router.register("D2", "/api/visual/episode-cut", episode_cut, methods=("POST",))
    router.register("D2", "/api/visual/script-storyboard", script_storyboard,
                    methods=("POST",))
    router.register("D2", "/api/visual/episode/settings", episode_settings,
                    methods=("POST",))
    router.register("D2", "/api/visual/episode/state", episode_state)
    router.register("D2", "/api/visual/episode/prompt", episode_prompt, methods=("POST",))
    router.register("D2", "/api/visual/episode/references", episode_references,
                    methods=("GET", "POST"))
    router.register("D2", "/api/visual/episode/video/reset", episode_video_reset,
                    methods=("POST",))
    router.register("D2", "/api/visual/video-preview", video_preview)
    router.register("D2", "/api/visual/download", project_download)
    router.register("D2", "/api/visual/archive", archive, methods=("POST",))
