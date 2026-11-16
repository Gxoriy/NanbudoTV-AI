# 中转站模型可用性实测（2026-11-16）

端点：`https://new.api.edu.gr/v1`（OpenAI 兼容）　|　密钥：仅存 `.local/relay-key.txt`（不入库）

## 1. 结论速览

| 你说要查的 | 实际结果 |
|---|---|
| **Kimi K3** | ❌ 中转站 **没有** 任何 kimi 模型（`/models` 70 个里 0 命中） |
| **GPT 5.6 Sol Max** | ✅ 可用，ID `gpt-5-6-sol`（另有一个带空格的别名 `gpt 5.6 sol`） |
| **Claude Opus 5** | ✅ 可用，ID `claude-opus-5-5`（别名 `Claude Opus 5.5`） |

`GET /models` 返回 **70 个**，逐个发最小对话请求后 **29 个**通过（其余报错或断连）。

## 2. 通过的模型（29）

```
chatgpt-5, claude-5-fable, claude-opus-4.5, claude-opus-4.5-thinking,
claude-opus-4.6, claude-opus-4.7, claude-opus-4.7-thinking, claude-opus-4.8,
claude-opus-4.8-thinking, 4.8-opus-tink, 4.8-opustink, claude-opus-5-5,
Claude Opus 5.5, claude-sonnet-4.5, claude-sonnet-4.5-thinking,
claude-sonnet-4.6, claude-sonnet-4.6-thinking, gpt-5-6-sol, "gpt 5.6 sol",
gpt-5-pro, gpt-5.4, gpt-5.5, gpt-5.5-extra-high, gpt-55-pro, gpt-6-1-sol,
"GPT 6.1 Sol", gpt-6.1-sol, Gpt5-5pro, "gpt 5.5 pro"
```

失败样例：`claude-opus-4.6-thinking` 直接断连（`RemoteDisconnected`）。
多数成功模型返回 `usage.total_tokens = 0`——中转站没有回填用量，**不能据此做计费/统计**。

## 3. 图像生成：该中转站不支持

```
POST /v1/images/generations  ->  200  text/html  len=411
body: <!doctype html><html lang="zh-CN"> ...
```

返回的是它的前端页面（SPA fallback），不是图片数据。
结论：这个 key **只能用于对话模型**，`/api/visual/cover/generate`、`/api/visual/asset/generate`
仍需另配一个真正的图像服务（`data/model-config.json` 的 `images.baseUrl`）。

## 4. 已落地的接线

| 项 | 状态 |
|---|---|
| `data/llm-profiles.json` | 已写入 `custom` 渠道：`baseUrl=https://new.api.edu.gr/v1`、`model=gpt-5-6-sol`、`protocol=chat_completions` |
| `infra/llm` 真实调用 | ✅ 通过（返回"接通"），说明 provider 注册表 + ProfileStore + 传输层端到端可用 |
| 图像生成 | ❌ 待另配（当前 503 `model_unconfigured`） |

## 4.1 图像中转站实测（`http://43.130.31.50:18807/v1`）

`GET /v1/models` 正常，返回 10 个：`iamge2`、`gpt_image_2.5`、`gpt_image_1_5`、
`nano_banana`、`nano_banana_pro`、`nano_banana_2`、`seedream_4`、`seedream_4_5`、
`seedream_5`、`flux_pro`。

| 尝试 | 结果 |
|---|---|
| `gpt_image_2`（你给的模型名） | **502 空响应**，约 6~9s，四次重试与换 `size`/`response_format` 均一致 |
| `gpt_image_2.5` / `seedream_4` / `flux_pro` / `nano_banana` | **403** `api key not allowed for model ...` |
| `GPT-IMAGE-2`（大小写变体） | 404 `unknown model`（说明模型名本身是对的，大小写敏感） |

判断：**这把 key 只授权 `gpt_image_2`，但该模型的上游当前返回 502**，不是接入问题，
也不是权限问题（权限错会是 403）。网关没有把上游错误体透传出来，所以只能看到空响应。

已把配置写进 `data/model-config.json`（`model=gpt_image_2`），上游恢复后无需改代码即可出图；
当前调用会得到明确错误：`图像服务返回 502: 上游空响应（多为服务端 502/网关错误）`。

## 4.2 对话渠道的行为边界（重要）

实测该中转站有一个很反直觉的限制：**一次要求生成较长 JSON 时会直接断连**
（`RemoteDisconnected`，不是 4xx）。隔离实验：

