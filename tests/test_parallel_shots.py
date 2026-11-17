"""P0-1 并行分镜：保序、限流、失败降级（对应原版 core.parallel_shots209）。"""

from __future__ import annotations

import sys
import threading
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from domain.visual.assist import VisualAssist  # noqa: E402


class _FakeAssist(VisualAssist):
    """不碰网络：用 _json_call 模拟每次短请求的耗时与失败。"""

    def __init__(self) -> None:
        super().__init__(profiles_path=ROOT / "data" / "__missing__.json")
        self.calls: list[int] = []
        self.lock = threading.Lock()
        self.active = 0
        self.peak = 0
        self.fail_indices: set[int] = set()
        self.delay = 0.12

    def _json_call(self, spec: str, user: str, system=None) -> dict:  # noqa: ANN001, ARG002
        index = int(user.rsplit("第 ", 1)[-1].split(" 个")[0])
        with self.lock:
            self.calls.append(index)
            self.active += 1
            self.peak = max(self.peak, self.active)
        try:
            time.sleep(self.delay)
            if index in self.fail_indices:
                raise RuntimeError(f"镜头 {index} 撞限速")
            return {"seconds": 4, "shot": f"镜头{index}", "prompt": f"提示{index}"}
        finally:
            with self.lock:
                self.active -= 1


class ParallelShotsTest(unittest.TestCase):
    def test_order_preserved_and_faster_than_serial(self) -> None:
        assist = _FakeAssist()
        started = time.perf_counter()
        body = assist.plan("雨夜送餐", shots=4, concurrency=3)
        elapsed = time.perf_counter() - started

        self.assertEqual(body["count"], 4)
        self.assertEqual([item["index"] for item in body["shots"]], [1, 2, 3, 4])
        self.assertEqual([item["shot"] for item in body["shots"]],
                         ["镜头1", "镜头2", "镜头3", "镜头4"])
        self.assertEqual(body["concurrency"], 3)
        # 串行需要 4×0.12=0.48s；并发 3 路应明显更快
        self.assertLess(elapsed, 0.45)
        self.assertGreaterEqual(assist.peak, 2)

    def test_concurrency_is_clamped(self) -> None:
        assist = _FakeAssist()
        body = assist.plan("需求", shots=3, concurrency=99)
        self.assertEqual(body["concurrency"], 4)      # 上限 4，防撞限速
        self.assertLessEqual(assist.peak, 4)

    def test_failed_shot_is_retried_once_serially(self) -> None:
        assist = _FakeAssist()
        attempts: dict[int, int] = {}
        guard = threading.Lock()

        def flaky(spec, user, system=None):  # noqa: ANN001, ARG001
            index = int(user.rsplit("第 ", 1)[-1].split(" 个")[0])
            with guard:
                attempts[index] = attempts.get(index, 0) + 1
                first = attempts[index] == 1
            time.sleep(0.05)
            if index == 2 and first:
                raise RuntimeError("镜头 2 撞限速")
            return {"seconds": 3, "shot": f"镜头{index}", "prompt": "p"}

        assist._json_call = flaky  # type: ignore[method-assign]
        body = assist.plan("需求", shots=3, concurrency=2)
        self.assertEqual(body["count"], 3)
        self.assertEqual(body["retried"], [2])
        self.assertEqual(attempts[2], 2)             # 只在失败后重试一次

    def test_single_shot_uses_serial_path(self) -> None:
        assist = _FakeAssist()
        body = assist.plan("需求", shots=1, concurrency=3)
        self.assertEqual(body["concurrency"], 1)
        self.assertEqual(body["count"], 1)

    def test_empty_requirement_rejected(self) -> None:
        with self.assertRaises(Exception):  # noqa: B017
            _FakeAssist().plan("   ", shots=2)


class JsonRetryTest(unittest.TestCase):
    """P0-5：模型答成散文时要重问，而不是直接 502（对应原版 core.validator）。"""

    class _Assist(VisualAssist):
        def __init__(self, replies: list[str]) -> None:
            super().__init__(profiles_path=ROOT / "data" / "__missing__.json")
            self.replies = list(replies)
            self.calls = 0

        def complete(self, system: str, user: str) -> str:  # noqa: ARG002
            self.calls += 1
            return self.replies.pop(0) if self.replies else "还是不是 JSON"

    def test_retry_after_prose(self) -> None:
        assist = self._Assist(["好的，我来分析一下：画面很有张力。",
                               '{"shot":"雨夜街道","seconds":4}'])
        body = assist._json_call("spec", "user")
        self.assertEqual(body["shot"], "雨夜街道")
        self.assertEqual(assist.calls, 2)

    def test_code_fence_is_tolerated(self) -> None:
        assist = self._Assist(['```json\n{"shot":"x"}\n```'])
        self.assertEqual(assist._json_call("spec", "user")["shot"], "x")
        self.assertEqual(assist.calls, 1)

    def test_gives_up_after_attempts(self) -> None:
        assist = self._Assist(["散文一", "散文二", "散文三"])
        with self.assertRaises(Exception) as ctx:  # noqa: B017
            assist._json_call("spec", "user", attempts=3)
        self.assertIn("连续 3 次", str(ctx.exception))
        self.assertEqual(assist.calls, 3)


if __name__ == "__main__":
    unittest.main()
