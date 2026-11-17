# IDA Pro 9.5 × MCP 接入记录（2026-11-17）

## 1. 装了什么

| 项 | 值 |
|---|---|
| 项目 | [mrexodia/ida-pro-mcp](https://github.com/mrexodia/ida-pro-mcp) v2.0.0（MIT） |
| 源码 | `F:\WorkAPP\ida-pro-mcp`（git clone，便于随时 `git pull`） |
| 安装目标 Python | `E:\AdvancedTool\python\python.exe`（3.14.6）——**这就是 IDA 9.5 实际使用的解释器**（`HKCU\Software\Hex-Rays\IDA\Python3TargetDLL` 指向 `python314.dll`） |
| 依赖 | `idapro 0.0.12`、`tomli-w 1.2.0` |
| IDA 插件 | `C:\Users\Administrator\AppData\Roaming\Hex-Rays\IDA Pro\plugins\ida_mcp.py`（11.5 KB 加载器）+ `plugins\ida_mcp\`（24 个 py 文件） |
| 服务端入口 | `E:\AdvancedTool\python\Lib\site-packages\ida_pro_mcp\server.py`（stdio，自带 zeromcp） |
| 通信 | 插件在 IDA 内起 HTTP 服务 `http://127.0.0.1:13337/mcp`；stdio 服务端再把它暴露给 MCP 客户端 |

> 关键判断：**IDA 9.5 不再自带 `python311\python.exe`**，它通过 `idapyswitch` 绑定系统 Python。
> 所以插件必须装进 `E:\AdvancedTool\python`，装进项目 venv 是无效的。

## 2. 当前状态

```
plugin.loaderExists = true   (11466 字节)
plugin.packageFiles = 24
idaProcesses        = [ida.exe pid 20396]
port 13337          = false      ← 插件尚未加载
```

**只差一步**：插件是 IDA 运行时装的，必须在**完全退出 IDA 后重开**（不是关窗口最小化，
要退出进程），插件才会随之启动。装完不要动其它配置。

## 3. CodeBuddy 侧配置

工作区已有 `.codebuddy/mcp.json`：

```json
{
  "mcpServers": {
    "ida-pro-mcp": {
      "type": "stdio",
      "command": "E:\\AdvancedTool\\python\\python.exe",
      "args": ["E:\\AdvancedTool\\python\\Lib\\site-packages\\ida_pro_mcp\\server.py"],
      "env": { "PYTHONIOENCODING": "utf-8" }
    }
  }
}
```

如果 IDE 没自动读取，用 **CodeBuddy Settings → MCP → Add MCP** 把上面 `ida-pro-mcp`
那段贴进去即可（字段格式即 `mcpServers` + `type/command/args/env`）。

⚠️ **不要**照抄 `ida-pro-mcp --config` 自动生成的配置：它会把当前 shell 的
`PYTHONPATH`（CodeBuddy 的 sitecustomize shim 目录）一起写进去，实测会污染子进程。
上面的配置里只保留 `PYTHONIOENCODING`。

## 4. 自检

```powershell
cd F:\WorkAPP\NanbudoTV·AI
.\.venv\Scripts\python.exe tools\ida_mcp_status.py
```

输出四项：插件文件、IDA 进程、13337 端口、真发一次 `initialize` 的响应。
全绿（`[OK] MCP 就绪`）才说明 CodeBuddy 能调到。

## 5. 重开 IDA 后的验收

1. 打开 IDA Pro 9.5，加载任意二进制
2. 输出窗口应出现 `[MCP] Registered instance: xxx (pid=…, port=13337)`
3. 再跑一次 `tools/ida_mcp_status.py`，`mcpInitialize.ok` 应为 true
4. 在 CodeBuddy 对话里说：「用 ida-pro-mcp 看看当前 IDB 的 main 函数反编译结果」

## 6. 同类开源项目（按需替换）

| 项目 | 适用 | 说明 |
|---|---|---|
| [HexRaysSA/ida-mcp](https://github.com/HexRaysSA/ida-mcp) | IDA | **官方维护**，ida-pro-mcp 的 README 现在也推荐它；与本文这套二选一（都起 13337 会抢端口） |
| [mrexodia/ida-pro-mcp](https://github.com/mrexodia/ida-pro-mcp) | IDA | 本次安装的版本，工具面广、社区大 |
| [LaurieWired/GhidraMCP](https://github.com/LaurieWired/GhidraMCP) | Ghidra | 免费方案；Ghidra 反编译 + MCP |
| [radareorg/radare2-mcp](https://github.com/radareorg/radare2-mcp) | radare2 | 轻量、纯命令行 |
| [fosdickio/binary_ninja_mcp](https://github.com/fosdickio/binary_ninja_mcp) | Binary Ninja | 商业工具，但 MCP 桥开源 |
| [morluto/rea](https://github.com/morluto/rea) | 多引擎 | 聚合 Hopper/Ghidra/IDA，带证据链 |
| [1llu50ry/mcp-reverse](https://github.com/1llu50ry/mcp-reverse) | 多引擎 | 180+ 工具，聚合 56 个后端（体积大） |

## 7. 对我们这个项目的实际价值（说实话）

原包是 **PyInstaller + CPython 3.12**，业务逻辑在 PYZ 里，`marshal` 直接可读——
`tools/pyz_core_dump.py` 已经拿到 220 个 `core.*` 模块、45 段 SQL、107 条提示词。
IDA 对这类目标是**看不出东西的**。

这套 MCP 真正的用武之地是另一个方向：**如果将来要处理原包里的原生依赖**
（ffmpeg 定制版、加壳 DLL、自研 loader），或者要分析别的闭源客户端。
用于本项目时，建议只把它当"备选工具"，不要指望它推进复刻。

## 8. 安全提醒

- 插件在 13337 上监听的是 **本机回环**，不要改成 `0.0.0.0`——那等于把反编译能力开放给局域网。
- MCP 客户端能**修改 IDB**（重命名、改类型、加注释）。让 Agent 跑之前先备份 `.i64`。
- 别用破解版 IDA：这类插件需要稳定的 `idaapi`/`ida_hexrays`，破解版插件加载失败会浪费更多时间。