| 请求内容 | 结果 |
|---|---|
| 「外卖小哥…只回复两个字」 | ✅ 正常 |
| 「只输出 1 个镜头的 JSON」 | ✅ 正常 |
| 「规划 3 个镜头的 JSON 数组」 | ❌ 断连 |
| 纯英文「写 3 个镜头 JSON 数组」 | ❌ 断连 |

结论：**与内容无关，与输出长度/结构有关**。因此 `domain/visual/assist.py` 的 `plan()`
改成「逐镜头各调一次、结果合并」——慢几秒，但稳定可用（`max_tokens=512` 也够单镜头）。

## 4.3 第二家中转（`http://43.130.31.50:18813`，KIE 转发）

`GET /v1/models` 200，**137 个模型**：图像疑似 31、视频疑似 39。

| 能力 | 实测 | 说明 |
|---|---|---|
| 对话 `gpt-5-5` | **429** | `All available accounts are currently rate-limited`（上游账号池被打满） |
| 对话 `claude-opus-4-8` | 502 | 同批次不稳定 |
| OpenAI 兼容 `/v1/images/generations` | **不可用** | 返回 `model name ... not supported by KIE`（它只是把模型名透传给 KIE） |
| **KIE 原生 `/api/v1/jobs/createTask`** | ✅ **可用** | `{"model":"google/nano-banana","input":{"prompt":"…"}}` → `taskId` |
| 轮询 `/api/v1/jobs/recordInfo?taskId=` | ✅ | 状态 `waiting → generating → success`，约 40s |
| 取图 | ✅ | `resultJson.resultUrls[0]`，实测 1.0~1.6 MB PNG |

模型名必须带厂商前缀（`google/nano-banana` 可以，`nano-banana` 报 404）。

**已落进代码**：`infra/media/images.py` 新增 `protocol: "kie"` 分支（createTask → 轮询 → 下载），
配置 `data/model-config.json`：

```json
{"images": {"protocol": "kie", "baseUrl": "http://43.130.31.50:18813",
            "apiKey": "sk-kie-…", "model": "google/nano-banana",
            "pollTimeout": 600, "timeout": 600}}
```

端到端实测（走新内核，不是裸脚本）：

```
[*] 项目 b327c15f 封面联调
[*] 生成 status=200 state=done 耗时=51s
[*] 素材库 1 条 file=covers/402f988f….png
[*] 项目缩略图 covers/402f988f….png
[*] 取图 200 633435B 头=b'\x89PNG'
```

注意：该站是 **http 明文 + IP 直连**，key 在公网传输可被嗅探；只在这类内网/测试场景使用。

## 4.4 第三把 key（`sk-1d63…`）归属排查

你说"baseurl 应该是原 exe 指向的网址"，实测**原 exe 那两家都不认这把 key**：

| 目标 | 结果 |
|---|---|
| `https://dashscope.aliyuncs.com/compatible-mode/v1`（原 qwen） | **401** `Incorrect API key provided` |
| `https://ark.cn-beijing.volces.com/api/v3`（原 doubao） | **401** `The API key format is incorrect` |
| `http://43.130.31.50:18813/v1`（KIE 中转） | **401** `invalid api key` |
| `http://43.130.31.50:18807/v1`（图像站） | `/models` 200（公开目录），但任何出图 **401** |
| `https://new.api.edu.gr/v1` | **429** `rate_limit_exceeded`（≠401，说明 key 被识别，但额度/速率被打满） |

同一时刻用旧 key（`mk-…`）请求 `new.api.edu.gr/v1/models` → **200，6430 字节**，
所以 429 不是 IP 限流，是这把新 key 自身的配额问题。

**结论**：新 key 属于 `new.api.edu.gr`，目前不可用（429）；图像继续用 `18813 + sk-kie-…`；
LLM 继续用 `mk-…`。等新 key 恢复后把 `data/llm-profiles.json` 的 `apiKey` 换掉即可，无需改代码。

## 5. 建议

1. 日常对话/写作用 `gpt-5-6-sol`；长文与代码审阅用 `claude-opus-5-5`
2. `thinking` 变体延迟高（4~8s），只在需要推理时用
3. **不要**把该中转站当图像源；要出图需另找 OpenAI 兼容的 `/images/generations` 服务
4. 密钥只存在 `.local/relay-key.txt` 与 `data/llm-profiles.json`，两者都已 gitignore；
   若要换 key，改这两处即可，无需改代码
