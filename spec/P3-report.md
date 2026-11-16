# P3 逐域迁移 · 进度报告

日期：2026-11-16　|　测试：**111 passed**　|　门禁 PASS　|　契约检查 16/16

## 0. 范围澄清（ADR-011）

**只有"必须指向云端"的能力才部署到服务器**（当前只有去字幕）；其余全部在本地
`F:\WorkAPP\NanbudoTV·AI` 运行。已从服务器回退：

| 已回退 | 说明 |
|---|---|
| `nanbudo-kernel.service` | 停止、disable、删除 unit |
| `/www/wwwroot/horiy.fun/app/` | 前端 504 个文件已删除，站点恢复原样 |
| nginx `location /api/` | 只保留 `/api/v1/`（云端去字幕） |

服务器现状：`nanbudo-cloud` 仍在跑，`https://horiy.fun/api/v1/health` 正常，原站点根目录未受影响。

## 1. P3-01 配音域（D4）第一片 ✅

| 模块 | 内容 |
|---|---|
| `domain/voice/srt.py` | SRT 解析/生成、`角色：台词` 拆分、**按音频时长重排时间轴**（间隙钳制 0.05~0.80s，绝不重叠） |
| `domain/voice/provider.py` | `TTSProvider` 协议 + **Windows SAPI 实现**（`sapi.ps1`，文本走临时文件避免转义） |
| `domain/voice/pipeline.py` | 阶段抽象：`Prepare → Synth → Assemble → Retime`；装配用 `adelay + amix` 精确定位 |
| `domain/voice/service.py` | 音色目录（对齐旧版 12 个顶层键）、免费报价、引擎状态 |
| `app/api/voice.py` | `/api/voices/catalog`、`/api/voices/quote`、`/api/video-voice/status` |

**实测**

```
voices=2 ready=2 pricing=free
Microsoft Huihui Desktop  中文（普通话）  synthesisReady=True
Microsoft Zira Desktop    en-US          synthesisReady=True
quote points=0.0 chars=4
video-voice/status -> {"ready":true,"systemCount":2,"readyCount":2}
video-voice/source -> 501（整片配音任务尚未迁移）
```

**验收口径（音画同步 ≤120ms）**：两个 0.5s 音频段分别放在 0ms / 1000ms，装配回读总时长
1.5s，断言 `delta=0.12` 通过；真实三角色对白（SAPI 合成）跑通重排，输出 3 段 SRT 无重叠。

## 1.1 整片配音端到端（新增）

```
[*] 音色 2 个，首个=Microsoft Huihui Desktop
[*] 报价 status=200 points=0.0 canGenerate=True
[*] 提交 status=200 task=18fcb503…
[*] 任务 state=done progress=100.0
[*] 任务状态 2/2 result=jobs/…/dub.wav msg=配音完成
[*] observe phase=done canObserve=True
```

实现要点：
- `intentHash = sha256(projectId|file|segments)`，内容一变就拒（409 `quote_stale`），避免"报了价却改了台词"
- 任务写入 `TaskStore`（`kind=voice.dub`），前端用现成的 `/api/tasks/<id>` 轮询，无需新轮询协议
- 任务状态另存 `voice_jobs` 表，刷新页面仍能看到 `completedCount/totalCount/canContinue/canObserve`
- 段落时间重叠、空台词、时间倒序全部在报价阶段拒绝

## 1.2 视觉域（P3-02）第一片 ✅

| 模块 | 内容 |
|---|---|
| `domain/visual/nodes.py` | 节点注册表 + 执行器（trace 记每步耗时）；新增环节只加 `NodeSpec` |
| `domain/visual/service.py` | 样式目录（324 条旧版真实数据）、项目 CRUD、设置保存 |
| `domain/visual/store.py` | 项目 SQLite（`createRequestId` 唯一索引做幂等） |
| `app/api/visual.py` | styles/style/_nodes/projects/project/project-create/settings/project-delete/project-scenes |

实测：

```
[*] 创建 status=200 id=69f8b621 name=演示短剧
[*] 幂等重建 same_id=True
[*] 读取 status=200 scenes=0
[*] 改设置 status=200 name=演示短剧·改 ratio=16:9
[*] 列表 status=200 count=1
[*] 分镜 status=501 error=unsupported
[*] 删除 status=200 ok=True
```

覆盖率从 9.4% → **11.7%（31/265）**，D2 从 0 → 7/113。

## 1.3 视觉域离线主体（P3-02 收口）✅

一次性补齐 62 条离线路由，D2 覆盖率 7 → **69/113（61%）**，全局 31 → **93/265（35.1%）**。

| 分组 | 内容 |
|---|---|
| `domain/visual/library.py` | 通用文档库（`kind` 区分 canvas/asset/character/style/profile）+ 文件落盘与越权防护 |
| 画布 | list/document/save/create/styles/upload/media/run-status/quote/saved/assets/location/reveal/disconnect（14 条） |
| 素材库 | 列表/新增/删除/上传/取文件（5 条） |
| 角色 | 列表/库/管理/上传/媒体/报价/大厅/合成/图模（9 条） |
| 其余 | 偏好读写、用量与积分（恒 0）、模型列表、自定义样式增删、项目媒体与缩略图 |
| 需模型 | 分镜/出图/出视频/macro/LLM 归一，统一 `501 model_required` 并说明缺什么 |

真机验证：

```
canvas_saved=1995e8b7   asset=03b8a1ea   assets_count=1   character=角色甲
episode_video=501 model_required
已注册路由 104 条
```

设计取舍：素材与大文件**不进库**，只存相对路径；`media` 接口一律走
"解析后校验父目录"，`../` 直接 404。

## 2. 为什么先用 SAPI 而不是接云端 TTS

- 旧版 196 个音色是厂商目录，离线不可得；先用本机真实引擎把**时间轴这条最容易错的链路**跑通
- provider 是协议：以后接自建云 TTS 只加一个实现，pipeline / 重排 / API 全不改
- 目录结构保持旧版字段，前端 `video_voice.js` 不用改就能渲染（只是音色少）

## 3. 待做（按方案 A 顺序）

| 任务 | 剩余内容 |
|---|---|
| P3-01 收尾 | ✅ 整片配音任务已通（quote→generate→tasks→status→observe）；仅 `/api/voices/media` 试听未做 |
| P3-02 视觉域（180 处调用） | `macro/*` 收敛为「执行器 + 节点注册表」 |
| P3-03 改写域 | 提示词模板配置化，新旧输出 diff 在容差内 |
| P3-04~07 | 电商/大厅/计费收口 |
| P4 | 前端只加不改：免费文案、`localRepair`、detect、配音入口 |

## 4. 已知限制

1. 本机只有 2 个 SAPI 音色（1 中文 / 1 英文），多角色需靠"同音色不同语速/音高"区分，或接云端
2. SAPI 合成单句约 0.3~0.8s，长片要按段并行（当前串行，已留 `SynthStage` 并发位）
3. `/api/video-voice/` 整片任务仍是 501，前端会提示未迁移
