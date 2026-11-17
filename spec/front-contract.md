# 前端调用面 vs 内核路由表（2026-11-17）

## 1. 为什么要做这个检查

`spec/route-spec.json` 是从旧包字节码里恢复的 265 条路由，但**前端实际会调什么**只有
页面 JS 里才写得准：有的接口是模板拼出来的（`'/api/local-storage/' + 'settings'`），
有的路径在 spec 里根本没有（`/api/visual/asset/delete` 单数形式）。

工具：`tools/front_contract_check.py`（起内核 → 取 `/api/_routes` → 与页面 JS 里的
`/api/...` 字面量比对）。

## 2. 三个真缺口（已实现）

| 前端调用 | 之前 | 现在 |
|---|---|---|
| `POST /api/visual/asset/delete`（单数，`{projectId,kind,assetId}`） | 未注册 | ✅ 删文件+删记录，返回最新 `project` 供前端重渲染 |
| `POST /api/rewrite/generate` | 未注册 | ✅ 分段写稿 → 任务 → `{text, metaFile, scriptId}` |
| `POST /api/original/generate` | 未注册 | ✅ 同上（按主题创作） |

`marketing`、`original`、`local-storage` 三条是**正则伪路径**（来自
`/api/original/recommend`、`'/api/local-storage/' + 'settings'`），不是真缺口；
`/api/v1`、`/api/v3` 是模型渠道 baseUrl，也不是内核路由。

## 3. `/api/rewrite/generate` 的实现取舍

前端契约（`app.js` 4372 行）：**返回 `{taskId}`，随后轮询 `/api/tasks/<id>`**，
结果里要有 `metaFile`（用于归档到项目）。

两个关键点：

1. **分段生成**：该渠道一次输出长文本会 `RemoteDisconnected`，所以按
   `settings.segments`（默认 3，上限 6）逐段请求再拼接，每段约 200 字。
2. **落盘 + 建档**：正文写 `scripts/…txt`，并建 `rewrite_script` 文档记录，
   任务结果返回 `metaFile`/`scriptId`，前端可直接归档。

真机（`deepseek-v4-pro`，2 段）：

```
[*] 提交 200 task=… seg=2
[*] 任务 done 耗时=51s
[*] metaFile=scripts/0efba501….txt 段数=2
[*] 正文 252 字: 林晚盯着他看了两秒，忽然把剧本往帆布袋里一塞……
```

## 4. 顺带修掉的一个假象

`/api/_routes` 原来不返回 `exact` 字段，检查脚本把所有以 `/` 结尾的注册都当前缀，
于是 `/api/` 这条 **exact 路由**被误判为"吞掉一切"，检查结果显示 0 缺口。
现在 `index()` 带 `exact`，工具只把"非 exact 且以 / 结尾"当前缀——这才是真实匹配语义。
