"""云端服务验收：令牌签发/校验、鉴权、去字幕接口、队列与体积限制。

用真实 HTTP + 真实 ffmpeg 跑一遍（无网络依赖）。
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from server.accounts import AccountStore  # noqa: E402
from server.app import Config, build_server  # noqa: E402
from server.tokens import TokenError, issue, verify  # noqa: E402

AREA = {"x": 0, "y": 80, "width": 100, "height": 20}


class ClientConfigTest(unittest.TestCase):
    def test_bom_and_whitespace_are_stripped(self) -> None:
        """手改配置常带 BOM，不清理会在 putheader 抛 latin-1 编码错误（线上踩过）。"""
        from infra.cloud import CloudClient
        client = CloudClient("  https://horiy.fun\ufeff ", "\ufefftoken-abc  ")
        self.assertEqual(client.base_url, "https://horiy.fun")
        self.assertEqual(client.token, "token-abc")
        self.assertTrue(client.enabled)


class TokenTest(unittest.TestCase):
    def test_roundtrip(self) -> None:
        token = issue("secret", "CodeBuddy_Uers", ttl_seconds=60)
        payload = verify("secret", token)
        self.assertEqual(payload["u"], "CodeBuddy_Uers")

    def test_tampered_signature_rejected(self) -> None:
        token = issue("secret", "u", ttl_seconds=60)
        body, _ = token.split(".", 1)
        with self.assertRaises(TokenError):
            verify("secret", f"{body}.AAAA")

    def test_wrong_secret_rejected(self) -> None:
        token = issue("secret-a", "u", ttl_seconds=60)
        with self.assertRaises(TokenError):
            verify("secret-b", token)

    def test_expired_rejected(self) -> None:
        token = issue("s", "u", ttl_seconds=10, now=1000)
        with self.assertRaises(TokenError):
            verify("s", token, now=2000)


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._tmp = tempfile.TemporaryDirectory()
        root = Path(cls._tmp.name)
        cls.accounts_path = root / "accounts.json"
        store = AccountStore(cls.accounts_path)
        store.upsert("CodeBuddy_Uers", "test-password")
        cls.config = Config(secret="unit-secret", accounts_path=cls.accounts_path,
                            data_dir=root / "data", queue_limit=4)
        cls.server = build_server("127.0.0.1", 0, cls.config)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.token = cls._login("CodeBuddy_Uers", "test-password")

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls._tmp.cleanup()

    @classmethod
    def _login(cls, username: str, password: str) -> str:
        status, body = cls.request("POST", "/api/v1/auth/token",
                                   json.dumps({"username": username,
                                               "password": password}).encode(),
                                   {"Content-Type": "application/json"})
        assert status == 200, body
        return body["token"]

    @classmethod
    def request(cls, method: str, path: str, data: bytes = b"",
                headers: dict[str, str] | None = None) -> tuple[int, dict]:
        req = urllib.request.Request(f"http://127.0.0.1:{cls.port}{path}", data=data or None,
                                     method=method, headers=headers or {})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as exc:
            return exc.code, json.loads(exc.read().decode("utf-8") or "{}")

    def test_health_is_open(self) -> None:
        status, body = self.request("GET", "/api/v1/health")
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])

    def test_login_rejects_bad_password(self) -> None:
        status, body = self.request("POST", "/api/v1/auth/token",
                                    json.dumps({"username": "CodeBuddy_Uers",
                                                "password": "nope"}).encode())
        self.assertEqual(status, 401)
        self.assertEqual(body["error"], "auth")

    def test_whoami_requires_token(self) -> None:
        status, _ = self.request("GET", "/api/v1/whoami")
        self.assertEqual(status, 401)
        status, body = self.request("GET", "/api/v1/whoami",
                                    headers={"Authorization": f"Bearer {self.token}"})
        self.assertEqual(status, 200)
        self.assertEqual(body["username"], "CodeBuddy_Uers")

    def test_remove_requires_token(self) -> None:
        status, body = self.request("POST", "/api/v1/subtitle/remove", b"x",
                                    {"X-Region": json.dumps(AREA)})
        self.assertEqual(status, 401)

    def test_remove_rejects_bad_region(self) -> None:
        status, body = self.request(
            "POST", "/api/v1/subtitle/remove", b"x",
            {"Authorization": f"Bearer {self.token}",
             "X-Region": json.dumps({"x": 1.5, "y": 0, "width": 10, "height": 10})})
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "invalid_input")

    def test_remove_processes_video(self) -> None:
        from domain.subtitle.repair import _ensure_ffmpeg_on_path
        _ensure_ffmpeg_on_path()
        if shutil.which("ffmpeg") is None:
            self.skipTest("未安装 ffmpeg")
        with tempfile.TemporaryDirectory() as tmp:
            clip = Path(tmp) / "clip.mp4"
            subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-f", "lavfi",
                 "-i", "testsrc2=s=320x240:r=10:d=1",
                 "-vf", "drawbox=x=20:y=200:w=280:h=30:color=white@1:t=fill",
                 "-pix_fmt", "yuv420p", str(clip)], check=True)
            payload = clip.read_bytes()

        request = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/api/v1/subtitle/remove", data=payload,
            method="POST",
            headers={"Authorization": f"Bearer {self.token}",
                     "X-Region": json.dumps(AREA), "X-Quality": "standard",
                     "Content-Type": "application/octet-stream"})
        started = time.perf_counter()
        with urllib.request.urlopen(request, timeout=120) as resp:
            body = resp.read()
            self.assertEqual(resp.status, 200)
            self.assertEqual(resp.headers.get("Content-Type"), "video/mp4")
        self.assertGreater(len(body), 1000)
        self.assertLess(time.perf_counter() - started, 120)


if __name__ == "__main__":
    unittest.main()
