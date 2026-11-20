# 「点生成参考图 → 资产全清空」修复报告（2026-11-20）

## 现象
步骤 02 显示 人物 3 / 场景 2 / 物品 7；点「生成参考图」后立刻变成
**人物 0 / 场景 0 / 物品 0**，页面提示“暂无人物，可点击 + 自定义人物”。

## 根因：设置保存**整块覆盖**，把 assets 抹掉了

前端在开始生成前会保存一次外观/线路设置（只带样式字段，不带 `assets`）：

```json
POST /api/visual/settings
{"projectId":"…","settings":{"visualStyle":"live_action","imageResolution":"2K"}}
```

服务端 `VisualService.save_settings` 当时的实现是：

```python
if "settings" in payload:
    fields["settings"] = payload["settings"]     # ← 整块替换
```

于是数据库里的 `settings.assets`（刚提取的人物/场景/物品）被替换成“没有这个键”，
下一次渲染就是 0 个。**不是生成失败清了数据，是保存设置时先清掉了**——
这也解释了为什么“回到步骤 01 重来仍循环失败”：每次点生成都会再保存一次设置。

## 修法（两层防御，均不改前端）

| 位置 | 改动 |
|---|---|
| `VisualService.save_settings` | 新 settings **缺 `assets`** 时，从当前项目继承原 assets |
| `VisualStore.update` | 任何 settings 写入，缺 `assets` 就从库里的旧记录继承 |

判定规则：只有**显式带了 `assets`**（哪怕是空列表）才认为要覆盖；
“没带这个键”一律视为“只改外观”，保留资产。

## 验收（`tools/audit_assets_wipe.py`，不产生真实出图费用）

```
[*] 端口 59268
[OK] 读取时补 id            ids=['people-1','people-2','people-3']
[OK] 保存设置后资产不丢      status=200 n=3
[dbg] raw rows: [(None,'林晚'),(None,'陈默'),(None,'快递员')]
[OK] 生成不再 invalid_input  status=200
[OK] 提交后资产仍为 3        n=3
合计 4 步，失败 0
```

脚本把图像模型 key 清空，只验证“设置不丢资产 + 提交不再 400”，避免重复产生费用。

## 回归

- 新增 `tests/test_settings_keep_assets.py`（3 条）：
  保存外观设置保留资产 / store.update 保留资产 / 显式传空 assets 仍可清空
- 346 tests OK；规则 PASS；首页 28 项 0 异常

## 你现在需要做的

1. **重启软件**（当前进程是旧代码）
2. 你那个项目的资产**已经被写空**了，数据无法凭空恢复：
   在步骤 01/02 重新点一次「资产提取」即可（这一步本来就会重新识别）
3. 之后无论怎么改外观设置、点生成参考图，资产都不会再被清掉

## 诚实边界

- 这是数据被覆盖的问题，**已丢失的资产不在备份里就找不回来**，需要重新提取一次。
- 若重新提取后又出现清零，请把 `data/visual.db` 里该项目的 `settings` 发我，
  那说明还有第三条写入路径没堵住。
