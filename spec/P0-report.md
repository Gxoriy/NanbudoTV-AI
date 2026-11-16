# P0 行为规格提取 · 交付报告

对象：`NanbudoTV·AI.exe`（实测版本 **2.1.280**，端口 **8765**）
产出位置：`spec/`；工具：`F:\WorkAPP\Tool\pyinst_extract.py`

## 1. 提取结果（与报告基线对照）

| 项 | 实测 | 报告基线 | 结论 |
|---|---|---|---|
| PyInstaller 条目 | 13 个 | 13 | 一致 |
| 顶层 code object | 236 | 236 | 一致 |
| 字符串常量（去重） | 2696 | 2627 | 差异为去重/长度截断口径 |
| /api 路由（前缀） | 265 | 278 | 265 前缀 + 10 后缀子路由 + 3 查询串变体 |
| 内嵌 SQL / 固定 base URL | 0 / 0 | — | 唯一命中是路径里的 `select` 与 `http://` 前缀，均非真实 SQL/URL |
| 数字后缀命名函数 | 60 | 举例若干 | NFR-2 门禁需覆盖全部 |

## 2. 域归属（NFR-10）

| 域 | 名称 | 路由数 |
|---|---|---|
| D1 | 改写 | 55 |
| D2 | 视觉 | 113 |
| D3 | 字幕/ASR | 21 |
| D4 | 配音 | 7 |
| D5 | 电商/门店 | 18 |
| D6 | 素材大厅/采集 | 17 |
| S1 | 任务与状态 | 7 |
| S2 | 授权与计费 | 7 |
| S3 | 模型与运行时 | 7 |
| S4 | 存储与缓存 | 6 |
| S5 | 更新与外壳 | 7 |

未归属路由：**0**（脚本在不全覆盖时直接非零退出）。

## 3. 前端调用图谱（P0-03）

- 扫描 js 文件 64 个，调用点 **515** 处，唯一路径 **278** 个
- 前端孤儿（前端在调、后端无路由）：**0**
- 后端孤儿（后端有路由、前端零引用）：**9**

后端孤儿逐条定性。**决策：业务方无法判定废弃项，全部保留为 `active`**，仅打 `orphan_backend` 标记，迁移时按原样实现（宁留勿删）：

| 路由 | 域 | 可能原因 |
|---|---|---|
| `/api/breakdown/audio-observe` | D1 | 音频观察面板未接入 |
| `/api/link/cover` | D6 | 分享链接页由后端直接生成 HTML，不在 static 内 |
| `/api/link/stream` | D6 | 同上，带 token 的流式地址 |
| `/api/rewrite/settings-suggest` | D1 | 设置建议接口未接入 |
| `/api/test-model` | S3 | 模型连通性测试入口未接入当前 UI |
| `/api/update/install` | S5 | 更新安装由 js_api/桌面壳触发 |
| `/api/visual/assets/deduplicate` | D2 | 素材去重未接入 UI |
| `/api/visual/unlock` | D2 | 旧解锁流程遗留 |
| `/api/watch/discard` | D6 | 采集窗口由桌面壳触发或功能已废弃 |

## 4. 冒烟基线（P0-06）

- GUI 真机冒烟：窗口标题 `['NanbudoTV·AI v2.1.280']`，渲染校验通过
- 覆盖 31 条只读端点，非 200 共 7 条（作为基线保留，迁移后必须复现同样行为）

| 端点 | 基线状态码 |
|---|---|
| `/api/` | 404 |
| `/api/hall/episodes` | 404 |
| `/api/hall/rank` | 404 |
| `/api/history/policy` | 404 |
| `/api/store/projects` | 400 |
| `/api/video-voice/source` | 404 |
| `/api/video-voice/status` | 400 |

> 非 200 不一定是缺陷：`/api/hall/episodes` 之类缺参数时返回 404 是既有行为。
> 迁移判定口径 = 状态码 + 顶层 JSON 键集合不变，不比业务数据。

## 5. 关键发现（影响 P1/P2 设计）

1. **端口固定 8765**：实测多开必冲突，`infra` 首件事是端口 0 动态分配 + 端口回写文件。
2. **已激活状态**：本机 `licensed=true`、`expiresAt` 存在，冒烟可直接跑真实接口，无需绕过授权。
3. **路由不是字典表**：`/api/` 本身返回 404，说明分派是「前缀 + 显式分支」而非 map，迁移时需保留同样的 404 语义。
4. **提示词并未集中在 app.pyc**：≥60 字中文长文本仅 13 条，主体在 `assets/skills/*.md`（已归档 22 个文件）。
5. **展示名直接作为磁盘目录名**：`data/outputs/我的下载`、`数字人角色库/配音结果` 等，`infra/store` 必须做 hash 目录 + 展示名分离。
6. **asset-library 已在用 SQLite**（7 张表，见 `data-layout.md`），可作为其他域落盘的现成范式，无需另起方案。

## 6. 决策记录（2026-11-16）

| # | 决策 | 影响 |
|---|---|---|
| 1 | **路由全保留**：业务方无法判定废弃项，265 条一律 `active`，9 条前端零引用者只打 `orphan_backend` 标记 | 迁移按原样实现，宁留勿删；后续若确认废弃，改 `status` 即可，不影响骨架 |
| 2 | **前端基线入库**：`static/` 已整体复制进新项目（504 文件 / 30.8 MB / 其中代码 148 个），并生成 sha256 指纹清单 | P4 双轨有据可依；误改老页面可被指纹比对发现 |
| 3 | **卡密入库为本地文件**：本机已激活，掩码 `DW-V9PG***-96VK` 对应卡 1；另有备用卡 1 张 | 授权/计费（S2）测试不再受激活阻塞；明文只存 `.local/cards.txt`（已 gitignore），报告内不落明文 |
| 4 | **适配器口径修正**：旧实现只剩字节码，无法在新进程里运行时转发 | P1-04 的 catch-all 适配器只存在于规格层（`route-spec.json` 行为契约），不是代码级转发；新实现必须按契约重写，验收以冒烟基线为准 |

## 7. 产物清单

| 文件 | 用途 |
|---|---|
| `spec/extracted/` | CArchive 解包（app.pyc / PYZ / 启动桩） |
| `spec/pyz-modules.json` | PYZ 模块名表（依赖核实） |
| `spec/raw.json` | 函数/类/常量/路由原始提取 |
| `spec/route-spec.json` | 265 条路由的域归属 + 前端调用 + 探活状态 |
| `spec/frontend-calls.json` | 515 处调用点与双向孤儿 |
| `spec/prompts/` | 技能包 22 文件 + 中文长文本 + 关键词统计 |
| `spec/data-layout.md` | data 目录形态与 sqlite schema |
| `spec/smoke-baseline.json` | 冒烟基线（31 条） |
| `spec/static-manifest.json` | 前端基线指纹（504 文件） |
| `static/` | 前端基线副本（P4 起在此之上增量演进） |
| `tools/*.py` | 可重复执行的提取/归一/审计脚本 |
| `tests/smoke/smoke_api.py` | 迁移门禁（record / check 双模式） |

## 8. 下一步（P1）

- `app/main.py`：`freeze_support` + 端口 0 + 端口回写 + 服务线程 daemon 化
- `infra/tasks`：SQLite(WAL) 任务状态机（对齐 asset-library 现有范式）
- `infra/llm`：provider 注册表（豆包 responses / dashscope 兼容 / custom）
- `api/router.py`：按域挂载 + 未实现路由统一返回 `501 not_migrated`（替代不可行的运行时转发）