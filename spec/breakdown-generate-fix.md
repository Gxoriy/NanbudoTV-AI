# 爆款拆解「没有拆解复刻视频」最终定位（2026-11-23）

## 1. 页面侧：生成按钮已可点
`/api/client/config` 补 `visualVideoPricing/visualImagePricing`、视频模型补
`supportsVideoReference` 后：

```
generationModel = seedance-2.0-anci
generate.disabled = false
POST /api/breakdown/quote  200  estimatedPoints=1.0
POST /api/breakdown/generate 200 taskId=...
```

## 2. 后端：视频任务失败原因（本次实测）
直接提取 `breakdown.generate` 任务后看到：

```
video task error:
创建视频任务未返回 task_id:
{'code': 402, 'data': {'差额': 1.3152, '当前余额': 3.3972, '需要金额': 4.7124},
 'error_code': 'insufficient_balance', 'msg': '余额不足'}
```

**不是代码问题，是上游账户余额不足。** 5 秒 480p 需要 4.71，当前余额 3.40。

修法（防止“顶部假完成”）：
- 内层视频任务失败时，外层 `breakdown.generate` 直接 `error`，
  并带“视频生成失败：…余额不足”的原因；不再写空结果、不再假装完成
- 生成任务提交后写 20% 进度
- 视觉分析超时 30s → 60s

## 3. 资产识别
最新项目 `7ed89611…` 重新分析后：

```
state done
shots 3 elements 4
hook 以充满科技感与黑客风格的坐标网格与代码线条展开…
```

说明视觉模型与 `elements` 已恢复。旧项目里的 0 个资产是上一次
视觉超时降级留下的结果，重新「开始拆解」即可刷新。

## 4. 结论
- 页面点击 → 报价 → `breakdown.generate` 已经真实发起
- 视频没出现是因为上游返回 `insufficient_balance`
- 充值后（或把时长改短 / 换更便宜模型）即可生成；当前不会再有“任务 done 但结果为空”

## 5. 门禁
357 tests OK；规则 PASS；前端契约缺口 0；首页 28 项 0 异常。
