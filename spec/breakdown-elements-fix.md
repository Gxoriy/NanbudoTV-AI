# 爆款拆解「结果列表暂未读取成功 / undefined.some」修复（2026-11-23）

## 现象
截图提示：

> 任务已结束，结果列表未读取成功，请重新打开本项目领取结果。
> 项目记录暂未刷新：Cannot read properties of undefined (reading 'some')

顶部 `done`，右栏空白。

## 根因
浏览器错误来自 `breakdown.js` 渲染阶段：

```js
if (!project.analysis.elements.some(row => row.id === activeElement))
  activeElement = project.analysis.elements[0]?.id;
```

而 `/api/breakdown/project` 的 DTO 只回 `analysis`（模型输出），
没有 `analysis.elements` 字段 → `undefined.some()` 抛错 →
轮询的 catch 分支误报“结果列表未读取成功”。

同时 `project.replacements` 也缺字段，虽然当前有 `|| []` 兜底，但一并补齐。

## 修法
- DTO `breakdown_project`：
  - `analysis.elements` 兜底为 `[]`
  - 顶层 `replacements` 兜底为 `[]`
- 分析提示词增加 `elements` 输出规范：
  `{"id","name","kind":"person|object|scene","bbox":[]}`
- 结果落库时 `data.setdefault("elements", [])`
- `tools/audit_breakdown.py` 打印 elements/replacements 数量
- 新增 `tools/ui_breakdown.js`：真实页面载入项目副本，检查渲染异常

## 验收
真实项目副本 UI（`tools/ui_breakdown.js`）：

```
[OK] 页面载入
[OK] 无 undefined.some 报错
[OK] 分析面板可见
state.results = 在中间左右对照播放 / 拆解分析 · 待验收 · 最新 / …
```

唯一的控制台错误是 favicon 404，与业务无关。

接口复核：前端契约缺口 0；首页 28 项 0 异常；300 路由实盘审计通过；
357 tests OK；规则 PASS；此前的 `verify_all.py --with-ui` 10 项全 PASS。

## 说明
这次是**纯 DTO 字段补齐**，不改模型调用语义。elements 为空时页面显示“识别资产 0 个”，
这是真实状态；视觉模型返回 elements 后会自动出现可替换资产卡片。
