# 步骤 02 两处阻塞修复报告（2026-11-20）

## 一、「匹配本地资产」提示缺少凭证

前端流程（`visual_page.js::installLocalAssetMatch228`）：

```
GET  /api/asset-library/matches?projectId=...
     → 必须返回 { matchToken, totalAssets, matchedAssets, unmatchedAssets, targets }
POST /api/asset-library/inherit {projectId, matchToken, selections}
```

我们只注册了 asset-library 的 list/add/delete/media/upload，**matches 与 inherit 根本没实现**，
`data.matchToken` 为 undefined → 前端主动抛「匹配结果缺少确认凭据」。

### 修法
新增 `app/api/asset_library.py`（拆出 visual_extra，兼顾 R1 800 行门禁）：

- `GET /api/asset-library/matches`：按「类型 + 名称」把项目资产与本机素材库对上，
  返回 `matchToken`（一次性令牌）与 `targets`；`libraryStatus` 给空闲状态
- `POST /api/asset-library/inherit`：校验 token 与项目归属，把命中库图片写入
  项目资产的 `imageFile/status=done/inherited=true`
- token 过期或服务重启时重新计算一次并继续，不阻断操作

## 二、「下一步：分镜」点不动

`#useSource` → `openMacroArrangement()`：

```js
if (!await prepareVisualScript()) return;                 // ① 这里静默返回
if (needsAIDirectory()) { setWorkflowStage(1); return … } // ② 这里跳回步骤 01
```

两个条件都不满足：

1. `prepareVisualScript` POST `/api/visual/project/prepare`，随后 `data.project?.id` 比对；
   我们的 prepare 只回 `{prepared, stages, summary}`，**没有 project** → 返回 false
2. 即使拿到 project，`needsAIDirectory()` 读 `project.workflowPreparedScript.sceneDirectory`；
   DTO 没有暴露这个字段，且 prepare 也没有生成目录 → 真值 → 跳回步骤 01

### 修法
- `project_prepare` 本地分场（按「第 N 场/集/章」切，无标记则整段一场），写入
  `settings.workflowPreparedScript.{cleanedSource,sceneDirectory,originalSourceHash}`
- prepare 响应补 `project` 与 `preparationWarning`
- DTO 暴露 `workflowPreparedScript` / `scriptGenerationId`
- `confirmed=true` 且同源已有目录时走快速路径（不再等一次 LLM，点下一步即时响应）

## 三、验收（`tools/audit_step2.py`，真机）

```
[*] 端口 60536
[OK] 匹配接口 200 且有凭证   token=ClQWYECC total=2 matched=0
[OK] 继承接口 200            inherited=0
[OK] prepare 返回 project     status=200
[OK] 分场目录非空             scenes=2 titles=['第一场 图书馆 日 内','第二场 图书馆 夜 内']
合计 4 步，失败 0
```

注：`matched=0` 是因为临时数据里素材库为空；有历史图片的项目会按名称命中。

## 四、回归

- 346 tests OK；规则 PASS（visual_extra 726 行 / asset_library 125 行）；首页 28 项 0 异常

## 五、诚实边界

- 分场目前是**本地规则切分**（按「第 N 场」标题），不是模型生成的场次摘要；
  步骤 01 的「提取大纲」仍会走模型给出更细的分场。
- 素材匹配按名称精确/包含匹配；跨语言别名（“林晚” vs “Lin Wan”）不会命中。
