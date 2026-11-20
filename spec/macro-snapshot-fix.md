# 匹配不到已生成参考图 + 步骤 03 报价仍报错（2026-11-20）

## 一、生成过同名参考图，匹配弹窗却显示 0 已有图片

`asset_match230.js` 的「已有图片」只看 `status === 'existing'`；
我们把项目里 `imageFile` 存在的资产标成 existing 的前提是对的，
但**没有给出可预览的图片地址**，而且真实项目里本机素材库（assets.db）是空的，
所以弹窗看起来“什么都没识别到”。

修法：

- `existing` 行额外带一个指向**项目自身文件**的候选：
  `url=/api/asset-library/image?file=<relative>`
- `/api/asset-library/image` 支持 `file` 参数（原先只支持素材库 `id`）

真实数据副本验收（项目 `e029b78d`，9 资产 / 8 张已生成图）：

```
[OK] 匹配返回全部资产        rows=9 total=9
[OK] 已有图片被识别          existing=8/8
[OK] 已有图片可预览          /api/asset-library/image?file=assets/e8ce1bfc…
```

## 二、步骤 03 仍报「报价字段不完整、补齐范围或卡片不匹配、调用次数或费用不一致」

根因在**卡片结构字段名**：

前端 `readSceneCards(snapshot, segment)` 只认：

```js
snapshot.segments[segmentId].result.cards
// 或 segment.cardPlans
```

我们的宏快照只给了 `scenes[].cards`，前端读到 **0 张卡**；
于是「全部重新补齐」时它认为目标卡数 = 0（期望 `maxCalls=1`），
而后端按自己的 8 张卡回了 `maxCalls=8` → 正好命中那句
“调用次数或费用不一致，未开放提交”。

修法（`macro_state`）：

- 为每场生成 `segments[id] = {result: {cards: [...]}}`
- 同时把 `scene.cardPlans` 设为同一组卡（前端 fallback 也认）

真实数据副本验收：

```
[OK] 快照含 segments[].result.cards   cards=8
[OK] all 报价与卡片一致               maxCalls=8 numbers=[1..8]
```

`tools/audit_macro_quote.py`（照前端 `validTextQuote` 实现的校验器）：6 步 0 失败。

## 三、回归

348 tests OK；规则 PASS；首页 28 项 0 异常；前端契约缺口 0。

## 四、需要你做的

**重启软件**（当前进程仍是旧代码）。重启后：

1. 步骤 02「匹配本地资产」应显示 `已有图片 = N`，且能展开预览已生成图
2. 步骤 03「补齐分镜」选择「全部重新补齐」应能核价并提交，出现分镜卡

若第 2 步仍报同一句，请把浏览器控制台里 `/api/visual/macro/quote` 的
响应 JSON 发我——那说明前端还带着一个我们没覆盖的字段组合。
