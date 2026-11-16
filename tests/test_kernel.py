"""P1-01 / P1-04 验收测试：端口动态分配、路由分派、501 未迁移语义。

验收口径：
  - 多实例不抢端口（端口 0 分配，两个 server 端口不同）
  - 未迁移路由返回 501 not_migrated（不是静默 404）
"""

from __future__ import annotations

import json
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import APP_NAME, __version__  # noqa: E402
from app.api import Request, Response, Router, parse_query  # noqa: E402
from app.api import system as system_api  # noqa: E402
from app.main import bind_server  # noqa: E402
from infra.tasks import TaskStore  # noqa: E402


def make_request(method: str, path: str, body: bytes = b"") -> Request:
    from urllib.parse import urlparse
    parsed = urlparse(path)
    return Request(method=method, path=path, query=parse_query(parsed.query),
                   headers={}, body=body)


class RouterTest(unittest.TestCase):
    def setUp(self) -> None:
        self.router = Router()
        self.router.register("D1", "/api/source/analyze", lambda _r: Response.ok(domain="D1"),
                             methods=("POST",))
        self.router.register("D3", "/api/subtitle/", lambda r: Response.ok(path=r.path))

    def test_prefix_dispatch(self) -> None:
        resp = self.router.dispatch(make_request("GET", "/api/subtitle/capabilities"))
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.payload["path"], "/api/subtitle/capabilities")

    def test_method_mismatch_is_not_migrated(self) -> None:
        resp = self.router.dispatch(make_request("GET", "/api/source/analyze"))
        self.assertEqual(resp.status, 501)
        self.assertEqual(resp.payload["error"], "not_migrated")

    def test_unknown_route_returns_501_not_404(self) -> None:
        resp = self.router.dispatch(make_request("GET", "/api/visual/macro/state"))
        self.assertEqual(resp.status, 501)
        self.assertEqual(resp.payload["path"], "/api/visual/macro/state")

    def test_invalid_json_body_maps_to_400(self) -> None:
        handler = lambda r: Response.ok(got=r.json())  # noqa: E731
        self.router.register("D1", "/api/source/echo", handler, methods=("POST",))
        resp = self.router.dispatch(make_request("POST", "/api/source/echo", b"{not json"))
        self.assertEqual(resp.status, 400)

    def test_index_reports_domains(self) -> None:
        idx = self.router.index()
        self.assertEqual(idx["total"], 2)
        self.assertEqual(idx["byDomain"], {"D1": 1, "D3": 1})


class ServerTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.store = TaskStore(Path(self._tmp.name) / "state.db")
        self.servers = []
        self.threads = []

    def tearDown(self) -> None:
        for server in self.servers:
            server.shutdown()
            server.server_close()
        for thread in self.threads:
            thread.join(timeout=5)
        self.store.close()
        self._tmp.cleanup()

    def start_server(self) -> int:
        # 每个实例独立 router + 独立 port_ref，复现"多开互不干扰"
        port_ref = {"port": 0}
        router = Router()
        system_api.build(router, self.store, app_name=APP_NAME,
                         version=__version__, port_ref=port_ref)
        server = bind_server("127.0.0.1", 0, router)
        port_ref["port"] = server.server_address[1]      # 端口回写，与 main 一致
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.servers.append(server)
        self.threads.append(thread)
        return server.server_address[1]

    def get(self, port: int, path: str) -> tuple[int, dict]:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))

    def test_two_instances_do_not_conflict(self) -> None:
        port_a = self.start_server()
        port_b = self.start_server()
        self.assertNotEqual(port_a, port_b)

        status_a, body_a = self.get(port_a, "/api/health")
        status_b, body_b = self.get(port_b, "/api/health")
        self.assertEqual((status_a, status_b), (200, 200))
        self.assertEqual(body_a["kernel"], "rebuild")
        self.assertEqual(body_a["port"], port_a)
        self.assertEqual(body_b["port"], port_b)

    def test_tasks_snapshot_endpoint(self) -> None:
        port = self.start_server()
        task = self.store.create("subtitle.remove", "D3", {"secret": "should-not-leak"})
        self.store.start(task.id)
        status, body = self.get(port, "/api/tasks")
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.assertEqual(body["activeCount"], 1)
        self.assertNotIn("should-not-leak", json.dumps(body, ensure_ascii=False))

    def test_unmigrated_route_over_http(self) -> None:
        port = self.start_server()
        try:
            self.get(port, "/api/visual/macro/state")
        except urllib.error.HTTPError as exc:      # 501 会抛 HTTPError
            self.assertEqual(exc.code, 501)
            payload = json.loads(exc.read().decode("utf-8"))
            self.assertEqual(payload["error"], "not_migrated")
        else:
            self.fail("未迁移路由应返回 501")


if __name__ == "__main__":
    unittest.main()
