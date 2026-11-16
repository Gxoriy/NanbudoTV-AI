"""P1-02 验收测试：任务落盘、状态机、幂等、中断恢复。

对应验收口径：
  - 杀进程后重启能列出"已中断"并可续跑（NFR-3）
  - 同一 request_id 重试只产生一条任务（NFR-4 的基础）
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from infra.tasks import (  # noqa: E402
    CANCELED, DONE, ERROR, INTERRUPTED, QUEUED, RUNNING, TaskStore,
)


class TaskStoreTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.db = Path(self._tmp.name) / "state.db"
        self.store = TaskStore(self.db)

    def tearDown(self) -> None:
        self.store.close()
        self._tmp.cleanup()

    def test_create_defaults_to_queued_and_persists(self) -> None:
        task = self.store.create("subtitle.remove", "D3", {"episode": 1})
        self.assertEqual(task.state, QUEUED)
        self.assertEqual(task.progress, 0.0)

        reopened = TaskStore(self.db)               # 模拟重启后读同一库
        try:
            again = reopened.get(task.id)
            self.assertIsNotNone(again)
            self.assertEqual(again.payload["episode"], 1)
        finally:
            reopened.close()

    def test_idempotency_key_returns_same_task(self) -> None:
        a = self.store.create("visual.frame", "D2", {"n": 1}, idempotency_key="req-1")
        b = self.store.create("visual.frame", "D2", {"n": 2}, idempotency_key="req-1")
        self.assertEqual(a.id, b.id)
        self.assertEqual(len(self.store.list()), 1)

    def test_happy_path_and_progress_rules(self) -> None:
        t = self.store.create("subtitle.remove", "D3")
        self.store.start(t.id)
        self.store.set_progress(t.id, 0.5, "抽帧")
        self.store.set_progress(t.id, 0.2)          # 回退被忽略
        mid = self.store.get(t.id)
        self.assertEqual(mid.progress, 0.5)
        self.assertEqual(mid.message, "抽帧")

        done = self.store.succeed(t.id, {"outputs": ["a.mp4"]})
        self.assertEqual(done.state, DONE)
        self.assertEqual(done.progress, 1.0)
        self.assertEqual(done.result["outputs"], ["a.mp4"])

    def test_illegal_transition_rejected(self) -> None:
        t = self.store.create("x", "D1")
        self.store.start(t.id)
        self.store.succeed(t.id)
        with self.assertRaises(ValueError):
            self.store.start(t.id)                  # 成功后不能回到运行中

    def test_failure_requires_known_error_code(self) -> None:
        t = self.store.create("x", "D1")
        self.store.start(t.id)
        with self.assertRaises(ValueError):
            self.store.fail(t.id, "随便写的错误")
        failed = self.store.fail(t.id, "gpu_oom", "显存不足")
        self.assertEqual(failed.state, ERROR)
        self.assertTrue(failed.can_retry())         # gpu_oom 属于可重试

    def test_requeue_increments_attempt(self) -> None:
        t = self.store.create("x", "D1")
        self.store.start(t.id)
        self.store.fail(t.id, "network", "超时")
        again = self.store.requeue(t.id)
        self.assertEqual(again.state, QUEUED)
        self.assertEqual(again.attempt, 2)
        self.assertIsNone(again.error_code)

    def test_interrupt_recovery_on_restart(self) -> None:
        t = self.store.create("subtitle.remove", "D3")
        self.store.start(t.id)
        self.store.set_progress(t.id, 0.42)
        self.store.close()                          # 模拟进程被杀（未走 succeed）

        self.store = TaskStore(self.db)
        interrupted = self.store.interrupt_running()
        self.assertEqual(interrupted, [t.id])
        task = self.store.get(t.id)
        self.assertEqual(task.state, INTERRUPTED)
        self.assertAlmostEqual(task.progress, 0.42)

        resumed = self.store.start(t.id)            # 允许续跑
        self.assertEqual(resumed.state, RUNNING)

    def test_cancel_is_terminal(self) -> None:
        t = self.store.create("x", "D5")
        canceled = self.store.cancel(t.id)
        self.assertEqual(canceled.state, CANCELED)
        with self.assertRaises(ValueError):
            self.store.start(t.id)

    def test_public_view_matches_frontend_contract(self) -> None:
        """前端按 state=done|error 判终态、progress 当 0~100 用，这是硬契约。"""
        t = self.store.create("subtitle.remove", "D3", {"apiKey": "secret"})
        self.store.start(t.id)
        self.store.set_progress(t.id, 0.42)
        pub = self.store.get(t.id).public()
        self.assertEqual(pub["state"], "running")
        self.assertEqual(pub["progress"], 42.0)
        self.assertIn("createdAt", pub)
        self.assertNotIn("payload", pub)             # 密钥不得随快照外泄
        self.assertNotIn("secret", str(pub))

        self.store.succeed(t.id)
        self.assertEqual(self.store.get(t.id).public()["state"], "done")

    def test_interrupted_presents_as_stopped_but_resumable(self) -> None:
        t = self.store.create("x", "D3")
        self.store.start(t.id)
        self.store.interrupt_running()
        pub = self.store.get(t.id).public()
        self.assertEqual(pub["state"], "error")      # 前端只认终态词，否则无限轮询
        self.assertEqual(pub["errorCode"], "interrupted")
        self.assertTrue(pub["resumable"])

    def test_snapshot_shape(self) -> None:
        a = self.store.create("x", "D1")
        self.store.start(a.id)
        b = self.store.create("y", "D2")
        self.store.cancel(b.id)
        snap = self.store.snapshot()
        self.assertEqual(snap["counts"][RUNNING], 1)
        self.assertEqual(snap["counts"][CANCELED], 1)
        self.assertEqual(snap["activeCount"], 1)
        self.assertEqual(len(snap["active"]), 1)


if __name__ == "__main__":
    unittest.main()
