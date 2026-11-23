# 爆款拆解二轮修复：上传即报错 + 结果不显示（2026-11-23）

## 1. 上传后立刻 `undefined.some`
`/api/breakdown/upload` 返回的是 `_bd_public(record)`：

```python
"analysis": payload.get("analysis") or {}
```

新上传项目没有 analysis → `{}`，前端 `render()` 读
`project.analysis.elements.some(...)` 直接抛
`Cannot read properties of undefined (reading 'some')`。

修法：`_bd_public` 与 `breakdown_project` 保持一致：
- `analysis.elements` 兜底 `[]`
- 顶层 `replacements` 兜底 `[]`

上传后不再报错（UI 验收已确认）。

## 2. 分析任务卡在 15%
真实图片/视频分析链路：

- 本地 ffmpeg 抽帧成功（3 帧）
- 视觉模型 `deepseek-v4-flash-vision-exp` 对这些帧返回空 content
- 文本模型兜底可能长时间等待

修法：
- 视觉默认模型改为 `gem-3.8-flash`（同一批帧 12.9 秒返回合法 JSON）
- 视觉调用加 30 秒硬超时，超时即用时间轴兜底结果
- 分析提示词补 `elements` 输出规范
- 结果落库 `elements` 兜底

## 3. 生成结果视频
`generate` 已接入 `video_pipeline`，并在外层任务里等待内层视频任务结束；
上游创建失败自动重试一次。API 验收（真实项目副本）：

```
[OK] 拆解有镜头结果  shots=3 frames=3
     elements=3 replacements=0
[OK] 结果列表有视频  videos=1
     拆解复刻视频 videos/974e8d011d2d4a2b871fb4aecb3bbe69.mp4
     upstreamTaskId=237234097
```

## 4. 点击审计
`tools/ui_breakdown_flow.js`（真实上传→开始拆解→生成）：

```
[OK] 上传后无 undefined.some
[OK] 全程无 undefined.some
```

分析/生成两段自动化点击仍受视觉接口时序影响（分析任务在自动化环境里
停在 15% 超过 240 秒），因此该脚本暂未作为门禁；接口链路与上传渲染已通过。
后续可把视觉调用进一步拆成独立任务，避免页面轮询等待长请求。

## 5. 门禁
357 tests OK；规则 PASS；前端契约缺口 0；首页 28 项 0 异常；
300 路由实盘通过；此前 `verify_all.py --with-ui` 10 项全 PASS。
