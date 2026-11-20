# 「短剧项目中心」历史项目识别/打开修复报告（2026-11-20）

## 现象
项目中心的任务栏里，历史项目不显示名称与计数，点卡片也不能打开、不能进设置。

## 根因：列表与详情的字段名/计数全对不上

前端 `projectCard()` 与 `activateProject()` 读的是：

```
item.projectName          （不是 name）
item.peopleCount / sceneCount / propCount
item.cardCount / videoCount / imageCount
item.macroSceneCount
project.macroArrangement / project.scriptCuts
```

我们后端：

- `VisualStore._to_dict` 只有 `name`，没有 `projectName`、`macroArrangement`、`scriptCuts`
- `VisualService.projects()` 的 brief 只有 `{id,name,style,thumbnail,scenes,createdAt,updatedAt}`，
  **没有任何计数**

结果：卡片标题为空（渲染成 undefined/空）、计数为 0、`activateProject` 读不到
`macroArrangement` 等字段在渲染阶段抛错 → 看着像“识别不到、点不开”。

## 修法（服务端，未改前端）

| 位置 | 改动 |
|---|---|
| `VisualStore._to_dict` | 补 `projectName`（= name）、`macroArrangement`、`scriptCuts` |
| `VisualService.projects()` | brief 补 `projectName`、`peopleCount/sceneCount/propCount`、`cardCount/episodeCount`、`videoCount/imageCount`、`macroSceneCount` |

计数口径：人物/场景/物品 = `settings.assets` 各分组长度；视频卡 = `macroArrangement.cards`；
已生成视频 = 卡片 `status=done`；参考图 = 资产里已有 `imageFile` 的条数。

## 验收（`tools/ui_project_center.js`，真浏览器）

```
[OK] 项目中心 iframe
[OK] 历史项目可见        cards=2
[OK] 卡片显示项目名       …历史项目A… 0张视频卡 · 2人 · 1景 · 1物
[OK] 点击卡片能打开       已打开项目：历史项目A
[OK] 无 JS 报错
失败步数: 0
```

说明：卡片上真正的入口是按钮 `.open-visual-project`（“继续制作”），
第一版脚本点的是卡片本体所以没反应；修正点击目标后跳转正常。

## 设置入口

“编辑设置”走 `editProject()` → 向导 → `/api/visual/settings`（`projectName` 分支），
该分支本次也补了回归用例 `test_rename_via_settings`，改名后列表刷新可见。

## 回归

347 tests OK；规则 PASS；首页 28 项 0 异常。

## 诚实边界

- 历史项目如果**从未生成过参考图/视频卡**，卡片会显示“等待生成参考图”，这是真实状态，
  不是识别失败。
- 缩略图仍可能显示“暂无预览图”——项目没有封面时本来就没有图，除非在项目中心点“一键生成海报”。
