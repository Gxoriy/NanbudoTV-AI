# 与原包对齐的三件事（2026-11-17）

来源：`spec/extracted/core-clues.json`（PYZ 里 220 个 `core.*` 模块提取的字符串/SQL/提示词）。
三步都已落地并有测试与真机验证。

## 1. 提示词移植

| 项 | 内容 |
|---|---|
| 导出工具 | `tools/export_prompts.py` → `domain/prompts_original.py`（逐字保留，单条截断 800 字） |
| 用途桶 | `storyboard`(3) / `normalize`(3) / `rewrite`(3) / `marketing`(3) / `image_prompt`(3) / `hooks`(2) |
| 组装 | `domain/prompts.compose(bucket, role, task, output)` → 角色 + 任务 + 【原版规则摘录】 + 输出约束 |
| 接入点 | 分镜规划（`visual/plan`、`project/prepare`、`project/scenes`、三入口 storyboard）、单镜提示词、营销分析/文案、成稿生成 |

**为什么不是整段替换**：原包那 107 条是**流水线片段**，有的从句子中间被切开（例如
"秒，内容讲清楚即可…"），直接当 system prompt 会缺主语。所以保留我们的角色/任务描述，
把原版规则作为"规则摘录"追加——语义完整、又继承原版的约束密度。

测试：`tests/test_prompts.py`（桶非空、拼接顺序、截断、未知桶降级）。

## 2. 素材库 schema（四表 + 相似度）

`domain/visual/assets.py` 对齐 `core.asset_library228`：

```sql
projects(id, name, style, deleted, created_at, updated_at)
assets(id, project_id, name, kind, file, meta, deleted, created_at, updated_at)
aliases(asset_id, name)              -- UNIQUE(asset_id, name)
versions(id, asset_id, file, note, deleted, created_at)
```

检索打分（与原包同思路）：

| 命中方式 | 分 |
|---|---|
| 名称完全相等 | 3 |
| 名称前缀匹配 | 2 |
| 名称包含 | 1 |
| 别名同规则 | 同名同权 |

`ORDER BY similarity DESC, updated_at DESC`，支持 `projectId`/`kind` 过滤。
`/api/asset-library/?q=` 现在返回带 `similarity` 的结果（真机：`林晚`=3、`林晚定妆照`=2、`小晚`（别名）=3）。

**分工**：素材走四表；画布/样式/角色/剧集设置仍用单表 `docs`（`LibraryStore`），
两者互不影响，避免一次性重构把已跑通的画布链路带崩。

## 3. 多阶段流水线

`/api/visual/project/prepare` 拆成三阶段，返回 `stages`（含耗时）与 `summary`：

| 阶段 | 做什么 | 失败语义 |
|---|---|---|
| `normalize` | 需求归一（题材/人物/冲突） | 阶段记 `ok:false`，整体 502 并带 `stages` |
| `storyboard` | 逐镜规划（短请求，规避长输出断连） | 同上 |
| `assemble` | 汇总镜头数、总时长（纯本地，0ms） | 不会失败 |

真机（`deepseek-v4-pro`，2 镜）：

```
[*] 准备 200 耗时=46s stages=['normalize', 'storyboard', 'assemble']
    耗时明细=[8380, 37622, 0] summary={'count': 2, 'totalSeconds': 9.0}
```

一次 502 的实测也保留了：`stages=['normalize','storyboard']`、`storyboard` 标红——
上游渠道对长输出会断连，前端能据此只重试失败那一段，而不是整轮重来。

## 4. 与 `core.pipeline` 的差距（下一步）

原包 `core.pipeline` 有 59 个函数、478 条字符串，我们目前只对齐了 3 个阶段。
可继续拆的（按收益）：

1. `shot_first_planning`：先出"整场镜头表"再逐镜细化（我们现在是逐镜直接生成）
2. `visual_continuity`：跨镜人物关系/空间调度校验（防换人、防左右反转）
3. `tail_capability`：尾帧承接（上一条视频最后一帧作为下一条首帧）
4. `video_prompt_limits`：按模型时长上限自动切段
