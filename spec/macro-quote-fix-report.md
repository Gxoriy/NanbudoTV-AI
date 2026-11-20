# 宏编排「报价字段不完整 / 范围不匹配 / 调用次数不一致」修复报告

## 现象
点击步骤 03「补齐分镜」弹：

> 报价字段不完整、补齐范围或卡片不匹配、调用次数或费用不一致，未开放提交。

## 根因：报价没按 `validTextQuote` 的完整契约返回

前端 `macro_arrangement.js::validTextQuote` 逐项校验：

```js
quoteId 非空；quote.action === action；
quote.segmentId/cardNumber 若存在必须匹配；
maxCalls 整数≥1；unitCredits>0；totalCredits>0 且 = unitCredits*maxCalls；
plan：actualCallBilling===true 或 maxCalls<=2 或 shotFirst===true；
场级补齐：completionMode 回显、cardCount/cardNumbers 与当前卡一致，maxCalls=目标卡数。
```

我们之前只回 `{quoteId, action, maxCalls:1, totalCredits:1}`：

- 缺 `unitCredits` → 第一条就 false
- 场级补齐没有 `completionMode/cardNumbers/cardCount` → 范围判定 false
- 还回了一个 `"cardNumber": null`（`Number(null)=0` 与 undefined 不等）→ 身份判定 false

## 修法

| 位置 | 改动 |
|---|---|
| `macro_quote` | 回 `unitCredits`；`cardNumber`/`segmentId` 仅在请求真的带了才回（不再回 null）；plan 动作标 `actualCallBilling/shotFirst`；场级按 `completionMode` 从已保存分镜卡算出 `cardNumbers/cardCount/maxCalls`（`all`=全部卡，`missing`=未完成卡） |
| `macro_submit` | 按 `completionMode/cardNumbers` 只补目标卡（`all` 重建、`missing` 只补未完成）；回执带 `maxCalls/unitCredits/totalCredits` |
| 执行方式 | 本地按句切镜是秒级操作，改为**同步执行**，避免后台线程与退出/测试竞争写库 |

## 验收（`tools/audit_macro_quote.py`，照着前端规则实现校验器）

```
[OK] plan 报价通过校验        ok
[OK] plan 提交并完成          task=done
[OK] plan 后生成分镜卡        cards=2
[OK] 场级 all 报价通过        maxCalls=2
[OK] 场级 all 提交并完成      task=done
[OK] 场级 missing 不误报      maxCalls=1
合计 6 步，失败 0
```

`tools/audit_step1_step3.py`：8 步 0 失败（目录 3 场、报价凭据、任务 done、6 张卡）。

## 回归

348 tests OK；规则 PASS；首页 28 项 0 异常；前端契约缺口 0。

## 诚实边界

- 分镜卡仍是**按句本地切分**（免费、稳定），不是模型写的导演分镜；要真的“AI 拆分”还需接 LLM。
- `missing` 模式在“所有卡已完成”时目标为 0，前端本来就会先拦截并提示改选“全部重新补齐”，
  所以这里回 `maxCalls=1` 不会造成误提交。
