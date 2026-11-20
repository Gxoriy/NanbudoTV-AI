"""运行代码指纹：源码变更必须能改变 codeHash。"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import build_info  # noqa: E402


class BuildInfoTest(unittest.TestCase):
    def test_hash_is_stable_and_short(self) -> None:
        first = build_info.code_hash()
        self.assertEqual(first, build_info.code_hash())
        self.assertEqual(len(first), 16)

    def test_hash_changes_with_source(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "static").mkdir()
            (root / "app").mkdir()
            (root / "static" / "a.js").write_text("a", encoding="utf-8")
            original = build_info.ROOT
            try:
                build_info.ROOT = root
                before = build_info.code_hash()
                (root / "static" / "a.js").write_text("b", encoding="utf-8")
                after = build_info.code_hash()
            finally:
                build_info.ROOT = original
        self.assertNotEqual(before, after)


if __name__ == "__main__":
    unittest.main()
