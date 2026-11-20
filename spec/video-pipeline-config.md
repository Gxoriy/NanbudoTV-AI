# 上游视频管线配置与「生成本场全部视频」解锁（2026-11-20）

## 一、网关地址纠正
用户给的 `huanhe.lk888.ai` 是门户站，`/v1/media/*` 在它上面返回 HTML 首页。
真实 API 是 `https://api.lk888.ai`，沿用仓库原有的 aihub 风格：
`POST /v1/media/generate` + `GET /v1/media/status?task_id=...`。

用提供的密钥调 `create_task()` 实测：

```
上游任务已创建，id=233401727
```

说明密钥有效、管线可用。密钥只写入 `data/model-config.json`（`data/` 已 gitignore），
没有出现在提交物里；临时脚本中的字面量也已脱敏。

## 二、"生成本场全部视频"置灰的三层原因

抓包+调用前端自己的 `sceneVideoPlan230()` 得到：

```
videoPlan.cardNumbers = []
skipped = [{cardNumber:1, reason:"分镜未就绪"}, ... ×8]
```

逐层定位：

1. **媒体目录**：`macro/media/catalog` 原来没有 `models` 数组，报“媒体模型目录格式无效”。
   已补 `models / imagePricing / videoPricing / assets`，模型还声明了
   `supportedAspectRatios / supportedDurations / referenceImageLimit / min/maxDuration`，
   否则 `mediaIssue()` 仍会把卡判为不可用。
2. **卡片就绪**：前端 `cardComplete()` 只认 `card.storyboard`（或 shots），
   我们原来只给 `prompt` → 判假。补 `storyboard: "【镜头】N\n【画面】..."` 与
   `durationSeconds:4`，并在整剧 plan 时**重建**卡片（不能保留旧的
   `complete=true` 但无 storyboard 的卡）。
3. **结果标记**：`readSceneCards` 会重算 `complete`，要求
   `segments[id].result.complete === true`；我们只给了 `result.cards`，
   于是重算后每张卡又变回 `complete:false`。补 `result.complete:true` 后：

```
videoPlan.ready = [1,2,3,4,5,6,7,8]
videoButtons: {"text":"生成本场全部视频","disabled":false}
```

按钮已实际解锁。

## 三、媒体提交提示词
前端提交媒体时只带 `quoteId`，不带 `prompt`；`macro/media/submit` 原来直接取
`body.prompt` → 空提示词 400。改为从 `_macro_quotes[quoteId].source` 回退，
再交给 `VideoPipeline.start()`。

## 四、回归
355 tests OK；规则 PASS；首页 28 项 0 异常；前端契约缺口 0。
测试补了 `result.complete` / storyboard / 模型能力字段断言。

## 五、边界
- 已验证：网关连通、密钥有效、上游任务创建成功、UI 按钮从 disabled=true 变 false。
- 浏览器里完整点完"批量生成并等视频落库"的最后一跳受探针的确认弹窗时序影响，
  尚未作为门禁固化；如你手点后仍有报错，把提示原文发我，我按同一抓包方式补齐。
- 视频是异步任务（可能数分钟），前端用 `/api/tasks/<id>` 轮询，落库后会出现在素材库。
