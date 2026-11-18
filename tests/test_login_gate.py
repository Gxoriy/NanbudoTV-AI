"""启动门控：未激活访问入口页必须 302 到登录页，深链与登录页本身不能拦。

用真 HTTP 服务器（随机端口 + 后台线程）验证，因为门控在 Handler 层，
纯函数测试覆盖不到 302 与 Location 头。
"""

from __future__ import annotations

import http.client
import sys
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.api.router import Router  # noqa: E402
from app.main import bind_server  # noqa: E402


class LoginGateTest(unittest.TestCase):
    def _serve(self, gate):
        server = bind_server("127.0.0.1", 0, Router(),
                             static_dir=ROOT / "static", license_gate=gate)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return server.server_address[1]

    def _get(self, port: int, path: str):
        conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
        conn.request("GET", path, headers={"User-Agent": "gate-test"})
        resp = conn.getresponse()
        body = resp.read()
        headers = dict(resp.getheaders())
        conn.close()
        return resp.status, headers, body

    def test_unlicensed_redirects_entry_page(self) -> None:
        port = self._serve(lambda headers: False)
        for path in ("/", "/index.html"):
            status, headers, _ = self._get(port, path)
            self.assertEqual(status, 302, path)
            self.assertEqual(headers.get("Location"), "/login.html", path)

    def test_unlicensed_keeps_deep_links_and_login(self) -> None:
        port = self._serve(lambda headers: False)
        status, _, body = self._get(port, "/login.html")
        self.assertEqual(status, 200)
        self.assertIn(b"cardKey", body)          # 登录页真的返回了表单
        status, _, _ = self._get(port, "/visual.html")
        self.assertEqual(status, 200)            # 深链不拦，自动化审计才能跑

    def test_licensed_serves_homepage(self) -> None:
        port = self._serve(lambda headers: True)
        status, _, body = self._get(port, "/")
        self.assertEqual(status, 200)
        self.assertIn(b"NanbudoTV", body)

    def test_gate_receives_headers(self) -> None:
        seen: list[dict[str, str]] = []

        def gate(headers):
            seen.append(headers)
            return True

        port = self._serve(gate)
        self._get(port, "/")
        self.assertTrue(seen)
        self.assertEqual(seen[0].get("user-agent"), "gate-test")

    def test_no_gate_means_no_redirect(self) -> None:
        port = self._serve(None)
        status, _, _ = self._get(port, "/")
        self.assertEqual(status, 200)


if __name__ == "__main__":
    unittest.main()
