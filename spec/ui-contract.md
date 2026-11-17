# UI 点击契约修复（2026-11-17）

## 1. 为什么要做点击审计

覆盖率、首页门禁都只能证明"接口在"，不能证明"按钮能用"。
这一轮先用 Playwright 打开 **18 个页面**、逐个点可见按钮，记录每次点击触发的
`/api/` 请求状态与控制台错误。

工具：`tools/ui_click_audit.js` + `.local/deploy/run_click_audit.py`

```
=== /index.html      点击 20 个 失败 0 ===
=== /ecommerce259.html 点击 12 个 失败 0 ===
...（18 个页面，共 99 次点击）
合计失败点 0
```

## 2. 本轮修掉的 10 个"点了就报错"的接口

| 接口 | 之前 | 原因 |
|---|---|---|
| `POST /api/ecommerce/create` | 501 not_migrated | 前端是 `fetch('/api/ecommerce/'+action)`，25 个动作全没注册 |
| `GET /api/ecommerce/list?includeDeleted=1` | 404 | 同上；且动作名把 query 也算进去了 |
| `GET /api/ecommerce/preferences?media=image` | 404 | 同上 |
| `POST /api/ecommerce/{quote,analyze-quote,batch/quote}` | 501 | 现在统一返回 0 积分（对外免费） |
| `POST /api/breakdown/{upload,reference,analyze,generate,observe}` | 501 | 爆款拆解整条链路缺失 |
| `POST /api/visual/macro/submit` | 501 | 只注册了 `/macro/media/submit`，前端用的是 `/macro/submit` |
| `POST /api/voices/import` | 501 | 音色"保存为我的音色"缺失 |
| `GET /api/novel-projects250` | 501 | 只注册了带斜杠的前缀，前端基址不带斜杠 |
| `GET /api/{novel-screenplay,breakdown,prompt-reverse,script-alignment}/quote` | 501 | 报价只注册了 POST，前端用 GET |

## 3. 三个根因（都会导致"接口在、按钮坏"）

1. **exact 前缀吞掉动态动作**
   为避免 `/api/ecommerce/` 吞掉子路由，之前把它注册成 `exact=True`；结果前端
   `fetch('/api/ecommerce/'+action)` 的 25 个动作全部落到兜底 501。
   现在改成**动作分派器**（`app/api/compat.py`）：`ACTION_TABLE` 登记动作，
   未登记的动作返回 404 并列出可用动作名。

2. **methods 只写了 GET**
   分派器第一天只注册 `methods=("GET",)`，而 `create/save/delete` 都是 POST，
   请求直接被路由的方法过滤掉——现象和"没实现"一模一样。
   现在分派器放开 `GET/POST/PUT/DELETE/PATCH`；四个 `quote` 也都改成 GET+POST。

3. **path 里带 query 导致动作名匹配失败**
   内核把完整 path（含 `?includeDeleted=1`）传给 handler，切出来的动作名变成
   `list?includeDeleted=1`。现在先 `split("?")[0]` 再匹配。

## 4. 顺带纠正的三处语义

| 行为 | 之前 | 现在 |
|---|---|---|
| 电商删除 | 直接删库 | **软删除** + `deletedAt`，`list?includeDeleted=1` 可查回收站 |
| 批次启动 | 没有批次也先报"模型未配置" | 先 400（没有批次），再检查模型/队列 |
| `/api/ecommerce/` 根路径 | 404 | 列表（首页会拉它） |

## 5. 新增测试（`tests/test_compat.py`、`tests/test_ui_contracts.py`）

覆盖：创建→列表→保存、软删除→恢复、批次生命周期、报价恒 0、
未知动作 404 且带可用动作名、拆解上传/参考图/分析/查询、音色导入、
小说项目列表、宏提交返回 `taskId`。

## 6. 还没被点击覆盖的部分

审计只点"首屏可见按钮"。这些需要前置状态，暂未自动化：

- 视觉页：先建项目 → 填原稿 → 资产提取（需要 LLM，耗时长）
- 拆解页：先上传视频 → 分析 → 生成
- 宏排卡：需要先有报价与确认
- 电商：批次上传与批量生成（依赖真实图片）

下一步会把审计脚本升级成"带前置状态的场景脚本"，而不是逐页点按钮。
