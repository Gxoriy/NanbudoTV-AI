# 短剧工作流三处阻塞修复（2026-11-20）

## 1. 资产提取超时

现象：进度条停在 20%，提示“已等待约55秒，仍在等待模型响应”。

根因：`_analyze_script_assets` 直接同步等 LLM，而 provider 超时上限 180 秒；
上游卡住时任务会一直 running，前端只能干等。

修法：

- LLM 调用放进守护线程，`join(timeout=25)`；
- 25 秒内没结果就用 `stage_helpers.local_asset_guess()` 做保守本地识别
  （按「第 N 场」标题取场景、按 `名字：` 行取人物、按关键词取物品）；
- 任务结果增加 `source=llm|local-fallback` 与 `warning`，用户知道结果来源，可稍后重提。

## 2. 提取大纲返回过快、只读到标题

两个独立问题：

1. 前端 POST `{projectId, regenerate:true}`，后端缓存判断只看 `force`
   → 命中缓存直接返回，显得“没调用 AI”。**修复**：`regenerate` 等同 `force`。
2. 需求正文优先从 `prepare` 文档 / `project_source` 取，没优先读项目
   `settings.confirmedScript`；且 `_publish_directory()` 只用标题切段，
   把模型生成的镜头描述丢掉了。**修复**：正文优先 `confirmedScript`；
   `_publish_directory(..., scenes=scenes)` 把每个 shot 的
   `description/prompt/action/text` 写进对应场次的 `source/description/shot`。

## 3. 补齐分镜「描述词保存未返回有效版本」

前端 `saveCardDraft()` 校验：

```js
if (!response.draft || typeof response.draft.prompt !== 'string'
    || !Number.isInteger(response.draft.revision)) throw ...
```

我们原来把 `/api/visual/macro/card/draft` 交给通用 `macro_save`，只回 `{ok,state}`，
没有 `draft`。同理 `card/source` 需要 `{state, sourceEdit.revision}`。

修法：两条路由注册专用处理器（放在通用循环之前）：

- `card/draft` → `{ok, draft:{prompt,referenceAssetIds,revision}, state}`
- `card/source` → `{ok, state, sourceEdit:{sourceText,revision}}`

revision 从 macro 状态里的旧版本递增，写回 `cardDrafts` / `sourceEdits`。

## 4. R1 行数

`visual_stage.py` 超过 800 行，把 `tiny_hash / scene_directory / local_asset_guess`
拆到 `app/api/stage_helpers.py`（788 行 / 新模块 60 行）。

## 5. 验收

```
355 tests OK
代码规则 R1-R5 PASS
首页 28 项 PASS
前端契约缺口 0
verify_all.py --with-ui：10 项全 PASS（9.0 分钟）
  18 页点击审计 PASS（376.3s）
  登录→视觉链路 PASS（44.1s）
```

浏览器场景里有一条 400 控制台记录（探针式请求），不影响门禁 PASS。

## 6. 边界

- 本地识别是兜底，不是模型级抽取；结果里带 `source=local-fallback` 与提示。
- 《提取大纲》本身仍调用一次 LLM；`regenerate:true` 现在会强制重新调用，
  不再吃旧缓存。
