# IDA Pro 9.5 × MCP：验证结果 + 对复刻的实际价值（2026-11-17）

## 1. 「重开 IDA 后能否真的调通」——能，已端到端验证

脚本：`tools/ida_mcp_e2e.py`（起一个**自己启动**的 IDA 实例，验证完按 PID 关掉，不碰你手动的窗口）

```
[*] 启动 IDA：ida.exe -A target.exe
[*] 插件端口已开（3s）                      ← 重开后插件自动加载，无需手动开面板
[*] MCP initialize ok: ida-pro-mcp 1.0.0
[*] tools 66 个
    server_health, lookup_funcs, int_convert, list_funcs, func_query, list_globals
    decompile, disasm, xrefs_to, callees, find_bytes, patch, rename, py_eval …
[*] server_health: {"status":"ok","idb_path":"…\\target.exe.i64","module":"target.exe"}
[*] idb_save: {"ok":true,"path":"…\\target.exe.i64"}   ← 真写了 IDB
[*] server stderr: [MCP] Auto-connected to: target.exe at 127.0.0.1:13337
```

结论：**装完插件后重开 IDA 即生效**，66 个工具可用，读写 IDB 正常。
`CodeBuddy` 侧用 `.codebuddy/mcp.json` 里的 stdio 配置即可接到同一实例。

## 2. 用 IDA 看原版 exe：它自己什么业务都没有

`tools/ida_insight.py`（样本：`F:\WorkAPP\短剧改写工作台\NanbudoTV·AI.exe`，12.5 MB）

| 指标 | 结果 |
|---|---|
| 架构 / 基址 | x64 / `0x140000000` |
| 映像大小 | `0x65000`（约 400 KB 代码） |
| 函数 | 876（命名 27，库函数 13） |
| 字符串 | 1255 |
| 区段 | 6（`.text` `rx`） |
| MD5 | `401342b6ab89a4dfe6caefa664a0bd30` |

关键字符串/导入：

```
[PYI-%d:%s] / [PYI-%d:ERROR]       ← PyInstaller bootloader 日志
USER32: CreateWindowExW, MsgWaitForMultipleObjects, ShutdownBlockReasonCreate
regex 'python3'  → 0 命中
regex 'ffmpeg'   → 0 命中
regex 'WebView2' → 0 命中
```

**结论**：这个 exe 是纯 PyInstaller GUI 引导器——窗口创建 + 解包 + 起 Python 解释器，
业务逻辑一行都不在里面。这正好从反面证明了我们走 `marshal` 读 PYZ 是对的：
在 IDA 里翻这个 exe，最多看到 bootloader 的 400 KB 代码，拿不到任何业务线索。

## 3. 真正有价值的发现：原版依赖清单

IDA 只告诉我们"别看这里"，于是顺着它指的方向看 `_internal/`（117 个顶层条目，onedir 打包）：

| 组件 | 原版 | 我们 | 差异含义 |
|---|---|---|---|
| Python | `python312.dll` 6.7 MB | 3.12.14 | 一致（也印证 PYZ 魔数 `0x0DCB`） |
| 桌面壳 | `pywebview 6.2.1` | 6.2.1 | **完全一致** |
| 语音识别 | `faster-whisper 1.2.1` | 1.2.1 | 一致（含权重下载逻辑） |
| 视频解码 | `av 18.1.0`（avcodec-62/avformat-62/avfilter-11 dll） | `av 19.0.2` | 我们更新，**原版没带 ffmpeg.exe** |
| 图像 | `opencv-python-headless 4.14.0.94` | `opencv-python-headless 4.14` | 一致 |
| .NET | `pythonnet` | `pythonnet 3.2.1` | 原版用 .NET 互操作（SAPI/WinRT 走 CLR） |
| 深度学习 | **无 torch** | 无 | 印证"动效走远端"的判断是对的 |

### 三条可执行的改进线索

1. **原版不用 `ffmpeg.exe`，用 PyAV。**
   我们现在抽音轨/去字幕轨是 `subprocess` 调外部 ffmpeg（依赖 `E:\PublicWork\ffmpeg`），
   原版把 libav 打进 `_internal`，用户机器上不需要装 ffmpeg。
   → 若要贴近原版的分发形态，可把 `infra/subtitle/repair.py` 与 `infra/asr` 的 ffmpeg 调用换成 `av`。
   代价：PyAV 的 API 比命令行难写，且我们已在 faster-whisper 上踩过 `av` 版本兼容问题。

2. **`av` 版本建议对齐 18.1.0。**
   我们装的是 19.0.2，之前 faster-whisper 走 PyAV 解码时报
   `metadata_errors` 参数不存在——正是 18→19 的 API 变动。当前我们已改成"ffmpeg 转 wav + wave 读"绕开，
   但若将来把解码交回 PyAV，钉到 18.1.0 最稳。

3. **`pythonnet` 是原版做 SAPI/COM 的方式。**
   我们用 `comtypes`/ctypes 调 SAPI；原版用 CLR。两者都能出声，
   但 pythonnet 对 `System.Speech` 的调用更短。属于"可选优化"，不改也不影响功能。

## 4. 边界与安全

- **IDA 对本次复刻的作用是"反向确认"，不是"提供新逻辑"**：业务在 Python 层，我们已经拿全了。
- MCP 能改 IDB（`rename`/`patch`/`set_comments`/`py_eval`）。分析原版前先备份 `.i64`；
  本次两个脚本都在 `.local/ida-probe/` 里操作副本，不碰原始安装目录。
- 13337 只监听回环，不要改成 `0.0.0.0`。

## 5. 复跑方式

```powershell
# 1) 状态（插件/进程/端口/initialize 四项）
.\.venv\Scripts\python.exe tools\ida_mcp_status.py

# 2) 端到端调通验证（自己起 IDA、跑完关掉）
.\.venv\Scripts\python.exe tools\ida_mcp_e2e.py

# 3) 分析任意样本的导入与关键字符串
.\.venv\Scripts\python.exe tools\ida_insight.py "F:\WorkAPP\短剧改写工作台\NanbudoTV·AI.exe"
```
