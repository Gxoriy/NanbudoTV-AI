# 「参考图生成」invalid_input + not_found 修复报告（2026-11-20）

## 现象
- 步骤 02 已提取到 人物 3 / 场景 2 / 物品 7
- 点「生成参考图」→ 卡片变红「参考图生成失败 / 生成失败: invalid_input」
- 右下角同时弹 `! not_found`
- 换个项目重来，仍在同一处失败

## 根因（两条，互相独立）

### 1) 旧版本提取的资产**没有 id**
真实库 `data/visual.db` 里能看到两类项目并存：

```
project c8b22585 …  people:[{id:people-1,…}]     ← 新版提取
project 4bafabc9 …  people:[{id:None,name:林晚}] ← 旧版提取（无 id）
```

前端提交时会带 `assetId`，但旧资产没有 id：

- 服务端 `_asset_row(projectId, kind, assetId)` 按 id 找不到 → 兜底提示词也拿不到
  → 返回 **400 invalid_input（缺少素材名称或提示词）**
- 前端把错误写到卡片 `item.error`，就是你看到的「生成失败: invalid_input」

### 2) 旧资产不在素材库里 → `/api/visual/asset/prompt` 404
该接口只查 asset-library（`KIND_ASSET`），旧资产只存在于 `project.settings.assets`，
所以 `_doc_or_404` 直接 404 → 右下角 `not_found` 红条。

## 修法（全部服务端，未改前端 JS）

| 位置 | 改动 |
|---|---|
| `domain/visual/store.py::_asset_buckets` | 读取项目 settings 时**补 `id`/`kind`**（不改数据库，只补返回值），旧资产立刻有 `people-1` 这样稳定的 id |
| `app/api/visual_extra.py::_asset_row` | id 找不到时按名称匹配；仍找不到则退回该类型第一条（空 id 场景），不再 400 |
| `_start_generation` | `assetId` 兼容 `assetName`；空提示词用「资产名+画型+项目画风」兜底 |
| `app/api/visual_tail.py::asset_prompt` | 未知 assetId 返回 `200 {prompt:""}`，不再 404 |

## 验收（真实数据副本，只读复制 `data/*.db`）

```
[*] 使用项目 4bafabc9（legacy=yes，旧资产无 id）
[OK] 旧资产读取时补 id      n=3 ids=['people-1','people-2','people-3']
[OK] 未知资产提示词 200     status=200
[OK] 空 id/空 prompt 也能提交  status=200
[OK] 生成任务结束           state=done
[OK] 资产数量未变化         before=3 after=3
合计 5 步，失败 0
```

脚本：`tools/audit_legacy_assets.py`

## 回归

- 新增 `tests/test_legacy_assets.py`（2 条）：读取补 id 且不写回库、未知 assetId 提示词 200
- 343 tests OK；规则 PASS；首页 28 项 0 异常
- 端到端 14 步（`tools/audit_video_e2e.py`）仍全过

## 需要你做的一步

**重启软件**。当前进程跑的是旧代码；重启后：

1. 打开旧项目，资产卡片会拿到 `people-1` 这类 id
2. 点「生成参考图」应进入生成中 → 完成后卡片显示图片
3. 若仍失败，请把卡片上的错误码发我（现在是 `invalid_input` 以外的错误码就不会是这次的 bug）

## 诚实边界

- 本次验收在**真实数据的副本**上跑，并且真实调用图像模型出 1 张图（会产生正常费用）。
- 旧项目第一次重新生成会覆盖卡片状态；已有图片（`imageFile`）不会丢，历史记录保留最近 12 条。
