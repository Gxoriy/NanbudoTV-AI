# 复刻完整性审计报告（2026-11-18）

问题不是"接口在不在"，而是"**功能到底能不能用**"。所以这轮做的是三层实盘审计，
每层都有可复跑的工具，全部通过 HTTP 真打内核，不打桩。

| 层 | 工具 | 覆盖 | 结果 |
|---|---|---|---|
| 路由级 | `tools/route_audit.py` | 内核注册的 **300 条路由** | **0 个 5xx** |
| 通道级 | `tools/lane_smoke.py` | 8 个域的**主链路关键一跳** | **29/29 通过** |
| 前端级 | `tools/ui_click_audit.js`、`tools/ui_scenario.js` | 18 个页面的可点按钮 + 登录→视觉场景 | **0 失败点 / 0 失败步骤** |

## 1. 路由级：300 条全打，0 个 5xx

判据（这是"可用"的实际口径）：

| 结果 | 含义 | 数量 |
|---|---|---|
| `2xx` | 正常返回 | **130** |
| `4xx`（400/404/409/413/422） | 处理器跑到了，只是没给参数——**能正确拒绝也是能力** | **166** |
| `5xx` | 真 bug | **0** |
| `skipped` | 有破坏性，故意不调（`update/*` 4 条，本地版不支持在线更新） | 4 |

分域：

```
D1 改写   70/70      D2 视觉  120/120
D3 字幕   21/21      D4 配音   11/11
D5 电商   22/22      D6 采集   17/17
S1 会话    9/9       S2 运行时  9/9
S3 模型    8/8       S4 存储   7/7
S5 系统    3/7（4 条 update 跳过）
```

### 审计发现并修掉的两处 502

| 路由 | 现象 | 根因 | 修法 |
|---|---|---|---|
| `POST /api/rewrite/settings-suggest` | 空 body 也去问模型 → `bad_model_output` 502 | 缺输入校验 | 空设置直接 400「先填至少一项」 |
| `POST /api/transcribe` | 空音频也跑 ASR → `asr_failed` 502 | 缺输入校验 | <512 字节直接 400「音频过小」 |

顺带把 `TextAssist.json_call` 也加了**重问**（最多 3 次）——之前只有视觉域有，
文本域解析失败直接 502，把渠道抖动当成了终态错误。

## 2. 通道级：8 个域 29 步全通

```
S1 3/3  license/status → session/login（卡密）→ session/status
S2 3/3  runtime/status、storage/status、upload
D1 3/3  source/analyze → rewrite/generate 提交 → 任务 done + metaFile 落盘
D2 6/6  建项目 → 存原稿 → 三阶段 prepare → episode/state → 出图 done
D3 5/5  上传 → 检测 9/83/82/11 → 报价 → 拆轨 done（dropped=1，产出 results/*.mp4）
D4 3/3  音色目录 → 试听 60KB WAV → 报价
D5 4/4  电商建项目 → 批次 → 报价 → 保存
D6 2/2  link/analyze（Playwright）→ watch/status
```

## 3. 前端级：18 页点击 + 登录场景

- **逐页点按钮**：18 个页面、共 99+ 次点击，**0 个 4xx/5xx，0 控制台错误**
- **登录 → 视觉链路**（`ui_scenario.js`）：11 步全过，含
  错误卡被拒（中文文案）→ 正确卡登录 → 字幕导入/识别 → 项目中心 iframe 建项目 → 原稿保存 → 电商与音色页加载

## 4. "可用"的真实边界（不粉饰）

| 项 | 状态 | 说明 |
|---|---|---|
| 265 条旧路由 | 全部注册，前端调用缺口 0 | `audit_coverage.py` + `front_contract_check.py` |
| `update/{download,install,reveal}` | 501 `unsupported` | 本地重建版有意不做在线更新，文档已写明 |
| 视频生成 | 通，但单次 1~3 分钟、上游按次计费 | 未纳入默认巡检（`--with-media` 只跑图） |
| 图像生成 | 通，但**主网关账号池空**，走备用 `banana-pro` | 已加自动 fallback；换机器需在 `model-config.json` 填备用密钥 |
| 像素修补 | 通，但需要 ffmpeg | 检测/转写已改 PyAV，修补仍保留 ffmpeg 管道（见 `spec/deep-probe.md` P0-4） |
| 云端去字幕 | 409 `cloud_unconfigured` | 需自建云端服务地址/令牌 |

## 5. 复跑方式

```powershell
python tools\route_audit.py            # 300 条路由实盘审计（约 3 分钟）
python tools\lane_smoke.py --with-media # 8 个域 29 步（含出图，约 2 分钟）
node tools\ui_click_audit.js <url> 18  # 逐页点按钮
python .local\deploy\run_ui_scenario.py # 登录 → 视觉链路
python tools\audit_coverage.py          # 旧路由覆盖率
python tools\front_contract_check.py    # 前端调用面缺口
```

六项全绿，才说明"复刻的功能完整可用"。
