# 「视频报价与当前卡片或生成设置不一致」修复（2026-11-20）

## 现象
步骤 03 点「生成本场全部视频」→ 报错：

> 视频报价与当前卡片或生成设置不一致，未提交；请刷新核对。

## 根因
新版前端 `quoteMedia()` 在 `directSubmit` 下逐项比对：

```js
response.segmentId === id
response.cardNumber === number
(response.duration ?? response.durationSeconds) === duration
response.resolution === selected.resolution
response.ratio === selected.ratio
response.model === selected.model（若返回）
```

我们的 `/api/visual/macro/media/quote` 只是简单别名到文本报价
`macro_quote`，它只回 `{quoteId, action, maxCalls, unitCredits, totalCredits}`，
**没有回 segmentId/cardNumber/model/resolution/ratio/duration**，逐项比对必败。

## 修法
- 新增 `app/api/media_quote.py::build_quote()`，生成逐项完整的报价：
  `quoteId / projectId / action / segmentId / cardNumber / model / resolution /
  ratio / duration / durationSeconds / maxCalls=1 / unitCredits / totalCredits /
  estimatedPoints / expiresAt / pricingMode / referenceAssetIds`
- 价格从 `VIDEO_PRICING/IMAGE_PRICING` 按 model + resolution 取；视频按秒 × 时长
- 报价里保存 `source`（优先卡片 storyboard，其次 cardDraft.prompt），
  供 `/api/visual/macro/media/submit` 在前端只传 quoteId 时取提示词
- `visual_tail.py` 的 handler 改为短包装（顺带压回 R1 800 行：745 行）

## 验收
`tools/audit_media_quote.py`（真实上游配置）：

```
[OK] 报价逐项一致 status=200
     quoteId=6b4c1598e18449e189ad0e78e8dc0690
     segmentId=scene-1  cardNumber=1
     model=seedance-2.0-anci  resolution=720p  ratio=16:9  duration=4
     totalCredits=8.0
[OK] 提交返回任务 status=200 task=675be4d3511c469ea9bf33b800003b23
```

`verify_all.py --with-ui`：10 项全 PASS（8.9 分钟），含 18 页点击审计。

## 回归
356 tests OK（新增 `test_macro_media_quote_matches_card_settings`）；
规则 PASS；首页 28 项 0 异常；前端契约缺口 0。
