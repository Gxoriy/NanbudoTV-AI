# 上游模型统一：huanhe 是门户，API 走 api.lk888.ai

## 结论
- `https://huanhe.lk888.ai` 是 **AI Model Hub 门户 SPA**，`/v1/*`、`/api/v1/*`
  全部返回 HTML 首页，**不能直接当 API base**。
- 你给的密钥在 `https://api.lk888.ai` 上有效，且同一网关同时提供文本、
  图像、视频三类模型。已把本地三类上游统一到该域名。

## 实测（同一 key）
| 用途 | 模型 | 验证 |
|---|---|---|
| 文本 | `qwen4-max` | `TextAssist.complete()` 3.2 秒返回 `OK` |
| 图像 | `banana-pro` | `POST /v1/media/generate` 返回 `task_id=233655769` |
| 视频 | `seedance-2.0-anci` | 上游任务 `id=233401727` |

`/v1/models` 列出 199 个模型（qwen/gem/deepseek/tt-image/banana/seedance/kling 等），
所以后续换模型只要改配置里的 model 名，不用换网关。

## 本地配置（已写入，gitignored）
- `data/llm-profiles.json` → `custom.baseUrl=https://api.lk888.ai/v1`、
  `model=qwen4-max`、`protocol=chat_completions`
- `data/model-config.json` → `images.protocol=aihub`、
  `images.baseUrl=https://api.lk888.ai`、`model=banana-pro`、`resolution=1K`
- `data/model-config.json` → `videos.baseUrl=https://api.lk888.ai`、
  `model=seedance-2.0-anci`

## 可复现命令（密钥不入库）
```powershell
$env:NANBUDO_UPSTREAM_KEY='sk-...'
.\scripts\configure-upstream.ps1
```

`data/` 在 `.gitignore` 中，`git grep` 确认仓库里没有密钥字面量。

## 影响
资产提取原来卡在已失效的 `api.lk666.ai/v1` + `deepseek-v4-pro`，
换成 `api.lk888.ai/v1` + `qwen4-max` 后 3.2 秒即可返回；
本地 25 秒兜底仍保留，防止上游再次不可达时任务永远 running。

355 tests OK；规则 PASS。
