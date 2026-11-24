# AI 上游切换：OpenAI 兼容文本 / 视觉 / 封面（2026-11-24）

## 1. 文本
配置：

```
baseUrl = https://new.api.edu.gr/v1
model   = gpt-5-6-sol        # 列表中的 GPT 5.6 Sol
protocol= chat_completions
fallback= https://api.lk888.ai/v1 + gem-3.8-flash
```

`/v1/models` 返回 200（70 个模型）。但实测 **所有文本模型都回
“服务暂不可用，请稍后再试”**（`gpt-5-6-sol`、`chatgpt-5`、`gpt-5.5`、
`claude-opus-5-5`、`gemini-3.1-pro` 等），请求本身 200。

为了让「短剧本 / 分镜 / 大纲」还能跑，`TextAssist` 与 `VisualAssist`
增加了多渠道路由：主渠道返回占位错误时，自动切到配置的 fallback
渠道（当前用旧网关的 `gem-3.8-flash`，实测可用）。主渠道恢复后优先走新接口。

模型名说明：
- 文本端点没有 `kimi-k3`，也没有精确的 `Claude Opus 5`；
  有 `gpt-5-6-sol`、`claude-opus-5-5`、`gpt-6.1-sol` 等。
- `kimi-k3` 只在视觉端点模型列表中出现。

## 2. 视觉
独立配置：

```
baseUrl = http://43.130.31.50:18819/v1
model   = gemini-3.1-pro
```

实测用真实视频抽帧 → 视觉分析，6.9 秒返回合法 JSON（hook/structure/
sellingPoints/shots/elements）。`domain/ai/vision.py` 已改为优先读
`llm-profiles.json` 的 `vision` 段，不再复用文本的 baseUrl/key。

## 3. 封面
配置：

```
protocol= openai
baseUrl = http://43.130.31.50:18807/v1
model   = gpt_image_2
size    = 1024x1024
timeout = 600
```

`/v1/models` 200（含 `gpt_image_2`）。但 `/v1/images/generations`
单次请求 300 秒仍未返回（不是 4xx）；已把超时放到 600 秒。
这一点尚未取得成功出图证据，可能是该网关排队/上游问题。

## 4. 视频
这次没有提供新的视频网关，`model-config.json` 的 `videos` 未改动。
旧 `api.lk888.ai` 的视频额度是否可用取决于原账户。

## 5. 安全
密钥只写入 `data/llm-profiles.json`、`data/model-config.json`（`data/` 已 gitignore）。
`git grep` 确认仓库中没有新密钥字面量。
新增无密钥脚本 `scripts/configure-ai.ps1`，从
`NANBUDO_TEXT_* / NANBUDO_VISION_* / NANBUDO_IMAGE_*` 环境变量读写。

## 6. 验收
```
357 tests OK
规则 R1-R5 PASS
前端契约缺口 0
首页 28 项 0 异常
8 域通道巡检 27/27 通过
18 页点击审计 PASS
verify_all --with-ui：10 项全 PASS（8.7 分钟）
```

## 7. 仍需你确认
1. 新文本接口当前回“服务暂不可用”，需要渠道方恢复；恢复后会自动优先使用。
2. 封面接口 `/images/generations` 300 秒无响应，需要确认该地址是否就是
   `gpt_image_2` 的同步出图接口（还是需要任务轮询接口）。
3. 若要默认用 `Claude Opus 5.5` 或别的模型，改
   `llm-profiles.json` 的 `custom.model` 即可。
