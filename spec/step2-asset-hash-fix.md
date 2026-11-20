# 步骤 02「已出参考图仍提示请先识别」修复报告（2026-11-20）

## 现象
人物 3 / 场景 2 / 物品 7 都有参考图（卡片显示“参考图已就绪”），
点「下一步：分镜」仍弹「请先识别当前剧本的人物、场景和物品。」；
「匹配本地资产」弹窗显示 **12 总资产 / 0 推荐 / 12 已有图片**。

## 根因两个，分别对应两张截图

### 1) 守卫字段是后来才加的，旧项目没有

`openCutModeDialog()`：

```js
if (!state.project.workflowAssetSourceHash)
  return toast("请先识别当前剧本的人物、场景和物品。", true);
```

`workflowAssetSourceHash` 是上一轮才写进提取流程的。你这个项目的资产是**更早**提取的，
settings 里没有这个键 → 读出来是空 → 永远过不了守卫。**和有没有参考图无关**。

### 2) 保存设置会整块替换，把正文也抹掉

`POST /api/visual/settings` 原来是 `settings = payload.settings` 全量替换。
前端保存外观/线路时只带部分字段，于是 `confirmedScript` 被清空；
即使做 hash 自愈，也拿不到正文可算 → 自愈失效。

## 修法

| 位置 | 改动 |
|---|---|
| `VisualService.project()` | **读取时自愈**：已有资产但缺 hash，就用 `confirmedScript/sourceStructure` 补算 FNV-1a 并写回 |
| `VisualStore._to_dict` | 只读兜底：即使没落库，DTO 也返回算出的 hash |
| `VisualService.save_settings` | 缺 `assets/confirmedScript/sourceStructure/workflowPreparedScript/workflowAssetSourceHash` 时从当前值继承 |
| `VisualStore.update` | 同上（任何 settings 写入都继承这些键） |

## 验收

接口 `tools/audit_asset_hash.py`（模拟“已出图、无 hash”的旧项目）：

```
[OK] 旧项目补出 hash        hash=8ba98e79
[OK] 落库后可重复读取        people=2
[OK] 参考图未丢             files=['assets/a.png','assets/b.png']
[OK] 匹配弹窗识别全部资产    total=4 existing=4
合计 4 步，失败 0
```

浏览器 `tools/ui_next_stage.js`（真实点击）：

```
[OK] 准备已出图项目
[OK] 项目中心 iframe
[OK] 项目已打开            已打开项目：已出图项目
[OK] 没有"请先识别"拦截      []
[OK] 弹出切分设置
[OK] 无 JS 报错
失败步数: 0
```

## 关于「0 推荐 / 12 已有图片」

这是**正确行为**，不是识别失败：

- 12 个资产都已有参考图 → 状态 `existing`，默认「保留」，不会被覆盖
- 只有**没有图片**的资产才会进入「推荐」并默认勾选
- 「暂无候选」= 本机素材库里没有同名图片

## 回归

348 tests OK；规则 PASS；首页 28 项 0 异常。
新增用例 `test_legacy_project_gets_asset_hash`（旧项目读取即补 hash）。

## 你需要做的

**重启软件**，再打开那个项目点「下一步：分镜」。
如果仍被拦，说明该项目的 `settings.confirmedScript` 也是空的（正文从未保存进项目），
请把该项目 id 发我，我会按 `project_source` 文档回填一次。
