# 步骤 03「报价字段不完整…」真实 UI 复现与修复（2026-11-20）

## 一、用真实项目做了冒烟探针（不是猜）

脚本：`tools/ui_macro_probe.js` + `.local/deploy/run_macro_probe.py`

- 复制真实 `data/*.db` 到临时目录（**不动你的真实库**）
- 用你给的卡密 `DW-44HD-…` 只写入临时 license.db（不会占用真实倒计时）
- 打开真实项目 `a8b109bb`（测试E），进步骤 03 → 点「补齐分镜」→ 抓真实请求/响应

抓到的请求：

```json
{"projectId":"a8b109bb…","action":"plan","segmentId":"scene-1","source":"短剧剧本：《记忆当铺》…"}
```

抓到的响应（修复前）：

```json
{"action":"plan","segmentId":"scene-1","maxCalls":1,"unitCredits":1.0,"totalCredits":1.0,…}
```

## 二、根因：plan 报价**不该回 segmentId**

前端校验（`validTextQuote`）第一个身份判断：

```js
quote.segmentId !== undefined && quote.segmentId !== (id || '')
```

调用时 `action='plan'`，`id` 传的是 **空字符串**（场次 id 只用于 `segment` 动作）。
我们回了 `segmentId: "scene-1"` → `"scene-1" !== ""` → **立刻 false**，
后面的检查根本轮不到，于是永远显示那句合并报错。

> 顺带说明：服务端接口并不缺，`macro/quote`、`macro/submit`、`macro/state`、`tasks/<id>` 都在，
> 问题是**字段语义**——plan 与 segment 对“身份”的期望不同。

## 三、修复

`app/api/visual_tail.py::macro_quote`：

```python
# 只有场级补齐才回 segmentId；plan/plan_resume 前端用 id='' 比对
if action == "segment" and segment_id not in (None, ""):
    quote["segmentId"] = str(segment_id)
```

（submit 仍按报价里保存的 segment 执行；plan 是全剧本，不受影响。）

## 四、修复后的真实 UI 结果

同一探针再跑一次，工作区状态从

```
报价字段不完整、补齐范围或卡片不匹配、调用次数或费用不一致，未开放提交。
```

变成

```
报价已就绪；确认后付费调用模型，取消不调用、不扣费。
```

响应变为：

```json
{"action":"plan","unitCredits":1.0,"maxCalls":1,"totalCredits":1.0,
 "actualCallBilling":true,"shotFirst":true,"expiresAt":1795160791.9}
```

（无 `segmentId`，与前端期望一致。）

## 五、同批还修了「已有参考图识别不到」

真实项目副本验收（`tools/audit_real_project.py`）：

```
[OK] 匹配返回全部资产        rows=9 total=9
[OK] 已有图片被识别          existing=8/8
[OK] 已有图片可预览          /api/asset-library/image?file=assets/e8ce1bfc…
[OK] 快照含 segments[].result.cards   cards=8
[OK] all 报价与卡片一致               maxCalls=8 numbers=[1..8]
```

## 六、回归

348 tests OK；规则 PASS；首页 28 项 0 异常；前端契约缺口 0。

## 七、你这边要做的

1. **重启软件**（当前进程仍是旧代码）
2. 打开项目 → 步骤 03 → 「补齐分镜」→ 应显示“报价已就绪”，确认后开始补齐
3. 步骤 02「匹配本地资产」应显示“已有图片 = N”，可展开预览

## 八、边界说明

- 分镜卡仍是本地按句切分（免费、秒级），不是模型写的导演分镜。
- 探针只做“读+点按钮+抓包”，写操作发生在临时数据副本里；真实 `data/` 未被修改。
- 卡密只在临时 license.db 内导入，不会启动你真实授权的倒计时。
