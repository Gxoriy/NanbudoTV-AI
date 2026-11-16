# 数据形态清点（P0-05）

数据根目录：`F:\WorkAPP\短剧改写工作台\data`

## 一级目录

- `asset-library`
- `models`
- `outputs`
- `session_results`
- `updates`
- `uploads`

## 目录树（深度 ≤3）

```
asset-library/
  asset-library/asset_library228.sqlite3  (90112B)
models/
outputs/
  outputs/我的下载/
  outputs/提示词反推/
  outputs/改写项目/
  outputs/数字人角色库/
    outputs/数字人角色库/配音结果/
  outputs/爆款拆解/
  outputs/电商图片工作台/
    outputs/电商图片工作台/任务/
    outputs/电商图片工作台/项目/
  outputs/视觉制作/
  outputs/视频画布/
session_results/
updates/
uploads/
  uploads/link_preview/
```

## SQLite 库

### `F:\WorkAPP\短剧改写工作台\data\asset-library\asset_library228.sqlite3`  journal=wal

| 表 | 行数 | 列 |
|---|---|---|
| aliases | 0 | asset_id, name |
| assets | 0 | id, project_id, source_id, kind, name, normalized_name, description, prompt, aliases, current_version, updated_at, deleted |
| project_match230 | 0 | project_id, story_key, story_fingerprint |
| projects | 0 | id, name, style, updated_at, deleted |
| sources | 0 | asset_id, path, fingerprint, version_id |
| version_match230 | 0 | version_id, search_text, visual_json |
| versions | 0 | id, asset_id, digest, number, path, thumbnail, created_at, width, height, metadata, deleted |

## 路径风险点

- 最长相对路径：`asset-library/asset_library228.sqlite3` (38 字符)
- 顶层目录含中文：否
- 结论：展示名直接落盘为目录名，迁移 `infra/store` 时必须做 hash 目录 + 展示名分离