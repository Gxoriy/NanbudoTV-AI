# 深度探测：原包 220 个业务模块 vs 我们的实现（2026-11-17）

工具：`tools/deep_probe.py`（PYZ 模块清单）+ `tools/ida_insight.py`（原生层）+ `tools/front_contract_check.py`（前端调用面）。

## 0. 先说方法论：覆盖率那个数字不能当真

探测脚本会算一个"函数名命中率"，但原版函数名带编号后缀（`_asset228`、`_cut_for`、`_accept_stage`），
和我们自己起的名字天然对不上，所以算出来只有 4%~24%。**这个数字只说明命名不同，不说明功能缺失**。

真正可信的三层证据是：

1. **IDA**：原版 exe 只有 400 KB 的 PyInstaller bootloader（876 函数 / 1255 字符串），
   没有任何业务代码 → 业务全在 PYZ，`marshal` 就能读，不需要反汇编。
2. **PYZ**：220 个 `core.*` 模块、2941 个函数、约 740 KB 字符串、107 条提示词、45 段 SQL。
3. **前端**：18 个页面、`/api/` 字面量 265 条，与 `route-spec.json` 完全一致。

结论：**功能清单以模块为准，不以函数名为准。** 下面按模块语义对照。

## 1. 域级规模（探测结果）

| 域 | 模块 | 函数 | 我们对应实现 |
|---|---:|---:|---|
| 视觉/分镜 | 76 | 897 | `app/api/visual*.py`、`domain/visual/*`、`domain/visual/nodes.py` |
| 其他（导演/校验/缓存） | 44 | 379 | 部分散落在 `visual_stage`、`domain/visual/service.py` |
| 改写/原创/剧本 | 36 | 350 | `app/api/rewrite*.py`、`domain/prompts*.py` |
| 电商/门店/投放 | 17 | 269 | `app/api/commerce.py`、`app/api/compat.py` |
| 素材/资产 | 16 | 228 | `domain/visual/assets.py`、`domain/visual/library.py` |
| 系统/授权/更新 | 12 | 127 | `app/api/system.py`、`domain/license/*`、`infra/tasks` |
| 模型/管线底座 | 5 | 119 | `infra/llm/*`、`infra/media/*`、`domain/*/video.py` |
| 配音 | 6 | 85 | `domain/voice/*`、`app/api/voice.py` |
| 字幕 | 6 | 72 | `domain/subtitle/*`、`infra/asr/*`、`infra/subtitle/*` |
| 采集/链接 | 2 | 17 | `infra/browser/*`、`app/api/hall.py` |
| **合计** | **220** | **2941** | 265 条路由 + 583 个自研函数 |

## 2. 缺口清单（按"用户可感知"排序）

## 2.0 本轮已执行（P0-1 / P0-5）

