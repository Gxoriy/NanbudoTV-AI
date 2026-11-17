# 视觉"分镜/剧集/成片"段落实刻记录（2026-11-17）

## 1. 本轮补齐的 22 条（原全部 501）

| 路由 | 实现 | 依赖 |
|---|---|---|
| `project/source`（+`/save`） | 项目源素材（文本+文件）读写 | 无 |
| `project/prepare` | LLM 归一 + 分镜规划，结果留档 | LLM |
| `project/scenes` | LLM 规划分镜并落库（覆盖旧结果） | LLM |
| `cut-storyboard`、`episode-cut`、`script-storyboard` | 同一实现：剧本转分镜 | LLM |
| `assets/analyze` | cv2 读像素：尺寸/朝向/亮度/对比度/主色 | opencv |
| `assets/delete` | 删记录 + 删文件（支持批量） | 无 |
| `episode/settings`、`episode/state` | 剧集设置与聚合状态（场景数、素材统计） | 无 |
| `episode/prompt` | 单镜提示词（短输出，契合当前渠道） | LLM |
| `episode/references` | 参考图列表读写 | 无 |
| `episode/video/reset` | 只清该项目生成的视频 | 无 |
| `video-preview`、`download` | 成片预览/下载（优先视频，其次源文件） | 无 |
| `archive` | 归档标记 | 无 |
| `marketing/analyze`、`marketing/generate` | 受众/卖点分析与营销文案 | LLM |
| `breakdown/motion`（+cancel/install/runtime） | 首帧图 → base64 → 远端图生视频任务 | 视频模型 |
| `breakdown/reference-workflow` | 六阶段状态机（source→finalize） | 无 |
| `link/cover`、`link/stream` | 封面转发（绕防盗链）、Range 透传代理 | Playwright |

## 2. 关键设计

### 1) 三个"剧本转分镜"入口共用一个实现

旧版 `cut-storyboard`、`episode-cut`、`script-storyboard` 是三条路由，语义都是
"一段文本 → 分镜列表"。这里收成一个 `_storyboard()`，只是默认镜头数不同。
**好处**：分镜质量改进只需改一处，不会出现三个入口行为不一致。

### 2) 动效不再需要 torch

旧版 `motion*` 依赖本地视频模型（数 GB 权重）。现在改成：
首帧图 → `data:image/png;base64,...` → 远端 `seedance` 图生视频。
`motion-runtime` 如实报告 `mode: remote` 与模型名，`motion-install` 明确
"远端引擎无需本地安装"。取消语义也说清：**只取消本地等待，上游可能仍会跑完**。

### 3) 素材分析不靠模型

`assets/analyze` 用 cv2 直接读像素：尺寸、朝向、亮度均值、对比度（std/128）、
主色（32 级量化取前三）。这是确定性的本地计算，比调多模态模型更快也更稳。

### 4) 封面与流媒体走不同策略

- `link/cover`：浏览器解析出 `og:image` 后由后端下载转发（带 Referer），绕开防盗链
- `link/stream`：**Range 透传**，前端拖进度条不会整段重下（`Content-Range` 原样回传）

## 3. 真机验证

```
[*] 项目 023cc99a
[*] 源素材 200 hasSource=True
[*] 分镜 200 耗时=13s count=2
    首镜: 安静的大学图书馆靠窗角落，窗外正下着小雨……两位大学生面对面坐在木质长桌旁
[*] 营销文案 200 耗时=7s title=316不锈钢保温杯｜12小时长效锁温，冬天就靠它了！
[*] 素材分析 200 640x360 landscape 首色={'hex': '#C02020', 'ratio': 1.0}
[*] 剧集状态 200 scenes=2 assets={'total': 0, 'images': 0, 'videos': 0}
[*] 归档 200 archived=True
```

## 4. 语义变化（前端要注意）

| 路由 | 之前 | 现在 |
|---|---|---|
| 分镜类 | 501 `model_required` | 200（LLM 未配置时 503；缺素材 400） |
| `assets/analyze` | 501 | 200（非图片 400；缺 opencv 501 `unsupported`） |
| `marketing/*` | 501 | 200；LLM 未配置 503 |
| `motion*` | 501 | 200 提交任务 + `/api/tasks/<id>` 轮询 |

## 5. 仍保留的显式 501（共 1 处）

- `/api/update/{download,install,reveal}`：本地重建版不做在线更新（`501 unsupported`）

其余 10 条 macro 路由共用 `macro_save`（真实状态写入），不是兜底。
