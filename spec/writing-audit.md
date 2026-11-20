# D1 三条写作链实盘审计（剧本改写 / 一键创作 / 小说转剧本）

用户反馈：截图里「正在设计差异化方案…」停在 0%，点「需要，立即生成」弹 `invalid_input`，
差异提案等均未实装。本轮按**前端真实调用契约**审计并修复，全部跑通。

## 0. 取证顺序（IDA / PYZ / 前端）

- **IDA + MCP**（`tools/ida_mcp_e2e.py`、`tools/ida_insight.py`）：已验证可调通 66 个工具；
  原版 exe 只有约 400 KB 的 PyInstaller bootloader（876 函数 / 1255 字符串），
  零业务代码。结论：这三条链的实现细节不在原生层。
- **PYZ**（`tools/pyz_core_dump.py`）：220 个 `core.*` 模块，提示词在 `core.prompt_builder`
  等模块里（已导出 37 条到 `domain/prompts_original.py`）。
- **前端**（本次决定性证据）：`static/app.js` 的 `submitWritingAux220` / `pollWritingAux220`
  与 `static/novel_legacy249.js` 给出了**真实 payload 与任务轮询契约**。
  接口"注册了"不等于"能用"——字段名和返回形状不对就是 100% 失败。

## 1. 审计发现的总根因（同一类错误，三处都中）

前端写作辅助统一走：

```js
const data = await submitWritingAux220(url, payload);   // payload: {sourceText, settings, modelConfig}
await pollWritingAux220(data, result => {...});         // 用 data.taskId 轮询 /api/tasks/<id>
task = await response.json();
if (!["queued","running","done","error"].includes(task.state)) throw "任务状态无效"
```

我们的实现却是**同步返回**，且字段名不符：

| 链 | 前端发的字段 | 我们原先要的字段 | 结果 |
|---|---|---|---|
| 差异化提案 | `sourceText` | `text` | `400 invalid_input` |
| 单套提案优化 | `instruction` | `feedback` | 字段丢失，且同步返回 `proposal` |
| 原创设定推荐 | `action` + `settings` | `topic` | `400 invalid_input` |
| 单项字段优化 | `field` + `settings` | `text` | `400 invalid_input` |
| 小说转剧本 | `sourceText` + `requirements` | `text` | `400 invalid_input` |

另外 `/api/tasks/<id>` 曾把 `state` 只放在 `task` 内，导致前端报「任务状态无效」
（该问题在对白识别审计时已修，本次再次受益）。

## 2. 修复内容

| 接口 | 现在 |
|---|---|
| `/api/source/proposals` | 收 `sourceText` → 异步任务 → `proposals[{id,title,hook,summary,score}]`（3 套） |
| `/api/source/proposal-refine` | 收 `instruction` → 异步任务 → `proposals:[refined]`（前端就是整体替换提案列表） |
| `/api/original/recommend` | 收 `action`/`settings` → 异步任务 → `recommendation{…}`；`hot_types` 走 suggestions |
| `/api/original/field-optimize` | 收 `field`/`settings` → 异步任务 → `{field,text}` |
| `/api/novel-screenplay/start` | 收 `sourceText/requirements/style/…` → 回显 `auxReceiptId` → 任务结果带 **`screenplay`** 与 `continuity` |
| `rewrite.py` | 727 行（R1 门禁 800）；aux 接口拆到 `rewrite_extra.py`（298 行） |
| `TaskStore` | 新增 `closed` 标志，后台线程在库关闭后不再写 DB（消除测试临时目录占用） |

所有 LLM 调用沿用既有重试（`TextAssist.json_call`，最多 3 次）+ 示例价格表（前端按钮可点）。

## 3. 实盘验收

接口层 `tools/audit_writing.py`（真 LLM，逐条轮询任务）：

```
=== D1-1 剧本改写 ===
[OK] 差异化提案（3 套）   state=done  keys=['count','ok','proposals','recommendation']
[OK] 单套提案优化        state=done  keys=['count','ok','proposal','proposals']
=== D1-2 一键创作 ===
[OK] 原创设定推荐        state=done  keys=['ok','recommendation','suggestions']
[OK] 单项字段优化        state=done  keys=['field','ok','text']
=== D1-3 小说转剧本 ===
[OK] 小说转剧本          state=done  keys=['continuity','projectId','scenes','screenplay']
合计 5 步，失败 0
```

浏览器层 `tools/ui_proposals.js`（对应截图的按钮流程）：

```
[OK] 登录
[OK] 原稿编辑器可见
[OK] 保存后出现提案询问
[OK] 生成三套提案卡片  cards=3
[OK] 提交接口 200      {"ok":true,"taskId":"d926bebd…"}
[OK] 无 invalid_input  []
失败步数: 0
```

## 4. 复跑

```powershell
.\.venv\Scripts\python.exe tools\audit_writing.py
.\.venv\Scripts\python.exe .local\deploy\run_ui_proposals.py
```

## 4.5 最终成稿（选提案 → 确认资料 → 开始改写）

前端 `renderResult()` 读取的是 `result.structure` / `resultKind` / `structureFile` / `workflowComplete`，
而我们原来的 `/api/rewrite/generate` 任务结果只有 `text` / `metaFile`——任务虽然 `done`，
结果区却是空白（又一次"接口 200 但界面没内容"）。

补上后实盘验证（真 LLM，1 段成稿）：

```
[*] 提交 200 task=75420ca3
[*] 状态 done
    structure        图书馆内，日光从高窗斜落，长桌两侧各坐一人…
    resultKind       script
    workflowComplete True
    structureFile    scripts/2f028cab…
    scriptFile       scripts/2f028cab…
    metaFile         scripts/2f028cab…
    segments         1
[OK] 最终成稿契约 通过
```

复跑：`.local/deploy/final_gen_audit.py`（脚本在 .local，属一次性验收工具）。

## 5. 诚实边界

- 这三个链现在会把**真实正文发给配置的 LLM**，按渠道计费；示例价格只用于解锁前端按钮，
  实际不扣我们自己的积分。
- 小说转剧本按 1200 字/段切片，最多 12 段；超出部分不会处理（与原版分章处理的边界一致）。
- 质量取决于渠道：中转答成散文时 `_json_call` 会重问 3 次，仍失败则任务 `error` 并保留错误码，
  不返回假剧本。
