"""用 IDA(MCP) 分析原版 exe，产出对复刻有用的线索。

关注点：
  1. 它加载了哪些 DLL（判断是不是 onedir + 依赖哪个 Python）
  2. 有没有反调试/壳的痕迹（原版能直接跑，说明无壳）
  3. 字符串里有没有 ffmpeg / webview / _internal 之类的线索
"""

from __future__ import annotations

import json
import os
import pathlib
import queue
import shutil
import socket
import subprocess
import sys
import threading
import time

ROOT = pathlib.Path(r"F:\WorkAPP\NanbudoTV·AI")
IDA = pathlib.Path(r"F:\WorkAPP\IDA Professional 9.5\ida.exe")
SOURCE = pathlib.Path(sys.argv[1] if len(sys.argv) > 1
                      else r"F:\WorkAPP\短剧改写工作台\NanbudoTV·AI.exe")
WORK = ROOT / ".local" / "ida-probe"
TARGET = WORK / "original.exe"
PY = r"E:\AdvancedTool\python\python.exe"
SERVER = r"E:\AdvancedTool\python\Lib\site-packages\ida_pro_mcp\server.py"
PORT = 13337


class Mcp:
    def __init__(self) -> None:
        env = {key: value for key, value in os.environ.items()
               if key.upper() not in ("PYTHONPATH", "PYTHONHOME", "PYTHONSTARTUP")}
        self.proc = subprocess.Popen([PY, SERVER], stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     text=True, encoding="utf-8", errors="replace",
                                     env=env)
        self.box: queue.Queue[str] = queue.Queue()
        self.err: list[str] = []
        threading.Thread(target=self._pump, args=(self.proc.stdout, self.box), daemon=True).start()
        threading.Thread(target=self._pump_err, daemon=True).start()
        self.next_id = 0

    def _pump(self, stream, box) -> None:  # noqa: ANN001
        for line in stream:
            box.put(line)

    def _pump_err(self) -> None:
        assert self.proc.stderr is not None
        for line in self.proc.stderr:
            self.err.append(line.rstrip())

    def send(self, payload: dict) -> None:
        assert self.proc.stdin is not None
        self.proc.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
        self.proc.stdin.flush()

    def request(self, method: str, params: dict, timeout: float = 300.0) -> dict:
        self.next_id += 1
        rid = self.next_id
        self.send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                line = self.box.get(timeout=1.0)
            except queue.Empty:
                continue
            try:
                body = json.loads(line.strip() or "{}")
            except json.JSONDecodeError:
                continue
            if body.get("id") == rid:
                return body
        raise TimeoutError(method)

    def call(self, name: str, args: dict, timeout: float = 300.0) -> dict:
        body = self.request("tools/call", {"name": name, "arguments": args}, timeout)
        result = body.get("result") or {}
        text = "".join(item.get("text") or "" for item in (result.get("content") or [])
                       if item.get("type") == "text")
        return {"isError": result.get("isError"), "text": text}

    def close(self) -> None:
        self.proc.kill()
        self.proc.wait(timeout=5)


def port_open() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(1.0)
        return sock.connect_ex(("127.0.0.1", PORT)) == 0


def main() -> int:
    if not SOURCE.is_file():
        print("[!] 找不到原版 exe:", SOURCE)
        return 1
    WORK.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SOURCE, TARGET)
    print(f"[*] 样本 {SOURCE.name} {SOURCE.stat().st_size / 1024 / 1024:.1f} MB → {TARGET}")

    proc = subprocess.Popen([str(IDA), "-A", str(TARGET)], cwd=str(WORK),
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    client: Mcp | None = None
    try:
        started = time.perf_counter()
        while time.perf_counter() - started < 300:
            if port_open():
                print(f"[*] 插件端口已开（{time.perf_counter() - started:.0f}s）")
                break
            time.sleep(3)
        else:
            print("[!] 端口未开")
            return 2

        client = Mcp()
        client.request("initialize", {"protocolVersion": "2024-11-05", "capabilities": {},
                                      "clientInfo": {"name": "insight", "version": "0"}})
        client.send({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})

        print("[*] server_health:", client.call("server_health", {})["text"][:200])
        survey = client.call("survey_binary", {})
        print("[*] survey_binary:", survey["text"][:600])

        imports = client.call("imports", {"offset": 0, "count": 300})
        text = imports["text"]
        print("[*] imports:", ("isError=" + str(imports["isError"])), text[:300])
        names = [part for part in text.replace('"', " ").split() if ".dll" in part.lower()]
        uniq = sorted({name.strip(",[]") for name in names})
        print(f"    DLL {len(uniq)} 个: {uniq[:24]}")

        for pattern in ("python3", "_internal", "ffmpeg", "WebView2", "pyi-"):
            found = client.call("find_regex", {"regex": pattern, "limit": 5})
            if found["isError"]:
                found = client.call("find_regex", {"pattern": pattern, "limit": 5})
            head = found["text"][:180].replace("\n", " ")
            print(f"    regex {pattern!r}: err={found['isError']} {head}")
        return 0
    finally:
        if client is not None:
            client.close()
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=10)
        print("[*] 已关闭本次 IDA 实例")


if __name__ == "__main__":
    sys.exit(main())
