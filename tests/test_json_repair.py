"""模型被截断的 JSON 仍应尽量解析出可用对象。"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from domain.ai.assist import extract_json  # noqa: E402


class JsonRepairTest(unittest.TestCase):
    def test_truncated_string_and_object(self) -> None:
        text = '{"proposals":[{"id":"A","title":"绝密信标","hook":"太空舱氧气耗尽前'
        data = extract_json(text)
        self.assertEqual(len(data["proposals"]), 1)
        self.assertEqual(data["proposals"][0]["id"], "A")
        self.assertTrue(data["proposals"][0]["title"])

    def test_truncated_nested_array(self) -> None:
        text = '{"shots":[{"index":1,"prompt":"镜头一"},{"index":2,"prompt":"镜头二'
        data = extract_json(text)
        self.assertEqual(len(data["shots"]), 2)
        self.assertEqual(data["shots"][1]["index"], 2)

    def test_valid_json_unchanged(self) -> None:
        data = extract_json('{"ok": true, "count": 2}')
        self.assertEqual(data, {"ok": True, "count": 2})


if __name__ == "__main__":
    unittest.main()