| 项 | 改动 | 实测 |
|---|---|---|
| **P0-1 并行分镜**（`core.parallel_shots209`） | `assist.plan(concurrency=N)`：线程池保序，上限 4，失败镜头**降级串行重试一次** | 4 镜：串行 138.7s → 3 路并发 93.4s（**1.48x**）；默认 2 路（保守，防撞限速） |
| **P0-5 JSON 校验重试**（`core.validator` 的 `_accept_*`） | `_json_call` 解析失败时**重问**（最多 3 次），第二次起把要求压到"第一个字符必须是 {"；容忍 ```json 围栏 | 竞品实测：加之前 2 次运行全部 `502 bad_model_output`；加之后连续两次 200 |

P0-5 是被"跑并发"意外发现的真凶：`bad_model_output` 一直是分镜阶段最高频的失败，
而我们原来的实现是**解析失败直接抛 502**，等于把渠道的"答成散文"当成了终态错误。
现在改成重问——同一问题重问一次多数能拿到合法 JSON，这也是原版 `validator` 存在的原因。

## 2.1 剩余 P0

| # | 原版模块 | 我们现状 | 差距 | 做法 |
|---|---|---|---|---|
| P0-1 | `core.parallel_shots209`（29 函数） | 分镜逐镜串行，2 镜要 13s | 镜数一多就线性变慢 | 逐镜请求改为**受限并发**（默认 3），保序合并，失败回退串行 |
| P0-2 | `core.cut_state`（22 函数，指纹） | 每次重切都重新问模型 | 重复付费、结果漂移 | 按"源文本+配置"算指纹，命中则直接复用上次切分 |
| P0-3 | `core.prompt_builder`（30 函数，**37 条提示词**） | 只移植了 17 条 | 提示词密度不足，输出偏散 | 把 37 条按用途补齐进 `domain/prompts_original.py` |
| P0-4 | IDA 发现：原版用 `av 18.1.0`，**不带 ffmpeg.exe** | 依赖外部 `ffmpeg.exe` 路径 | 换台机器就断 | 抽音轨/去字幕轨改 PyAV，`av` 钉 18.1.0 |

### P1：功能对齐（原版有、我们没有）

| # | 原版模块 | 现在 | 做法 |
|---|---|---|---|
| P1-1 | `core.shot_first_planning`（35 函数，9 提示词） | 直接逐镜生成，节奏易散 | 先出"整场镜头表"（秒数/事件/情绪），再逐镜细化 |
| P1-2 | `core.asset_matching228`（21 函数） | 只用名称包含打分 | 加年龄/性别/身份/场景类型加权，按分镜做匹配 |
| P1-3 | `core.character_library`（21 函数） | 角色散在素材 payload | 独立角色表：别名、外貌、关系、参考图版本 |
| P1-4 | `core.ecommerce_image_workbench`（46 函数） | 只有批次状态机 + 文案 | 主图重绘/换色：LLM 出方案 → 图像模型出图 → 版本管理 |
| P1-5 | `core.subtitle_removal_ocr242` | 有选区检测，无 OCR | 接 OCR（PaddleOCR/RapidOCR）读取字幕文本，做"只糊字不糊画面" |
| P1-6 | `core.workflow_task_journal`（21 函数） | 任务队列有，但重启后断点靠猜 | 任务日志：每次阶段迁移落一条，重启按日志续跑 |
| P1-7 | `core.video_dubbing`（含 voice_catalog） | SAPI 单轨合成 | 多角色分轨合成 + 与原声混流 |

### P2：锦上添花

| # | 原版模块 | 说明 |
|---|---|---|
| P2-1 | `core.director_regeneration` / `director_skill_comparison` | 导演重排、风格 A/B 对比 |
| P2-2 | `core.macro_task_pipeline` / `macro_media_workflow` | 宏排卡的阶段状态机细化（我们已有基础版） |
| P2-3 | `core.license_client`（34 函数） | 离线签名校验、设备指纹强化（当前是本地库校验） |
| P2-4 | `core.video_compat` | 按模型能力自动换算时长/画幅/分辨率 |
| P2-5 | `core.local_api_security` | 本地 API 的 token/来源校验（当前只有回环绑定） |

## 3. 已经对齐、不用再动的部分

| 能力 | 证据 |
|---|---|
| 265 条路由 | `tools/audit_coverage.py`：注册 265/265，`front_contract_check` 缺口 0 |
| 依赖形态 | pywebview 6.2.1、faster-whisper 1.2.1、opencv-headless 4.14 与原版一致 |
| 出图/出视频 | `seedance-2.0-anci` 真机出片（720×1280，4.04s） |
| 字幕本地链路 | 拆轨/修补/检测/转写/报价，detect 与真值误差 1% 内 |
| 电商动态动作 | `/api/ecommerce/<25 actions>` 全接，0 失败点 |

## 4. 执行顺序（本轮开始）

1. **P0-1 并行分镜**（改动小、立刻能测出速度差）
2. **P0-3 提示词补齐到 37 条**（纯数据搬运，风险低）
3. **P0-4 PyAV 替换 ffmpeg.exe**（去外部依赖，需回归字幕链路）
4. **P0-2 切分指纹**（省重复调用，需先有 P0-1 的稳定输出）
5. 之后按 P1-1 → P1-2 → P1-6 推进

每项都要求：改完有测试、真机跑一次、门禁绿。
