# NanbudoTV·AI · 重建版内核

对 `NanbudoTV·AI.exe`（2.1.280）做**行为等价重建**：旧的 Python 后端只剩字节码（`app.pyc`），
无法反编译回源码，因此按 `spec/route-spec.json` 的接口契约 + 真实响应样本逐域重写；
前端（`static/`）是明文 JS/CSS/HTML，直接沿用，只做"只加不改"的适配。

**定位**：学习研究用途，全部功能免费（0 积分），不做商业盈利。

---

## 1. 当前进度（诚实版）

路由覆盖率 **100%**（265/265，全部注册，其中生成/采集类按能力返回明确 501），下表的"覆盖"指新内核已注册同路径或同前缀：

| 域 | 覆盖 | 说明 |
|---|---|---|
| D1 改写 | 55/55 | 项目 CRUD、媒体/音频、上传/转画布、LLM 生成类（流式）、恢复类 |
| D2 视觉 | 69/113（61%） | 样式/项目/画布/素材库/角色/偏好全部离线可用；需模型的路由明确 501 `model_required` |
| D3 字幕 | 21/21 | 导入/媒体/拆轨/修补/检测/报价/云端提交；ASR 明确 501 |
| D4 配音 | 7/7 | 音色目录/试听（SAPI 实时合成）/整片配音任务 |
| S1 任务/历史 | 7/7 | 任务快照/明细/取消、历史增删改查与保留策略 |
| S2 会话/授权 | 7/7 | session status/login、client/config、creation/submission、license 三件套 |
| S3 运行时 | 7/7 | health、runtime、model-profiles（含 save/test）、download |
| S5 外壳 | 6/7 | shutdown、tutorials、tutorial-video、update/*（明确 501） |
| D5 电商 | 18/18 | 展示柜/项目/批次/工作台/门店 CRUD 已实现，营销生成 501 |
| D6 采集 | 17/17 | 下载记录/流/剧集/榜单已实现；link/analyze 走 Node Playwright 真采集；其余浏览器路由 501 |

未迁移的路由统一返回 `501 {"error":"not_migrated"}`，不会静默 404 或假装成功。
随时可跑 `python tools/audit_coverage.py` 复核。

---

## 2. 快速开始

### 2.1 环境

```powershell
# Python 依赖（主内核仅标准库；numpy/cv2 供像素修补，pywebview 供桌面壳）
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

# ffmpeg / ffprobe（视频探测与编码）
# 已安装到 E:\PublicWork\ffmpeg\bin 并写入用户 PATH；代码里也有兜底探测
ffmpeg -version
```

### 2.2 启动

```powershell
# 桌面窗口（pywebview，自动打开内核页面）
.\.venv\Scripts\python.exe -m app.main

# 只要 HTTP 服务（调试/CI）
.\.venv\Scripts\python.exe -m app.main --no-gui --port 0

# 浏览器访问
# 内核启动后会打印实际端口，并写 data\runtime-<pid>.json
```

> 端口默认 `0`（系统分配），彻底避免旧版写死 8765 导致的多开冲突；
> 实际端口见日志或 `data/runtime-*.json` 的 `baseUrl`。

### 2.3 验收与门禁

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests   # 147 项
.\.venv\Scripts\python.exe tools\check_rules.py            # 行长/命名/freeze/依赖方向
.\.venv\Scripts\python.exe tests\smoke\check_contract.py   # 起真进程对比旧样本
.\.venv\Scripts\python.exe tools\audit_coverage.py         # 覆盖率
```

---

## 3. 目录结构

```
app/                入口与传输层
  main.py           进程入口：freeze_support / 端口 0 / 静态服务 / 桌面壳降级
  api/              路由注册（system / subtitle / license / voice）
domain/             业务规则（不碰 HTTP）
  subtitle/         选区网格、MP4 拆轨、像素修补、候选检测、报价
  license/          卡密签发、激活、状态
  voice/            SRT 重排、TTS provider、分段合成与混流
  visual/           节点注册表 + 执行器、样式目录
infra/              基础设施
  tasks/            SQLite(WAL) 任务状态机（落盘、幂等、中断恢复）
  llm/              provider 注册表（豆包 responses / 千问 chat_completions / custom）
  cloud/            自建云端去字幕客户端
  obs/              日志脱敏 + 子模块健康位
server/             云端服务（仅"必须联网/算力"的能力，部署在 horiy.fun）
static/             前端（旧版明文资产，基线指纹见 spec/static-manifest.json）
spec/               规格与报告（route-spec、样本、各阶段报告、决策记录 ADR）
tools/              提取/审计/签发/基准脚本
tests/              单测 + smoke 契约检查
data/               运行时数据（gitignore；任务库、卡密库、上传与结果）
```

---

## 4. 已实现接口

| 分组 | 接口 |
|---|---|
| 系统 | `/api/health`（含 components 健康位）、`/api/runtime/status`、`/api/model-profiles`、`/api/_routes`、`/api/shutdown` |
| 任务 | `/api/tasks`、`/api/tasks/list`、`/api/tasks/{id}`、`/api/tasks/cancel/{id}` |
| 字幕 | `/api/subtitle/{capabilities,list,projects,record,quote,submit,upload,media,local-start,local-stop,detect}` |
| 授权 | `/api/license/{status,activate,refresh}` |
| 配音 | `/api/voices/{catalog,quote}`、`/api/video-voice/{status,source,quote,generate,observe}` |
| 视觉 | `/api/visual/{styles,style,_nodes,projects,project,settings,profile,usage,points,models,media,style/create,style/delete}` |
| 画布 | `/api/canvas/{list,document,save,create,styles,upload,media,run-status,quote,saved,assets/,location,reveal,disconnect}` |
| 电商 | /api/ecommerce-showcase、/api/ecommerce{,/save,/upload,/batch/,/workbench/*}、/api/store/{projects,create,project,save,prepare,result,quote,upload} |
| 采集 | /api/hall/{downloads,downloads/cover,downloads/stream,episodes,rank} |
| 素材库 | `/api/asset-library/{,add,delete,media,upload}` |
| 角色 | `/api/characters{,,/library,/manage,/upload,/media,/quote,/hall,/combine,/image-models}` |

字段口径：任务用 `state=done|error` + `progress` 0~100；字幕选区为整数百分比网格
`outward_integer_percent166`；授权状态与旧版逐键对齐。

### 模型接入（图像 / LLM）

| 能力 | 配置位置 | 协议 |
|---|---|---|
| 图像生成 | `data/model-config.json`（模板见 `config/model-config.example.json`） | OpenAI 兼容 `POST {base}/v1/images/generations`，`model` 默认 `gpt_image_2.5`，支持 `b64_json` 与 `url` 两种返回 |
| LLM | `data/llm-profiles.json`（或 `server.cli` 同款 profile 存储） | `chat_completions` / `responses` 两种协议，密钥只出掩码 |

也可用环境变量覆盖：`NANBUDO_IMAGE_BASE_URL` / `NANBUDO_IMAGE_API_KEY` / `NANBUDO_IMAGE_MODEL`。
未配置时 `/api/visual/cover/generate`、`/api/visual/asset/generate` 返回
`503 model_unconfigured` 并提示该填什么，不会返回空图。

### 代码仓库

```
origin  https://github.com/Gxoriy/NanbudoTV-AI.git   (branch: main)
```

`data/`、`.local/`、`.venv/`、`spec/extracted/`、`server-config/` 均已 gitignore，
卡密、令牌、SSH 私钥不会入库。

### 云端（可选）

高频背景的像素级擦除本地搞不定（见 `spec/erase-feasibility.md`），由自建服务承担：

```powershell
# 服务器上（详见 spec/server-deploy.md）
python -m server.cli create-account CodeBuddy_Uers
python -m server --port 8787
```

客户端在 `data/subtitle-config.json` 填 `baseUrl` 与 `token` 后，
`/api/subtitle/submit` 才会走云端；未配置时返回 `409 cloud_unconfigured`，本地功能不受影响。

---

## 5. 能否从 IDE 启动桌面端？

**可以启动，但只能算"可运行的开发版"，不是可发布的桌面应用。**

| 能力 | 状态 | 说明 |
|---|---|---|
| 内核 HTTP 服务 | ✅ | `python -m app.main`，端口动态分配，优雅退出 |
| 前端静态资源 | ✅ | 内核直接服务 `static/`（`/` → index.html，JS/CSS/MIME 正确，目录穿越返回 404） |
| 桌面窗口 | ⚠️ 依赖已装 | `pywebview` 已装进 venv；`python -m app.main` 会开窗。当前环境是无窗口的自动化会话，**未做肉眼验证** |
| 任务持久化 | ✅ | SQLite WAL，崩溃后 `interrupted`，可续跑 |
| 授权门禁 | ✅ | 本地卡密签发 + 设备绑定 |
| 字幕域 | ✅ | 导入/检测/本地修补/云端提交全链路可跑 |
| 配音域 | ⚠️ 部分 | 目录/报价/整片任务可用（本机 2 个 SAPI 音色）；尚未替换视频音轨、无 `voices/media` 试听 |
| 视觉 / 改写 / 电商 / 采集 | ❌ | 未迁移，界面会显示 501 |
| 单文件打包（PyInstaller） | ❌ | P5 未开始，目前依赖 venv + 系统 ffmpeg |
| 自动更新 / 安装包 | ❌ | P5 未开始 |

**结论**：在 IDE 里 `python -m app.main` 能起窗口并操作字幕、配音、授权几个已迁移板块；
但主界面（`/` 首页）会大量 501，因为视觉/改写等域还没搬完。作为"桌面端"还缺打包与自动更新，
作为"开发版"已经可以日常跑。

---

## 6. 关键设计约束（踩过的坑）

1. **`freeze_support()` 必须最前**，否则冻结后子进程无限重启。
2. **端口不可写死**：旧版 8765 导致多开冲突，现为 0 + 回写文件。
3. **任务终态词只能是 `done`/`error`**、进度 0~100：前端 `['done','error',...].includes(state)` 判终态，
   写 `succeeded` 会让界面无限轮询。
4. **选区用 Decimal 运算**：`0.1 + 99.9` 在 float 下是 `100.00000000000001`，会误判越界。
5. **MP4 拆轨必须修 `stco` 偏移**：moov 变短会让 mdat 前移，不改偏移会花屏。
6. **日志出口统一脱敏**：`Bearer`、`sk-`、`DW-` 卡密、长 hex 一律掩码。
7. **配置值先剥 BOM**：`Authorization` 带 `\ufeff` 会抛 `latin-1 codec can't encode`。

---

## 7. 文档索引

| 文件 | 内容 |
|---|---|
| `spec/route-spec.json` | 265 条旧路由的域归属与探活基线 |
| `spec/api-samples/` | 23 个真实响应样本（写 schema 的依据） |
| `spec/smoke-baseline.json` | 旧版 31 条只读端点基线 |
| `spec/decisions.md` | ADR-001~011（路由保留、计费归零、B 档修补、服务器边界…） |
| `spec/P0-report.md` ~ `spec/P3-report.md` | 各阶段交付报告 |
| `spec/erase-feasibility.md` | 本地擦除的实测数据（PSNR/耗时） |
| `spec/server-deploy.md` | 云端服务部署记录 |
| `spec/license-ops.md` | 卡密签发与运维 |

---

## 8. 下一步

1. **P3-02 视觉域**（113 条路由、180 处调用）：`macro/*` 收敛为「执行器 + 节点注册表」
2. **P3-03 改写域**：提示词模板配置化（技能包 22 个 md 已归档）
3. **P4 前端**：免费文案、`localRepair`、detect 按钮、配音入口
4. **P5 打包**：PyInstaller onedir + 运行时外置（ffmpeg/权重按需下载）
