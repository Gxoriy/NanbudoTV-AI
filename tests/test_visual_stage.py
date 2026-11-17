"""视觉域"分镜/剧集/成片"16 条路由的验收。

LLM 用假实现（不打真网），图像分析用真 PNG（cv2 实际读像素）。
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.api import Request, Router, parse_query  # noqa: E402
from app.api import visual_stage  # noqa: E402
from domain.visual import VisualService  # noqa: E402
from domain.visual.library import LibraryStore  # noqa: E402
from domain.visual.store import VisualStore  # noqa: E402


class FakeAssist:
    """只回答固定的短结构，模拟"逐镜头短请求"的 LLM 渠道。"""

    def __init__(self) -> None:
        self.plan_calls: list[int] = []

    def ready(self) -> bool:
        return True

    def complete(self, system: str, user: str) -> str:  # noqa: ARG002
        return "雨夜街道，外卖员撑伞背影，电影感"

    def normalize(self, requirement: str) -> dict:
        return {"ok": True, "normalized": {"title": "雨夜",
                                           "genre": "都市",
                                           "characters": ["外卖员"],
                                           "conflict": requirement[:20]}}

    def plan(self, requirement: str, *, shots: int = 6,
             system: str | None = None) -> dict:
        self.plan_calls.append(shots)
        self.systems = getattr(self, "systems", [])
        self.systems.append(system or "")
        return {"ok": True, "count": shots,
                "shots": [{"index": i, "seconds": 4,
                           "shot": f"镜头{i}",
                           "prompt": f"提示词{i}"} for i in range(1, shots + 1)]}


class StageRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.service = VisualService(styles_path=self.root / "styles.json",
                                     store=VisualStore(self.root / "visual.db"),
                                     workspace=self.root / "visual")
        self.library = LibraryStore(self.root / "lib.db",
                                    files_root=self.root / "files")
        self.assist = FakeAssist()
        self.router = Router()
        visual_stage.build(self.router, self.service, self.library, assist=self.assist)
        self.project_id = self.service.create_project({"projectName": "剧集"})["project"]["id"]

    def tearDown(self) -> None:
        self.library.close()
        self.service.store.close()
        self._tmp.cleanup()

    # ---------- 辅助 ----------
    def call(self, method: str, path: str, body: dict | None = None):
        parsed = urlparse(path)
        raw = json.dumps(body).encode() if body is not None else b""
        return self.router.dispatch(Request(
            method=method, path=path, query=parse_query(parsed.query),
            headers={"content-type": "application/json"} if body is not None else {},
            body=raw))

    # ---------- 源素材与准备 ----------
    def test_project_source_roundtrip(self) -> None:
        self.assertEqual(self.call("GET", f"/api/visual/project/source?projectId={self.project_id}")
                         .payload["hasSource"], False)
        saved = self.call("POST", "/api/visual/project/source/save",
                          {"projectId": self.project_id, "text": "第一场：雨夜"})
        self.assertEqual(saved.status, 200)
        got = self.call("GET", f"/api/visual/project/source?projectId={self.project_id}")
        self.assertEqual(got.payload["text"], "第一场：雨夜")
        self.assertTrue(got.payload["hasSource"])

    def test_prepare_uses_llm_and_persists(self) -> None:
        resp = self.call("POST", "/api/visual/project/prepare",
                         {"projectId": self.project_id, "requirement": "雨夜送餐", "shots": 3})
        self.assertEqual(resp.status, 200, resp.payload)
        self.assertEqual(len(resp.payload["prepared"]["shots"]), 3)
        self.assertEqual(resp.payload["prepared"]["normalized"]["genre"], "都市")

    def test_prepare_runs_staged_pipeline(self) -> None:
        """对齐原包 core.pipeline：normalize → storyboard → assemble，且带回耗时。"""
        resp = self.call("POST", "/api/visual/project/prepare",
                         {"projectId": self.project_id, "requirement": "雨夜送餐",
                          "shots": 2})
        self.assertEqual(resp.status, 200, resp.payload)
        names = [stage["name"] for stage in resp.payload["stages"]]
        self.assertEqual(names, ["normalize", "storyboard", "assemble"])
        self.assertTrue(all(stage["ok"] for stage in resp.payload["stages"]))
        self.assertEqual(resp.payload["summary"]["count"], 2)
        self.assertEqual(resp.payload["summary"]["totalSeconds"], 8.0)
        # 分镜阶段必须带上原版规则摘录
        self.assertIn("原版规则摘录", self.assist.systems[-1])

    def test_prepare_reports_failed_stage(self) -> None:
        class Boom(self.__class__ if False else object):
            pass

        class BadAssist(FakeAssist):
            def normalize(self, requirement: str) -> dict:  # noqa: ARG002
                raise RuntimeError("渠道 429")

        router = Router()
        visual_stage.build(router, self.service, self.library, assist=BadAssist())
        resp = router.dispatch(Request(
            method="POST", path="/api/visual/project/prepare", query={},
            headers={"content-type": "application/json"},
            body=json.dumps({"projectId": self.project_id,
                             "requirement": "x"}).encode()))
        self.assertEqual(resp.status, 502)
        self.assertEqual(resp.payload["stages"][0]["name"], "normalize")
        self.assertFalse(resp.payload["stages"][0]["ok"])

    def test_prepare_requires_requirement(self) -> None:
        self.assertEqual(self.call("POST", "/api/visual/project/prepare",
                                   {"projectId": self.project_id}).status, 400)

    def test_unknown_project_is_404(self) -> None:
        self.assertEqual(self.call("POST", "/api/visual/project/prepare",
                                   {"projectId": "nope", "requirement": "x"}).status, 404)
        self.assertEqual(self.call("GET", "/api/visual/episode/state?projectId=nope").status, 404)

    # ---------- 分镜 ----------
    def test_scenes_persist_to_storyboard(self) -> None:
        self.call("POST", "/api/visual/project/source/save",
                  {"projectId": self.project_id, "text": "雨夜送餐的故事"})
        resp = self.call("POST", "/api/visual/project/scenes",
                         {"projectId": self.project_id, "shots": 4})
        self.assertEqual(resp.status, 200, resp.payload)
        self.assertEqual(resp.payload["count"], 4)
        state = self.call("GET", f"/api/visual/episode/state?projectId={self.project_id}")
        self.assertEqual(len(state.payload["scenes"]), 4)

    def test_storyboard_aliases_share_implementation(self) -> None:
        for path in ("/api/visual/cut-storyboard", "/api/visual/episode-cut",
                     "/api/visual/script-storyboard"):
            resp = self.call("POST", path, {"projectId": self.project_id,
                                            "text": "两个人对话", "shots": 2})
            self.assertEqual(resp.status, 200, path)
            self.assertEqual(resp.payload["count"], 2, path)
            self.assertEqual(len(resp.payload["scenes"]), 2, path)

    def test_storyboard_requires_script(self) -> None:
        self.assertEqual(self.call("POST", "/api/visual/cut-storyboard",
                                   {"projectId": self.project_id}).status, 400)

    # ---------- 素材分析 / 删除 ----------
    def test_assets_analyze_reads_real_pixels(self) -> None:
        try:
            import cv2  # noqa: PLC0415
            import numpy as np  # noqa: PLC0415
        except ImportError:
            self.skipTest("未安装 opencv")
        image = np.zeros((360, 640, 3), dtype=np.uint8)
        image[:, :] = (30, 40, 200)          # BGR：偏红
        png = self.root / "a.png"
        cv2.imwrite(str(png), image)

        relative = self.library.save_file("assets", "a.png", png.read_bytes())
        record = self.library.create("asset", "红图", {"file": relative, "type": "image"})
        resp = self.call("POST", "/api/visual/assets/analyze", {"assetId": record["id"]})
        self.assertEqual(resp.status, 200, resp.payload)
        analysis = resp.payload["analysis"]
        self.assertEqual((analysis["width"], analysis["height"]), (640, 360))
        self.assertEqual(analysis["orientation"], "landscape")
        self.assertTrue(analysis["palette"][0]["hex"].endswith("C8281E")
                        or analysis["palette"][0]["ratio"] > 0.5)
        self.assertIn("analysis", self.library.get(record["id"])["payload"])

    def test_assets_delete_removes_record_and_file(self) -> None:
        relative = self.library.save_file("assets", "x.png", b"IMG")
        record = self.library.create("asset", "临时", {"file": relative, "type": "image"})
        resp = self.call("POST", "/api/visual/assets/delete", {"ids": [record["id"]]})
        self.assertEqual(resp.payload["removed"], 1)
        self.assertIsNone(self.library.get(record["id"]))
        self.assertFalse((self.root / "files" / relative).exists())

    def test_singular_asset_delete_returns_project(self) -> None:
        """前端用的是 /api/visual/asset/delete（单数），并要求返回最新项目。"""
        relative = self.library.save_file("assets", "one.png", b"IMG")
        record = self.library.create("asset", "单张", {"file": relative, "type": "image",
                                                       "projectId": self.project_id})
        resp = self.call("POST", "/api/visual/asset/delete",
                         {"projectId": self.project_id, "kind": "image",
                          "assetId": record["id"]})
        self.assertEqual(resp.status, 200, resp.payload)
        self.assertEqual(resp.payload["assetId"], record["id"])
        self.assertEqual(resp.payload["project"]["id"], self.project_id)
        self.assertIsNone(self.library.get(record["id"]))

    # ---------- 剧集设置与状态 ----------
    def test_episode_settings_and_state(self) -> None:
        saved = self.call("POST", "/api/visual/episode/settings",
                          {"projectId": self.project_id, "ratio": "9:16", "fps": 24})
        self.assertEqual(saved.payload["settings"]["ratio"], "9:16")
        state = self.call("GET", f"/api/visual/episode/state?projectId={self.project_id}")
        self.assertEqual(state.payload["settings"]["fps"], 24)
        self.assertEqual(state.payload["assets"]["total"], 0)

    def test_episode_prompt_uses_llm(self) -> None:
        resp = self.call("POST", "/api/visual/episode/prompt",
                         {"projectId": self.project_id, "scene": "雨夜街道"})
        self.assertEqual(resp.status, 200)
        self.assertIn("雨夜", resp.payload["prompt"])

    def test_episode_references_roundtrip(self) -> None:
        self.assertEqual(self.call("GET", f"/api/visual/episode/references?projectId={self.project_id}")
                         .payload["references"], [])
        saved = self.call("POST", "/api/visual/episode/references",
                          {"projectId": self.project_id,
                           "references": [{"file": "a.png"}]})
        self.assertEqual(saved.payload["references"][0]["file"], "a.png")
        self.assertEqual(self.call("POST", "/api/visual/episode/references",
                                   {"projectId": self.project_id,
                                    "references": "bad"}).status, 400)

    def test_video_reset_only_removes_project_videos(self) -> None:
        keep = self.library.create("asset", "图", {"file": "", "type": "image",
                                                   "projectId": self.project_id})
        video = self.library.create("asset", "片", {"file": "", "type": "video",
                                                    "projectId": self.project_id})
        resp = self.call("POST", "/api/visual/episode/video/reset",
                         {"projectId": self.project_id})
        self.assertEqual(resp.payload["removed"], 1)
        self.assertIsNotNone(self.library.get(keep["id"]))
        self.assertIsNone(self.library.get(video["id"]))

    # ---------- 成片预览 / 下载 / 归档 ----------
    def test_video_preview_serves_bytes(self) -> None:
        relative = self.library.save_file("videos", "clip.mp4", b"\x00\x00\x00\x20ftyp")
        record = self.library.create("asset", "片", {"file": relative, "type": "video",
                                                     "projectId": self.project_id})
        resp = self.call("GET", f"/api/visual/video-preview?id={record['id']}")
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.raw, b"\x00\x00\x00\x20ftyp")

    def test_project_download_prefers_video(self) -> None:
        self.assertEqual(self.call("GET", f"/api/visual/download?id={self.project_id}").status, 404)
        relative = self.library.save_file("videos", "final.mp4", b"FINAL")
        self.library.create("asset", "成片", {"file": relative, "type": "video",
                                              "projectId": self.project_id})
        resp = self.call("GET", f"/api/visual/download?id={self.project_id}")
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.raw, b"FINAL")

    def test_archive_flags_project(self) -> None:
        resp = self.call("POST", "/api/visual/archive", {"projectId": self.project_id})
        self.assertTrue(resp.payload["archived"])
        resp = self.call("POST", "/api/visual/archive",
                         {"projectId": self.project_id, "archived": False})
        self.assertFalse(resp.payload["archived"])

    # ---------- 无 LLM 时的语义 ----------
    def test_without_assist_returns_503(self) -> None:
        router = Router()
        visual_stage.build(router, self.service, self.library, assist=None)
        resp = router.dispatch(Request(
            method="POST", path="/api/visual/project/scenes", query={},
            headers={"content-type": "application/json"},
            body=json.dumps({"projectId": self.project_id,
                             "requirement": "x"}).encode()))
        self.assertEqual(resp.status, 503)
        self.assertEqual(resp.payload["error"], "model_unconfigured")


if __name__ == "__main__":
    unittest.main()
