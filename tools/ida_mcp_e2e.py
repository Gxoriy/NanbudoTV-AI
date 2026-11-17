"""重开 IDA 后能否真的调通：起 IDA → 等插件端口 → MCP 握手 → 真调工具 → 关掉。

只操作我们自己启动的 IDA 实例（按 PID 关闭），不碰用户手动打开的窗口。
"""

from __future__ import annotations

import json
import os
import pathlib
import queue
import socket
import subprocess
import sys
import threading
import time

ROOT = pathlib.Path(r"F:\WorkAPP\NanbudoTV·AI")
IDA = pathlib.Path(r"F:\WorkAPP\IDA Professional 9.5\ida.exe")
TARGET = ROOT / ".local" / "ida-probe" / "target.exe"
PY = r"E:\AdvancedTool\python\python.exe"
SERVER = r"E:\AdvancedTool\python\Lib\site-packages\ida_pro_mcp\server.py"
PORT = 13337


def port_open() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(1.0)
        return sock.connect_ex(("127.0.0.1", PORT)) == 0


class Mcp:
    """最小的 MCP stdio 客户端：只够验证握手与调用。"""

    def __init__(self) -> None:
        env = {key: value for key, value in os.environ.items()
               if key.upper() not in ("PYTHONPATH", "PYTHONHOME", "PYTHONSTARTUP")}
        self.proc = subprocess.Popen([PY, SERVER], stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     text=True, encoding="utf-8", errors="replace",
                                     env=env)
        self.box: queue.Queue[str] = queue.Queue()
        self.err: list[str] = []
        threading.Thread(target=self._read, daemon=True).start()
        threading.Thread(target=self._read_err, daemon=True).start()
        self.next_id = 0

    def _read(self) -> None:
        assert self.proc.stdout is not None
        for line in self.proc.stdout:
            self.box.put(line)

    def _read_err(self) -> None:
        assert self.proc.stderr is not None
        for line in self.proc.stderr:
            self.err.append(line.rstrip())

    def send(self, payload: dict) -> None:
        assert self.proc.stdin is not None
        self.proc.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
        self.proc.stdin.flush()

    def request(self, method: str, params: dict, timeout: float = 60.0) -> dict:
        self.next_id += 1
        rid = self.next_id
        self.send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                line = self.box.get(timeout=1.0)
            except queue.Empty:
                continue
            line = line.strip()
            if not line:
                continue
            try:
                body = json.loads(line)
            except json.JSONDecodeError:
                continue
            if body.get("id") == rid:
                return body
        raise TimeoutError(f"{method} 超时")

    def close(self) -> None:
        self.proc.kill()
        self.proc.wait(timeout=5)


def main() -> int:
    if port_open():
        print("[!] 13337 已被占用（可能你手动开着 IDA），先关掉再跑本脚本。")
        return 1
    print(f"[*] 启动 IDA：{IDA.name} -A {TARGET.name}")
    proc = subprocess.Popen([str(IDA), "-A", str(TARGET)], cwd=str(TARGET.parent),
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    client: Mcp | None = None
    try:
        started = time.perf_counter()
        while time.perf_counter() - started < 180:
            if port_open():
                print(f"[*] 插件端口已开（{time.perf_counter() - started:.0f}s）")
                break
            if proc.poll() is not None:
                print(f"[!] IDA 退出，returncode={proc.returncode}")
                break
            time.sleep(2)
        else:
            print("[!] 180s 内插件端口未开")
            return 2

        if not port_open():
            return 2

        client = Mcp()
        init = client.request("initialize", {
            "protocolVersion": "2024-11-05", "capabilities": {},
            "clientInfo": {"name": "codebuddy-e2e", "version": "0"}})
        info = (init.get("result") or {}).get("serverInfo") or {}
        print(f"[*] MCP initialize ok: {info.get('name')} {info.get('version')}")
        client.send({"jsonrpc": "2.0", "method": "notifications/initialized",
                     "params": {}})

        tools = client.request("tools/list", {})
        names = [tool["name"] for tool in
                 ((tools.get("result") or {}).get("tools") or [])]
        print(f"[*] tools {len(names)} 个：")
        for index in range(0, len(names), 6):
            print("    " + ", ".join(names[index:index + 6]))

        def call(name: str, args: dict) -> dict:
            body = client.request("tools/call", {"name": name, "arguments": args},
                                  timeout=120)
            result = body.get("result") or {}
            content = result.get("content") or []
            text = ""
            for item in content:
                if item.get("type") == "text":
                    text += item.get("text") or ""
            return {"isError": result.get("isError"), "text": text[:400]}

        for name, args in (("server_health", {}), ("list_funcs", {}),
                           ("imports", {}), ("idb_save", {})):
            if name not in names:
                continue
            try:
                out = call(name, args)
                print(f"    {name}: isError={out['isError']} {out['text'][:200]!r}")
            except TimeoutError:
                print(f"    {name}: 超时")
        return 0
    finally:
        if client is not None:
            client.close()
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=10)
            print("[*] 已关闭本次启动的 IDA 实例")
        if client is not None and client.err:
            tail = [line for line in client.err if line.strip()][-4:]
            if tail:
                print("[*] server stderr:", tail)


if __name__ == "__main__":
    sys.exit(main())
