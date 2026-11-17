# 原包架构（从 PYZ 的 core.* 模块提取）

## 0. 用什么工具、为什么不用 IDA

原包是 **PyInstaller 打包的 CPython 3.12 应用**（`PYZ\0` + 魔数 `0x0DCB`），
业务逻辑不是原生机器码，而是 PYZ 归档里的 `.pyc`。这种情况下反汇编器（IDA/Ghidra）
只能看到解释器循环，**拿不到任何业务线索**；正确路径是解包 + `marshal`。

使用的都是合法开源/免费工具与标准库：

| 步骤 | 工具 |
|---|---|
| 解 CArchive | `pyinstxtractor`（或自写 TOC 解析） |
| 读 PYZ 目录 | 标准库 `struct` + `marshal` + `zlib`（`tools/pyz_inspect.py`） |
| 提取模块常量 | 标准库 `marshal` + `dis`（`tools/pyz_core_dump.py`） |
| 需要反编译时 | `pycdc` / `decompyle3`（开源）；原生壳部分才需要 IDA Free / Ghidra |

> 明确一点：**不使用、也不寻找破解版 IDA**。这类包既违反许可，又常被植入后门，
> 而对这个目标它连"能用"都算不上——真正的信息在 Python 层。

## 1. 提取结果概览

| 指标 | 数量 |
|---|---|
| `core.*` 业务模块 | **220** |
| 单模块入口 `app.pyc` 代码对象 | 718（顶层 227 个函数/类） |
| 字符串常量线索 | 约 740 KB（含 107 条 LLM 提示词） |
| SQL 片段 | 45（含 `projects`/`assets`/`aliases`/`versions` 建表与相似度检索） |
| 路由常量 | 262（与 `spec/route-spec.json` 完全一致，0 缺口） |

明细：`spec/extracted/core-clues.json`（本机生成，已 gitignore）。
重跑：`python tools/pyz_inspect.py && python tools/pyz_core_dump.py`。

来源：`spec/extracted/PYZ.pyz.pyz`，共 220 个业务模块；本节由 `tools/pyz_core_dump.py` 生成。

| 模块 | 函数 | 类 | 字符串 | SQL |
|---|---|---|---|---|
| `core.pipeline` | 59 | 0 | 478 | 0 |
| `core.prompt_builder` | 30 | 0 | 472 | 0 |
| `core.visual_pipeline` | 87 | 6 | 388 | 0 |
| `core.macro_arrangement_workflow` | 55 | 2 | 306 | 0 |
| `core.shot_first_planning` | 35 | 1 | 305 | 0 |
| `core.ecommerce259` | 43 | 1 | 298 | 0 |
| `core.script_workflow` | 18 | 0 | 255 | 0 |
| `core.video_canvas` | 35 | 1 | 252 | 0 |
| `core.local_storage_text227` | 14 | 0 | 250 | 0 |
| `core.ecommerce_image_workbench` | 46 | 1 | 206 | 0 |
| `core.macro_script_planning` | 35 | 0 | 206 | 0 |
| `core.model_client` | 41 | 2 | 206 | 0 |
| `core.rewrite_workflow` | 19 | 0 | 196 | 0 |
| `core.macro_media_workflow` | 30 | 4 | 192 | 0 |
| `core.director_skill_comparison` | 34 | 2 | 184 | 0 |
| `core.asset_library228` | 38 | 1 | 183 | 36 |
| `core.macro_task_pipeline` | 31 | 0 | 180 | 0 |
| `core.mobile_voice` | 31 | 3 | 172 | 0 |
| `core.subtitle_removal242` | 39 | 1 | 172 | 0 |
| `core.episode_cut_workflow` | 28 | 0 | 171 | 0 |
| `core.breakdown` | 28 | 1 | 166 | 0 |
| `core.long_rewrite` | 14 | 0 | 164 | 0 |
| `core.prompt_reverse` | 14 | 1 | 160 | 0 |
| `core.storyboard_first_workflow` | 11 | 0 | 160 | 0 |
| `core.script_asset_skill` | 32 | 0 | 156 | 0 |
| `core.original_recommend` | 16 | 0 | 155 | 0 |
| `core.original_script` | 12 | 0 | 154 | 0 |
| `core.macro_card_revision` | 17 | 0 | 147 | 0 |
| `core.ecommerce_batch260` | 31 | 1 | 146 | 0 |
| `core.story_workflow` | 24 | 1 | 143 | 9 |
| `core.source_timeline` | 17 | 0 | 140 | 0 |
| `core.macro_locked_cards` | 17 | 0 | 137 | 0 |
| `core.canvas_assistant254` | 24 | 1 | 130 | 0 |
| `core.local_storage_media227` | 21 | 0 | 127 | 0 |
| `core.voice_video_workflow` | 17 | 1 | 126 | 0 |
| `core.cut_planning` | 13 | 0 | 125 | 0 |
| `core.parallel_shots209` | 29 | 0 | 124 | 0 |
| `core.director_regeneration` | 21 | 0 | 123 | 0 |
| `core.director_skill_adoption` | 13 | 0 | 121 | 0 |
| `core.macro_media_adapter` | 6 | 0 | 121 | 0 |
| `core.ecommerce_image_workbench_help` | 22 | 1 | 120 | 0 |
| `core.writing_auxiliary220` | 17 | 1 | 119 | 0 |
| `core.store_visit` | 10 | 0 | 118 | 0 |
| `core.macro_segment_arrangement` | 19 | 0 | 117 | 0 |
| `core.visual_styles` | 2 | 0 | 114 | 0 |
| `core.validator` | 18 | 1 | 108 | 0 |
| `core.asset_batch_resume222` | 20 | 0 | 107 | 0 |
| `core.license_client` | 34 | 4 | 106 | 0 |
| `core.asset_library_api228` | 21 | 2 | 103 | 0 |
| `core.platform_media` | 12 | 1 | 101 | 0 |
| `core.cut_timing_arithmetic` | 10 | 0 | 100 | 0 |
| `core.tail_frame237` | 14 | 0 | 100 | 0 |
| `core.asset_matching228` | 21 | 0 | 99 | 0 |
| `core.story_scene_planner198` | 15 | 0 | 97 | 0 |
| `core.storyboard_card_plan` | 6 | 0 | 95 | 0 |
| `core.shot_status223` | 15 | 0 | 86 | 0 |
| `core.cut_timing_evidence` | 7 | 0 | 83 | 0 |
| `core.storyboard_direction` | 5 | 1 | 83 | 0 |
| `core.breakdown_audio259` | 14 | 1 | 82 | 0 |
| `core.card_arrangement_skill` | 13 | 0 | 80 | 0 |
