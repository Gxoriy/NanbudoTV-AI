"""P3-02 第一片验收：样式目录与旧版一致、节点注册表可扩展、执行器可追踪。"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from domain.visual import (  # noqa: E402
    Executor, NodeError, NodeRegistry, NodeSpec, VisualService, default_registry,
)

BASELINE = json.loads(
    (ROOT / "spec" / "api-samples" / "api_visual_styles.json")
    .read_text(encoding="utf-8"))["body"]


class StylesTest(unittest.TestCase):
    def test_styles_match_legacy_catalog(self) -> None:
        body = VisualService(styles_path=ROOT / "data" / "__missing__.json").styles()
        self.assertTrue(body["ok"])
        self.assertEqual(body["count"], len(BASELINE["styles"]))
        self.assertEqual(len(body["styles"]), 324)
        first = body["styles"][0]
        for key in ("id", "name", "prompt", "negative"):
            self.assertIn(key, first)

    def test_style_lookup_and_missing(self) -> None:
        service = VisualService(styles_path=ROOT / "data" / "__missing__.json")
        self.assertEqual(service.style("live_action")["id"], "live_action")
        with self.assertRaises(KeyError):
            service.style("no-such-style")


class RegistryTest(unittest.TestCase):
    def test_default_nodes_are_listed(self) -> None:
        body = VisualService(styles_path=ROOT / "data" / "__missing__.json").nodes()
        names = {item["name"] for item in body["nodes"]}
        self.assertEqual(names, {"normalize", "plan"})

    def test_add_node_without_touching_executor(self) -> None:
        registry = NodeRegistry()
        registry.register(NodeSpec("a", "prepare", lambda ctx: {**ctx, "a": 1}))
        registry.register(NodeSpec("b", "compose", lambda ctx: {**ctx, "b": ctx["a"] + 1},
                                   inputs=("a",)))
        executor = Executor(registry)
        ctx = executor.run(["a", "b"], {})
        self.assertEqual(ctx["b"], 2)
        self.assertEqual([step["name"] for step in executor.summary()], ["a", "b"])

    def test_missing_input_rejected(self) -> None:
        registry = NodeRegistry()
        registry.register(NodeSpec("needs", "prepare", lambda ctx: ctx, inputs=("shots",)))
        with self.assertRaises(NodeError):
            Executor(registry).run(["needs"], {})

    def test_unknown_node_rejected(self) -> None:
        with self.assertRaises(NodeError):
            Executor(default_registry()).run(["nope"], {})

    def test_execute_through_service(self) -> None:
        service = VisualService(styles_path=ROOT / "data" / "__missing__.json")
        result = service.execute(["normalize", "plan"], {"shots": [1, 2, 3]})
        self.assertEqual(result["context"]["planned"], 3)
        self.assertEqual(len(result["trace"]), 2)


class ProjectTest(unittest.TestCase):
    """项目生命周期：创建（幂等）→ 读 → 改设置 → 列表 → 删除；分镜生成如实 501。"""

    def setUp(self) -> None:
        import tempfile
        from domain.visual.store import VisualStore
        from domain.visual.service import VisualError
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.VisualError = VisualError
        self.service = VisualService(styles_path=self.root / "styles.json",
                                     store=VisualStore(self.root / "visual.db"),
                                     workspace=self.root / "visual")

    def tearDown(self) -> None:
        self.service.store.close()
        self._tmp.cleanup()

    def test_create_is_idempotent_by_request_id(self) -> None:
        payload = {"createRequestId": "req-1", "projectName": "第一集",
                   "projectDescription": "测试", "style": "live_action",
                   "settings": {"ratio": "9:16"}}
        first = self.service.create_project(payload)["project"]
        second = self.service.create_project(payload)["project"]
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(first["name"], "第一集")
        self.assertEqual(first["settings"], {"ratio": "9:16"})
        self.assertEqual(len(self.service.projects()["projects"]), 1)

    def test_create_requires_name(self) -> None:
        with self.assertRaises(self.VisualError):
            self.service.create_project({"projectName": "  "})

    def test_get_update_list_delete(self) -> None:
        created = self.service.create_project({"projectName": "A"})["project"]
        pid = created["id"]
        self.assertEqual(self.service.project(pid)["project"]["name"], "A")

        updated = self.service.save_settings({"projectId": pid, "projectName": "B",
                                              "settings": {"ratio": "16:9"}})["project"]
        self.assertEqual(updated["name"], "B")
        self.assertEqual(updated["settings"]["ratio"], "16:9")

        listed = self.service.projects()["projects"]
        self.assertEqual([row["id"] for row in listed], [pid])

        self.assertTrue(self.service.delete_project({"projectId": pid})["ok"])
        with self.assertRaises(self.VisualError):
            self.service.project(pid)

    def test_scenes_reports_missing_model(self) -> None:
        pid = self.service.create_project({"projectName": "C"})["project"]["id"]
        with self.assertRaises(self.VisualError) as ctx:
            self.service.scenes({"projectId": pid, "regenerate": True})
        self.assertEqual(ctx.exception.status, 501)
        self.assertIn("图像模型", ctx.exception.message)


if __name__ == "__main__":
    unittest.main()
