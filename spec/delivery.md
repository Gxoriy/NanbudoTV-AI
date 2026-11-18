# 交付说明（课题验收版）

一句话：**一条命令启动，一条命令验收；9 项门禁全绿即为可交付状态。**

```powershell
.\scripts\start.ps1                       # 启动（桌面窗口）
.\.venv\Scripts\python.exe tools\verify_all.py --with-ui   # 验收（含真浏览器，约 8.5 分钟）
```

## 1. 交付物清单

| 类别 | 位置 | 说明 |
|---|---|---|
| 内核代码 | `app/`、`domain/`、`infra/` | 分层：接口层 / 领域层 / 基础设施；规则 R1-R5 强制约束 |
| 前端 | `static/` | 沿用原版明文 JS/CSS/HTML，只做"只加不改"适配 |
| 测试 | `tests/` | 322 项，覆盖每个域的路由行为与边界 |
| 验收工具 | `tools/` | 路由实盘审计、通道巡检、点击审计、契约检查、规则门禁 |
| 文档 | `spec/` | 架构还原、域实现记录、审计报告、踩坑记录（见第 8 节索引） |
| 启动脚本 | `scripts/start.ps1` | 桌面/纯内核/自定义数据目录三种用法 |
| 配置样例 | `config/*.example.json` | 模型与授权配置模板（不含密钥） |

## 2. 环境与依赖

| 项 | 版本/说明 | 必需 |
|---|---|---|
| Python | 3.12（原版 `python312.dll`，PYZ 魔数 `0x0DCB` 一致） | 是 |
| 依赖 | `pip install -r requirements.txt`（pywebview / numpy / opencv-headless / faster-whisper / **av**） | 是 |
| ffmpeg | 像素修补（inpaint）用的编解码管道 | 否（缺了只有"像素修补"不可用） |
| Playwright | 采集与 UI 验收（`NANBUDO_PLAYWRIGHT_DIR` 指向 node_modules 所在目录） | 否（缺了采集/UI 审计跳过） |

> 检测与语音识别已改 **PyAV**，不装 ffmpeg 也能用（见 `spec/deep-probe.md` P0-4）。

## 3. 首次配置（两件事）

### 3.1 模型渠道 `data/model-config.json`

```jsonc
{
  "images": {
    "protocol": "kie",                      // openai | kie | aihub
    "baseUrl": "…", "apiKey": "…", "model": "google/nano-banana",
    "aspectRatio": "9:16",
    "fallback": {                            // 主网关账号池空时自动切
      "baseUrl": "https://api.lk888.ai", "apiKey": "…",
      "model": "banana-pro", "resolution": "1K"
    }
  },
  "videos": { "baseUrl": "https://api.lk888.ai", "apiKey": "…",
              "model": "seedance-2.0-anci", "duration": "4", "aspectRatio": "9:16" }
}
```

LLM 渠道放 `data/llm-profiles.json`（`custom` / `doubao` / `qwen` 三家，任一可用即可）。
未配置时接口返回 `503 model_unconfigured` 并写明该填哪个文件——**不会假装成功**。

### 3.2 授权卡

首次启动会跳登录页；卡密从本地授权库签发：

```powershell
.\.venv\Scripts\python.exe -c "import sys;sys.path.insert(0,'.');from domain.license import LicenseStore;from domain.license.service import DEFAULT_FEATURES;s=LicenseStore('data/license.db');s.import_card('DW-XXXXX-…',days=0,features=DEFAULT_FEATURES);s.close()"
```

## 4. 启动

```powershell
.\scripts\start.ps1                              # 桌面窗口（pywebview）
.\scripts\start.ps1 -NoGui                       # 纯内核，端口写入 data\runtime-<pid>.json
.\scripts\start.ps1 -NoGui -DataDir D:\demo      # 隔离数据目录（演示用）
```

端口默认 `0`（系统分配），避免原版写死 8765 导致多开冲突。

> **未激活时会先跳登录页**：服务端对入口页（`/`、`/index.html`）做门控，未授权则 302 到 `/login.html`；登录后同一浏览器（设备码由 UA 派生）即可回首页。深链页面（如 `/visual.html`）不拦，避免自动化审计被统一跳走。

## 5. 验收（这是交付判据）

```powershell
.\.venv\Scripts\python.exe tools\verify_all.py --with-ui
```

实测输出：

```
门禁                                    结果      耗时
单元测试                                PASS   18.8s
代码规则 R1-R5                          PASS    0.6s
首页 28 项                              PASS    0.9s
前端契约（页面会调的内核接口）              PASS    0.7s
旧路由覆盖                               PASS    1.3s
300 路由实盘审计                          PASS    1.6s
8 域通道巡检                             PASS   77.2s
18 页点击审计                            PASS  363.9s
登录→视觉链路场景                          PASS   45.0s
总计 9 项，失败 0 项，8.5 分钟
[OK] 全部门禁通过，可交付。
```

九项各自的判据：

| 门禁 | 判据 |
|---|---|
| 单元测试 | 322 项全过 |
| 规则 | 行长 / 命名 / freeze / 依赖方向 R1-R5 |
| 首页 28 项 | 首屏每个数据块都有真实数据（不是 `[]` 占位） |
| 前端契约 | 页面 JS 里的 `/api/...` 全部有对应注册（0 缺口） |
| 旧路由覆盖 | `spec/route-spec.json` 265 条全覆盖 |
| 路由实盘 | 300 条真打：**0 个 5xx**（4xx 是"缺参数"，算通） |
| 启动门控 | 未激活访问 `/` → **302 到 `/login.html`**；登录后放行；**关掉软件再开需重新登录** |
| 通道巡检 | 8 个域 27~29 步主链路全通 |
| 点击审计 | 18 页 99+ 次点击，0 个 4xx/5xx |
| 登录场景 | 错误卡被拒 → 正确卡登录 → 建项目 → 存原稿 0 失败 |

