"""原包提示词移植：桶内容非空、compose 拼接顺序与截断行为。"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from domain.prompts import bucket_size, compose  # noqa: E402
from domain.prompts_original import PROMPTS, system  # noqa: E402


class PromptsTest(unittest.TestCase):
    def test_all_buckets_have_original_text(self) -> None:
        for bucket in ("storyboard", "normalize", "rewrite", "marketing",
                       "image_prompt", "hooks", "continuity", "video_prompt",
                       "asset_analysis"):
            self.assertGreater(bucket_size(bucket), 0, bucket)
            self.assertTrue(system(bucket), bucket)

    def test_total_is_37_and_unique(self) -> None:
        """P0-3：提示词从 17 条补到 37 条，且不允许跨桶重复。"""
        heads = [item["text"][:40] for items in PROMPTS.values() for item in items]
        self.assertEqual(len(heads), 37)
        self.assertEqual(len(set(heads)), 37)

    def test_compose_accepts_extra_bucket(self) -> None:
        text = compose("storyboard", role="R", task="T", also=("continuity",))
        self.assertIn("【原版规则摘录】", text)
        self.assertIn("【原版规则摘录·continuity】", text)

    def test_every_entry_keeps_source_module(self) -> None:
        for bucket, items in PROMPTS.items():
            for item in items:
                self.assertTrue(item["module"].startswith("core"), bucket)
                self.assertGreater(len(item["text"]), 40, bucket)

    def test_compose_order_and_rule_excerpt(self) -> None:
        text = compose("storyboard", role="角色描述", task="任务描述",
                       output="只输出 JSON")
        self.assertTrue(text.startswith("角色描述"))
        self.assertIn("任务描述", text)
        self.assertIn("【原版规则摘录】", text)
        self.assertTrue(text.rstrip().endswith("只输出 JSON"))
        # 规则在任务之后、输出约束之前
        self.assertLess(text.index("任务描述"), text.index("【原版规则摘录】"))

    def test_compose_clips_long_rule(self) -> None:
        text = compose("storyboard", role="R", task="T", limit=20)
        rule_part = text.split("【原版规则摘录】", 1)[1].strip()
        self.assertLessEqual(len(rule_part), 21)      # 20 + 省略号
        self.assertTrue(rule_part.endswith("…"))

    def test_unknown_bucket_degrades(self) -> None:
        self.assertEqual(system("nope"), "")
        self.assertEqual(bucket_size("nope"), 0)
        self.assertEqual(compose("nope", role="R", task="T"), "R\n\nT")


if __name__ == "__main__":
    unittest.main()
