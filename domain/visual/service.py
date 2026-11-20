"""视觉域服务（P3-02 第一片）：样式目录 + 节点自省。

样式目录是旧版真实数据（324 条，含 prompt/negative 与预览图），
优先读 `data/visual-styles.json`（可用 tools 脚本导出），
没有则回落到 `spec/api-samples/api_visual_styles.json` 的抓包正文——
保证"开箱即用、与旧版一致"，同时允许后续用管理端覆盖。
"""

from __future__ import annotations

import json
import pathlib
import uuid
from typing import Any

from .nodes import Executor, NodeError, NodeRegistry, default_registry
from .store import VisualStore

ROOT = pathlib.Path(__file__).resolve().parents[2]
FALLBACK = ROOT / "spec" / "api-samples" / "api_visual_styles.json"


class VisualError(RuntimeError):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


class VisualService:
    def __init__(self, styles_path: str | pathlib.Path | None = None,
                 registry: NodeRegistry | None = None,
                 store: VisualStore | None = None,
                 workspace: str | pathlib.Path | None = None) -> None:
        self.styles_path = pathlib.Path(styles_path or ROOT / "data" / "visual-styles.json")
        self.registry = registry or default_registry()
        self.store = store
        self.workspace = pathlib.Path(workspace or ROOT / "data" / "visual")
        self._cache: list[dict[str, Any]] | None = None

    def _load(self) -> list[dict[str, Any]]:
        if self._cache is not None:
            return self._cache
        styles: list[dict[str, Any]] = []
        if self.styles_path.exists():
            try:
                data = json.loads(self.styles_path.read_text(encoding="utf-8"))
                styles = data.get("styles") if isinstance(data, dict) else data
            except json.JSONDecodeError:
                styles = []
        if not styles and FALLBACK.exists():
            body = json.loads(FALLBACK.read_text(encoding="utf-8")).get("body") or {}
            styles = body.get("styles") or []
        self._cache = styles if isinstance(styles, list) else []
        return self._cache

    def styles(self) -> dict[str, Any]:
        styles = self._load()
        return {
            "ok": True,
            "styles": styles,
            "count": len(styles),
            "source": "local" if self.styles_path.exists() else "baseline",
            "message": "" if styles else "样式库为空：请放置 data/visual-styles.json。",
        }

    def style(self, style_id: str) -> dict[str, Any]:
        for item in self._load():
            if item.get("id") == style_id:
                return item
        raise KeyError(f"样式不存在: {style_id}")

    def nodes(self) -> dict[str, Any]:
        """节点自省：分阶段列出节点与可用流水线（前端画进度条用）。"""
        return self.registry.describe()

    def run_pipeline(self, name: str, ctx: dict[str, Any],
                     services: dict[str, Any] | None = None) -> dict[str, Any]:
        """按预设流水线执行，返回 trace 与"白名单"上下文（避免把大对象回给前端）。"""
        pipelines = self.registry.pipelines()
        if name not in pipelines:
            raise VisualError(400, "invalid_input",
                              f"未知流水线: {name}（可用: {sorted(pipelines)}）")
        context = dict(ctx)
        if services:
            context["_services"] = services
        executor = Executor(self.registry)
        try:
            result = executor.run(pipelines[name], context)
        except NodeError as exc:
            # 失败时把已完成步骤一起回给前端，便于只重试失败那一段
            return {"ok": False, "error": "node_failed", "message": str(exc),
                    "pipeline": name, "trace": executor.summary()}
        keys = ("sourceText", "characters", "shots", "assetsMatched", "assetsCount",
                "cards", "cardCount", "quote", "drafts", "mediaTasks", "submitted",
                "mediaStates", "export")
        return {"ok": True, "pipeline": name, "steps": pipelines[name],
                "trace": executor.summary(),
                "context": {key: result[key] for key in keys if key in result}}

    def execute(self, pipeline: list[str], ctx: dict[str, Any]) -> dict[str, Any]:
        executor = Executor(self.registry)
        result = executor.run(pipeline, dict(ctx))
        return {"ok": True, "trace": executor.summary(), "context": {
            key: result[key] for key in ("planned", "fps") if key in result}}

    # ---------- 项目 CRUD ----------
    def _store(self) -> VisualStore:
        if self.store is None:
            raise VisualError(503, "unsupported", "项目库未就绪。")
        return self.store

    def projects(self) -> dict[str, Any]:
        items = self._store().list()
        brief = []
        for project in items:
            assets = project.get("assets") or {}
            settings = project.get("settings") or {}
            counts = {kind: len(assets.get(kind) or [])
                      for kind in ("people", "scenes", "props")}
            macro = settings.get("macroArrangement") or {}
            cards = macro.get("cards") or []
            videos = [card for card in cards
                      if str(card.get("status") or "") == "done"]
            images = [row for kind in ("people", "scenes", "props")
                      for row in (assets.get(kind) or []) if row.get("imageFile")]
            brief.append({
                "id": project["id"], "name": project["name"],
                "projectName": project.get("projectName") or project["name"],
                "style": project["style"], "thumbnail": project["thumbnail"],
                "scenes": len(project["scenes"]),
                "createdAt": project["createdAt"],
                "updatedAt": project["updatedAt"],
                "peopleCount": counts["people"], "sceneCount": counts["scenes"],
                "propCount": counts["props"],
                "cardCount": len(cards), "episodeCount": len(cards),
                "videoCount": len(videos), "imageCount": len(images),
                "macroSceneCount": len(macro.get("scenes") or []),
            })
        return {"ok": True, "projects": brief}

    def project(self, project_id: str) -> dict[str, Any]:
        store = self._store()
        record = store.get(project_id)
        if record is None:
            raise VisualError(404, "not_found", "项目不存在或已删除。")
        # 旧项目自愈：已有资产但缺 workflowAssetSourceHash 时，按当前正文补上。
        # 前端"下一步：分镜"的守卫只认这个字段，缺了会提示"请先识别人物场景物品"。
        settings = dict(record.get("settings") or {})
        assets = record.get("assets") or {}
        has_assets = any(assets.get(kind) for kind in ("people", "scenes", "props"))
        if has_assets and not settings.get("workflowAssetSourceHash"):
            source = str(settings.get("confirmedScript")
                         or settings.get("sourceStructure") or "")
            if source.strip():
                value = 2166136261
                for char in source:
                    value = ((value ^ ord(char)) * 16777619) & 0xFFFFFFFF
                settings["workflowAssetSourceHash"] = f"{value:08x}"
                settings["workflowAssetSourceLength"] = len(source)
                store.update(project_id, settings=settings)
                record = store.get(project_id)
        return {"ok": True, "project": record}

    def create_project(self, payload: dict[str, Any]) -> dict[str, Any]:
        store = self._store()
        name = str(payload.get("projectName") or payload.get("name") or "").strip()
        if not name:
            raise VisualError(400, "invalid_input", "项目名称不能为空。")
        settings = payload.get("settings")
        if settings is not None and not isinstance(settings, dict):
            raise VisualError(400, "invalid_input", "settings 必须是对象。")
        record = store.create(
            uuid.uuid4().hex, name,
            description=str(payload.get("projectDescription") or ""),
            style=str(payload.get("style") or ""),
            settings=settings or {},
            request_id=str(payload.get("createRequestId") or "") or None)
        return {"ok": True, "project": record}

    def save_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        store = self._store()
        project_id = str(payload.get("projectId") or "")
        if not store.get(project_id):
            raise VisualError(404, "not_found", "项目不存在或已删除。")
        fields: dict[str, Any] = {}
        if "projectName" in payload:
            fields["name"] = str(payload.get("projectName") or "").strip() or "未命名项目"
        if "projectDescription" in payload:
            fields["description"] = str(payload.get("projectDescription") or "")
        if "settings" in payload:
            if not isinstance(payload["settings"], dict):
                raise VisualError(400, "invalid_input", "settings 必须是对象。")
            incoming = dict(payload["settings"])
            # 前端保存外观/线路设置时只带部分字段；缺的键要继承，否则会把
            # 已提取资产或正文（confirmedScript）整块抹掉。
            current = (store.get(project_id) or {}).get("settings") or {}
            for key in ("assets", "confirmedScript", "sourceStructure",
                        "workflowPreparedScript", "workflowAssetSourceHash"):
                if key not in incoming and current.get(key):
                    incoming[key] = current[key]
            fields["settings"] = incoming
        if "style" in payload:
            fields["style"] = str(payload.get("style") or "")
        return {"ok": True, "project": store.update(project_id, **fields)}

    def delete_project(self, payload: dict[str, Any]) -> dict[str, Any]:
        project_id = str(payload.get("projectId") or "")
        removed = self._store().delete(project_id)
        if not removed:
            raise VisualError(404, "not_found", "项目不存在或已删除。")
        return {"ok": True, "projectId": project_id}

    def scenes(self, payload: dict[str, Any]) -> dict[str, Any]:
        """分镜生成需要图像模型，尚未接入；这里如实拒绝，不建空任务。"""
        project_id = str(payload.get("projectId") or "")
        if not self._store().get(project_id):
            raise VisualError(404, "not_found", "项目不存在或已删除。")
        raise VisualError(501, "unsupported",
                          "分镜生成需要图像模型，新内核尚未接入；项目与设置已可正常保存。")
