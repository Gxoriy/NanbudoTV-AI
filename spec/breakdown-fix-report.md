# 爆款拆解：顶部完成但右栏无内容、无结果视频（2026-11-23）

## 1. 现象与真实数据
最近项目 `ea394c3d…` 的任务 `03f30e69…` 状态是 `done`，但分析内容是：

> 无法给出：当前未获取到 breakdown/b848…mp4 的可解析画面与音频数据……

也就是说：**任务确实完成了，但模型根本没看到素材**。

## 2. 根因一：拆解只传了文件名
`_breakdown_task(kind='analyze')` 原来只把 `sourceFile` 路径拼进提示词，
没有抽帧、没有视觉输入。模型只能回答“素材不可读”，前端因此：

- `analysis.shots` 为空 → 右栏 `analysisPanel` 虽展开但没有镜头内容
- 顶部却因为 task done 显示“任务已完成”

修法：

- 新增 `domain/ai/vision.py`：用本地 ffmpeg 在指定区间抽 3 帧，
  以 `data:image/jpeg;base64` 通过 `/v1/chat/completions` 发给视觉模型
  （`deepseek-v4-flash-vision-exp`）
- JSON 容错：修复模型把真实换行塞进字符串导致的解析失败
- 模型不可用时降级为**时间轴采样结果**（3 段，不臆测具体画面）
- 分析任务结果带 `performance.sampledFrames/transmittedFrames`

## 3. 根因二：generate 只出 JSON，不出视频
`_breakdown_task(kind='generate')` 原来只调用文本 LLM 生成 storyboard JSON，
然后 task done——所以顶部完成，但 `project.results` 里没有 mp4，右栏自然空白。

修法：

- `rewrite.build` / `rewrite_extra.build` 接入已有 `video_pipeline`
- generate 分支用拆解结果（hook / sellingPoints / shots / 用户补充）组装提示词，
  调用 `video_pipeline.start()` 生成视频
- **等内层视频任务 done 后再把外层 breakdown 任务置 done**，
  避免“顶部先完成、结果还没到”
- 视频落库后回调把 mp4 写进 `project.results`，与前端 `render()` 契约一致
- 修正上游 `version` 参数：只接受「快速/标准」，之前误传了模型名
  `seedance-2.0-anci` 导致上游 400

## 4. 端到端验收（`tools/audit_breakdown.py`，真实项目副本 + 真实密钥）

```
[*] analyze state done
[OK] 拆解有镜头结果  shots=3 frames=3
[*] video task done
    result={'file': 'videos/b9beea06e410457bb36f7c335b1bdcbb.mp4',
            'upstreamTaskId': '236913862'}
[*] generate state done
[OK] 结果列表有视频  videos=1
    拆解复刻视频 videos/b9beea06e410457bb36f7c335b1bdcbb.mp4 236913862
```

（验收中视觉接口偶发未返回合法 JSON，降级为时间轴采样结果；单独用同一批采样帧
直连视觉模型可拿到真实镜头描述。降级路径不会编造画面内容。）

## 5. 全量门禁

```
单元测试 PASS       规则 R1-R5 PASS      首页 28 项 PASS
前端契约 PASS       旧路由覆盖 PASS      300 路由实盘 PASS
启动门控 PASS       8 域通道巡检 PASS     18 页点击审计 PASS
登录→视觉链路 PASS  总计 10 项，失败 0 项，9.2 分钟
```

## 6. 边界
- 抽帧是本地 ffmpeg（3 帧/区间），不依赖上游抽帧服务；视频不分析音轨。
- 视觉超时或输出不合法时给出时间轴占位结果，不会假装看到了未提供的画面。
- 视频生成仍按实际调用计费；外层任务现在会等内层落库，可能要数分钟。
