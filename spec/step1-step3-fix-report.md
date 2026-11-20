# 步骤 03「补齐分镜」原稿为空 + 步骤 01「提取大纲」无响应（2026-11-20）

## 一、「提取大纲」点了没反应

前端 `identifySceneDirectory()`：

```js
const submitted = await post('/api/visual/project/scenes', {projectId, regenerate:true, view:'workspace'});
```

我们的 handler 只回 `{scenes, count, fingerprint}`：

- 没有 `project` → 前端无法刷新项目
- 没有写 `workflowPreparedScript.sceneDirectory` → 分场目录永远是空的

所以请求 200 了，界面一点变化都没有，看起来就是“无响应”。

**修法**：`project_scenes` 生成后调用 `_publish_directory()`，把
`sceneDirectory / cleanedSource / originalSourceHash` 写进项目 settings；
响应补 `project`、`directoryReady`、`sceneCount`（缓存命中分支同样补）。

## 二、「补齐分镜」报「原稿为空」

两个原因叠加：

1. `/api/visual/macro/state` 把快照塞在 `state` 字段里返回：

   ```json
   {"ok":true,"projectId":"…","state":{…}}
   ```

   但前端 `loadFresh()` 是把**整个响应**当快照：

   ```js
   incoming = await api('/api/visual/macro/state?projectId=…');
   if (incoming.projectId !== projectId) throw …
   view.snapshot = incoming;
   ```
   于是 `incoming.source / incoming.currentSource / incoming.scenes` 全是 `undefined`
   → 控制器 `draft.source` 为空 → 点补齐分镜抛「原稿为空」。

2. 即使快照对了，报价也过不了：`/api/visual/macro/quote` 只回 `{estimatedPoints:0} `，
   前端要求 `quoteId / maxCalls / totalCredits>0 / expiresAt`；
   `/api/visual/macro/submit` 建了任务却**既不启动也不返回 taskId**（函数没有 return）。

**修法**：
- `macro_state` 返回**顶层快照**：`source / currentSource / scenes`（每场带 `source`），
  目录与已保存卡按 id 合并（`state` 键保留兼容）
- `macro_quote` 发放可核验凭据（`quoteId/action/maxCalls/totalCredits/expiresAt`）
- `macro_submit` 校验凭据 → 起后台任务 → 按句补齐分镜卡写回 macro 快照 → 返回 `{taskId}`
- 前端轮询 `/api/tasks/<id>` 完成后重读快照即可看到卡片

## 三、验收（真机，`tools/audit_step1_step3.py`）

```
[OK] 提取大纲返回 project      status=200
[OK] 分场目录已写入            scenes=3
[OK] 宏快照顶层有原稿          source=83字
[OK] 宏快照每场有正文          scenes=3
[OK] 宏报价给凭据             quoteId=f7f8b0b2
[OK] 宏提交返回任务            status=200
[OK] 补齐分镜任务完成          state=done result={'scenes':3,'cards':6}
[OK] 快照已有分镜卡            cards=6
合计 8 步，失败 0
```

浏览器（`tools/ui_outline.js`，真实点击「提取大纲」）：

```
[OK] 准备项目
[OK] 项目中心 iframe
[OK] 点击后有大纲反馈   btn={"disabled":false,"text":"提取大纲","visible":true}
                       hint=大纲提取已完成 · 共 2 集／场，结果已保存
[OK] 调用了大纲接口     [200]
失败步数: 0
```

## 四、回归

348 tests OK；规则 PASS；首页 28 项 0 异常；前端契约缺口 0。

## 五、诚实边界

- 「补齐分镜」的卡片是**按句本地切分**（免费、稳定），不是模型生成的分镜描述；
  真正的导演式拆分仍需接 LLM（当前先把全链路跑通）。
- 步骤 01 的分场目录按「第 N 场/集/章」标题切分；没有标题则整段一场。
- 提取大纲仍会调用一次 LLM 生成分镜 shots（这一步是原有实现，未改动语义）。
