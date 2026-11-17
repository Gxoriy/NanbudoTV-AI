"""检查 IDA Pro MCP 是否装好、是否连得上（CodeBuddy 调用前先跑这个）。

它回答四个问题：
  1. 插件文件在不在（%APPDATA%\\Hex-Rays\\IDA Pro\\plugins）
  2. IDA 是否在运行
  3. 插件 HTTP 端点是否在监听（默认 13337）
  4. 真发一次 initialize，看服务端是否按 MCP 协议应答
"""

from __future__ import annotations

import json
import os
import pathlib
import socket
import subprocess
import sys
import urllib.error
import urllib.request

PLUGIN_DIR = pathlib.Path(os.environ.get("APPDATA", "")) / "Hex-Rays" / "IDA Pro" / "plugins"
PY = pathlib.Path(r"E:\AdvancedTool\python\python.exe")
SERVER = pathlib.Path(r"E:\AdvancedTool\python\Lib\site-packages\ida_pro_mcp\server.py")
HOST, PORT = "127.0.0.1", 13337


def check_plugin() -> dict:
    loader = PLUGIN_DIR / "ida_mcp.py"
    package = PLUGIN_DIR / "ida_mcp"
    return {
        "loader": str(loader),
        "loaderExists": loader.is_file(),
        "loaderBytes": loader.stat().st_size if loader.is_file() else 0,
        "packageExists": package.is_dir(),
        "packageFiles": len(list(package.glob("*.py"))) if package.is_dir() else 0,
    }


def check_ida_process() -> list[dict]:
    try:
        out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq ida.exe", "/FO", "CSV"],
                             capture_output=True, text=True, timeout=15,
                             encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        return []
    rows = []
    for line in (out.stdout or "").splitlines()[1:]:
        parts = [part.strip('"') for part in line.split('","')]
        if parts and parts[0].lower().startswith("ida"):
            rows.append({"name": parts[0], "pid": parts[1] if len(parts) > 1 else ""})
    return rows


def check_port() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(1.5)
        return sock.connect_ex((HOST, PORT)) == 0


def check_mcp_http() -> dict:
    payload = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                   "clientInfo": {"name": "status-probe", "version": "0"}},
    }).encode("utf-8")
    request = urllib.request.Request(
        f"http://{HOST}:{PORT}/mcp", data=payload, method="POST",
        headers={"Content-Type": "application/json",
                 "Accept": "application/json, text/event-stream"})
    try:
        with urllib.request.urlopen(request, timeout=8) as resp:
            body = resp.read().decode("utf-8", "replace")
        return {"ok": True, "status": resp.status, "body": body[:200]}
    except urllib.error.HTTPError as exc:
        return {"ok": False, "status": exc.code, "body": exc.read()[:160].decode("utf-8", "replace")}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": repr(exc)[:120]}


def main() -> int:
    plugin = check_plugin()
    processes = check_ida_process()
    port_open = check_port()
    http = check_mcp_http() if port_open else {"ok": False, "error": "端口未监听"}

    print(json.dumps({
        "python": {"path": str(PY), "exists": PY.is_file()},
        "serverSmall": {"path": str(SERVER), "exists": SERVER.is_file()},
        "plugin": plugin,
        "idaProcesses": processes,
        "port": {"host": HOST, "port": PORT, "open": port_open},
        "mcpInitialize": http,
    }, ensure_ascii=False, indent=1))

    ready = plugin["loaderExists"] and plugin["packageExists"] and http.get("ok")
    if ready:
        print("\n[OK] MCP 就绪：CodeBuddy 里可以直接让 Agent 调 IDA 工具。")
        return 0
    missing = []
    if not plugin["loaderExists"] or not plugin["packageExists"]:
        missing.append("插件未装：运行 ida-pro-mcp --install")
    if not processes:
        missing.append("IDA 未运行：先打开 IDA Pro 9.5（插件会随 IDB 自动启动）")
    if processes and not port_open:
        missing.append("插件未加载：装完插件后需完全退出并重开 IDA")
    print("\n[!] 尚未就绪：\n  - " + "\n  - ".join(missing or ["未知原因，查看上面的 mcpInitialize"]))
    return 1


if __name__ == "__main__":
    sys.exit(main())
