# AI 电商板块 `reading 'mode'` 修复（2026-11-23）

## 现象
进入「AI电商」报：`Cannot read properties of undefined (reading 'mode')`；
历史项目也不可见。

## 根因
### 1. 列表字段名不对
前端 `ecommerce259.js`：

```js
const value = await api('list?includeDeleted=1');
const rows = value.projects || [];
...
active.filter(row => row.mode === mode)
```

后端 `compat.list_docs` 只返回 `{documents:[...]}`，而且条目只有
`id/name/updatedAt/deleted`，**没有 `mode`** → 历史项目选项为空。

### 2. 打开项目时 `state()` 为 undefined
前端：

```js
const state = () => doc?.ecommerce259;
async function open(value) {
  doc = value;
  mode = state().mode;      // ← value.ecommerce259 不存在时这里抛错
```

后端 `create` / `document` 返回的文档没有顶层 `ecommerce259`，
只有一个嵌套的 `payload.ecommerce259` → `state()` undefined → 读取 `.mode` 崩溃。

### 3. 保存项目会重复建项目
`/api/ecommerce/save` 由 `commerce.py` 的 `ecom_save` 处理，它只读 `body.id`，
而前端传的是 `canvasId` → 每次保存都新建一条 `kind=ecommerce` 项目；
同时 `compat` 用 `kind=ecommerce259`，两套 kind 互不可见。

## 修法
| 位置 | 改动 |
|---|---|
| `compat.list_docs` | 返回 `projects`（兼容 `documents`），每条带 `mode`；同时读 `ecommerce259` 与 `ecommerce` 两种 kind |
| 新增 `compat.document` | 前端 `document?id=` 之前是 404；现在返回带顶层 `ecommerce259` 的文档 |
| `compat.create` | 写入 `mode`，返回顶层 `ecommerce259.mode/form` |
| `compat.save` / `commerce.ecom_save` | 接受 `canvasId`，按 id 更新，不再新建；保留 `mode` 与 `ecommerce259` |
| `commerce.ecom_list` | 根列表同时包含两种 kind |

## 点击审计（真实浏览器，临时数据副本）
`tools/ui_ecommerce_audit.js`：

```
[OK] 页面载入
[OK] 历史项目可见        options=6
[OK] 历史项目可打开      我的电商主图
[OK] 切到视频创作
[OK] 切到图片创作
[OK] 新建项目
[OK] 保存并刷新
[OK] 无 mode 报错
errors: []
```

同时锁了回归测试 `tests/test_compat.py`：
`list.projects[].mode`、`document.ecommerce259.mode`、保存不丢 mode。

## 全量门禁
```
单元测试 PASS       规则 R1-R5 PASS      首页 28 项 PASS
前端契约 PASS       旧路由覆盖 PASS      300 路由实盘 PASS
启动门控 PASS       8 域通道巡检 PASS     18 页点击审计 PASS
登录→视觉链路 PASS  总计 10 项，失败 0 项，9.5 分钟
```

## 边界
- 生成类动作仍依赖上游模型/余额；这次修的是**进入板块、项目列表、打开、新建、保存、刷新**整条本地链路。
- 旧项目 `kind=ecommerce259` 与新 `kind=ecommerce` 都可读；新建统一写 `ecommerce259`。
