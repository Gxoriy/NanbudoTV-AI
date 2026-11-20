# 「补齐分镜」点了没效果：任务其实执行了，只是新版前端渲染不到（2026-11-20）

## 现象
点「补齐分镜」→ 确认报价 → 任务条闪一帧 → 回到未开始前，看起来什么都没发生。

## 抓包结论：任务**执行成功**

真机探针（`tools/ui_macro_probe.js`）抓到：

```json
POST /api/visual/macro/submit → 200 {ok:true, taskId:"2198c930..."}
GET  /api/tasks/2198c930...   → state="done", result={scenes:2, cards:16}
```

服务端确实补齐了 16 张卡并落库，所以不是“任务没执行”。

## 根因：新版前端从 `snapshot.plan.segments` 渲染

原版 2.1.293 的 `macro_arrangement.js`：

```js
const segments = snapshot => Array.isArray(snapshot?.plan?.segments)
  ? snapshot.plan.segments : [];
function renderCards(snapshot, filter, view) {
  for (const segment of segments(snapshot)) { ... readSceneCards(snapshot, segment) ... }
}
```

我们的 `macro_state` 只返回了 `scenes` 和 `segments[id].result.cards`，
**没有 `plan.segments`** → `segments(snapshot)` 得到空数组 → 一张卡都不渲染，
页面就退回“未开始前”的初始提示。

（上一轮补的 `segments[id].result.cards` 是必要条件，但不是充分条件——
前端先要有 `plan.segments` 才会去遍历它。）

## 修法

| 位置 | 改动 |
|---|---|
| `macro_state` | 为每场生成 `plan.segments[]`：`{segmentId,id,number,title,source,cardPlans}`，同时保留 `segments[id].result.cards` 与 `scenes` |
| `macro_submit` 的任务 | 写回 macro 状态时同步写 `plan.segments`，保证保存态与快照一致 |

## 修复后真机结果

```
[OK] 确认报价
POST /api/visual/macro/submit → 200
GET  /api/tasks/...           → done, cards=16
workspaceFinal:
  第 1 场 · 第一场：地下记忆当铺，夜
  补齐分镜  下载本场视频
  视频卡 1 · …
```

卡片已实际出现在页面上。

## 回归

354 tests OK（新增 `test_macro_state_exposes_plan_segments`）；规则 PASS；
首页 28 项 0 异常；前端契约缺口 0。

## 边界

卡片仍是本地按句切分（免费、秒级），不是模型生成的导演分镜；
这次修的是“结果保存了但前端看不到”的渲染契约。