## 6. 功能矩阵（交付口径）

| 域 | 能力 | 状态 |
|---|---|---|
| D1 改写 | 项目 CRUD、原文/素材、LLM 成稿（分段）、爆款拆解、动效（图生视频）、参考工作流 | 可用 |
| D2 视觉 | 项目/原稿/多阶段准备（normalize→storyboard→assemble）、分镜、素材库四表+相似度、出图、出视频、成片归档 | 可用 |
| D3 字幕 | 导入、检测（PyAV+OpenCV）、拆轨（纯 Python MP4 解析）、转写（faster-whisper）、报价 | 可用 |
| D4 配音 | 音色目录、试听（SAPI）、整片配音、报价 | 可用 |
| D5 电商 | 项目/批次/工作台/门店 CRUD、25 个动作分派、营销文案（LLM） | 可用 |
| D6 采集 | 有头窗口、链接解析、浏览器上下文下载、封面转发、Range 流 | 可用 |
| S1-S5 | 会话/授权/任务/历史/运行时/存储/更新 | 可用（`update/*` 501） |

## 6.5 示例价格与会话（容易踩的三个前端契约）

| 位置 | 契约 | 不做会怎样 |
|---|---|---|
| `/api/client/config` | `textButtonBindings[stage].price > 0`、`textModelPricing` | 前端把 `cost===0` 判成"没有价格"→「提取大纲/资产提取」按钮灰掉并显示**尚无有效价格** |
| `/api/visual/profile` | `videoPricing`/`imagePricing`/`visualModels` | 同上：报价算不出来，出图/出视频按钮灰掉 |
| `/api/visual/points` | 必须带嵌套 `usage.remainingPoints` | 前端 `renderPointsUsage(data.usage)` 取余额，缺了余额算成 0.00 →「积分不足」 |
| `/api/license/status` | 永久卡 `expiresAt = 4102444800`（2100-01-01） | 前端按 `>= 4102444800` 显示"长期有效"，`null` 会显示**有效期未知** |
| 入口页门控 | 登录/激活下发 `nanbudo_session` Cookie | 会话只在内存里，**进程重启即失效** → 再次打开必然回登录页 |
| `/api/visual/project/source` | 返回的 `project.confirmedScript` 必须等于刚保存的正文 | 前端逐字比对，缺字段/不等 → 顶部报**自动保存未完成：正文不一致** |
| 项目 DTO | 必须带 `assets.people/scenes/props` 与 `episodes` | 前端多处直接读 `project.assets.people`，缺了抛 TypeError → 同样兜成自动保存失败 |
| `/api/client/config` | 必须给 `visualModels` 且含 `media: "text"` 条目 | 前端据此填「识别模型/分镜模型」下拉，空了下拉无值 → **当前识别模型尚未配置按次价格** |
| `/api/upload` | 必须返回 `videoId` / `originalName` / `durationSeconds` | `videoId` 为空则「识别视频对白」永久禁用；`originalName` 缺失显示 **视频已上传: undefined · 00:00** |

示例价格在 `domain/pricing.py`（文本 3 个模型 × rewrite/original/assets/storyboard/refine；图像 2 个模型 × 1k/2k/4k/auto；视频 × 480p/720p/1080p），
口径仍是"对外免费"：余额 1,000,000、实际扣费恒 0，价格只用于让前端按钮可用。

## 7. 已知边界（写清楚，不含糊）

1. **`/api/update/{download,install,reveal}` 返回 501**：本地重建版不做在线更新，换版本请更新代码后重启。
2. **视频生成按次计费且慢**（单次 1~3 分钟），默认不进巡检；成本记在 `model-config.json` 里的上游账号。
3. **图像主网关（KIE）账号池可能为空**，已自动切 `banana-pro` 备用；备用密钥与视频共用同一额度。
4. **像素修补需要 ffmpeg**：检测与转写已不依赖，但"擦除画面字幕"的 inpaint 仍是 ffmpeg 管道（重写编解码链风险大于收益）。
5. **云端去字幕未配置**：`409 cloud_unconfigured`，需自建云端服务地址/令牌。

## 8. 文档索引

| 文档 | 内容 |
|---|---|
| `spec/route-spec.json` | 265 条旧路由契约（方法与字段） |
| `spec/original-architecture.md` | 原包结构、PYZ 提取方法与规模 |
| `spec/deep-probe.md` | 深度探测：220 模块 vs 现有实现、缺口与执行顺序 |
| `spec/audit-report.md` | 三层实盘审计（路由/通道/前端） |
| `spec/lane-smoke.md` | 通道巡检记录与两个"假失败"的辨析 |
| `spec/ui-contract.md` | 点击审计发现的问题与三个根因 |
| `spec/ida-insight.md` | IDA 验证结果 + 原版依赖清单（PyAV 而非 ffmpeg.exe） |
| `spec/p3-02-nodes.md` | 视觉域执行器 + 节点注册表 |
| `spec/original-alignment.md` | 提示词移植、素材库四表、多阶段流水线的对齐记录 |
| `spec/D6-report.md`、`spec/visual-stage.md` 等 | 各域实现细节与踩坑 |

## 9. 现场演示建议（三条即可讲清）

1. **主链路**：登录（先示错误卡被拒）→ 短剧项目中心 → 新建项目 → 填原稿 → 分镜（显示三阶段耗时）→ 出图
2. **省钱与稳定**：同一份原稿再点一次"准备"→ **0 秒命中缓存**（`cached:true`）
3. **诚实失败**：把 `data/model-config.json` 的视频密钥清空 → 出视频返回 `503 model_unconfigured` 且指明该填什么；恢复后重试成功
