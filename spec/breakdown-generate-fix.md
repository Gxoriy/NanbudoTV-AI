# 爆款拆解「没有拆解复刻视频」三轮定位（2026-11-23）

## 1. 生成按钮一直是灰的
页面上 `#generate` 的文本是「确认价格并生成」，但 `disabled=true`，
`#generationModel` 只有一个空 option。

前端 `generationSettings()` 的过滤条件：

```js
config.visualModels.filter(row =>
  row.media==='video' && row.enabled && row.gatewayReady &&
  !row.supportsPreciseEdit &&
  (!dynamic || row.supportsVideoReference) &&
  (row.pricingMode==='live_quote' ||
   config.visualVideoPricing.some(p => p.model===row.model)))
```

我们后端 `/api/client/config`：

- 没有 `visualVideoPricing` / `visualImagePricing` → 价格过滤全灭
- 视频模型没有 `supportsVideoReference` → 动态参考模式再过滤一次

修法：
- `client_config_pricing()` 增加 `visualVideoPricing` / `visualImagePricing`
- 视频模型补 `supportsVideoReference / supportsVideoEdit / supportsPreciseEdit`
  与 `supportedAspectRatios`
- 爆款拆解专用 `/api/breakdown/quote` 返回 `{quote:{estimatedPoints>0,...}}`，
  之前是扁平 `{estimatedPoints:0}`，前端读 `plan.quote.estimatedPoints` 直接崩

## 2. 点击后真正发起生成
复验结果：

```
[OK] generationModel 有值 seedance-2.0-anci
[OK] generate.disabled = false
[OK] POST /api/breakdown/quote  200  estimatedPoints=1.0
[OK] POST /api/breakdown/generate 200 taskId=...
```

说明页面点击链路已经打通，不再卡在“按钮不可点”。

## 3. 结果视频
API 端到端（真实项目副本 + 真实密钥）：

```
[OK] 拆解有镜头结果  shots=3 frames=3 elements=3
[OK] 结果列表有视频  videos=1
     拆解复刻视频 videos/141683c1cbb24040a170bd624c88c472.mp4
     upstreamTaskId=237671205
```

## 4. 仍存在的边界
上游视频生成可能需要数分钟。自动化脚本的 12 分钟窗口内，部分运行会看到
`breakdown.generate` 仍为 running；接口链路本身能完成并写入 `project.results`。
生成任务现在会先写 20% 进度，避免页面一直 0%。

## 5. 门禁
357 tests OK；规则 PASS；前端契约缺口 0；首页 28 项 0 异常；
此前 `verify_all.py --with-ui` 10 项全 PASS。
