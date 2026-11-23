# 视频生成成功但前端不显示 / 场景衔接缺失（2026-11-23）

## 0. 先澄清那个 id
`style_user_717cbdd0b24adc4a` 不是视频 id，而是项目的**美术风格 id**
（`settings.styleSpec`，名称“蒸汽朋克”）。真实视频任务记录在 `state.db`：

```
task=36aafbf9637c4a24b3dc36d65bd328c8  state=done
result.file=videos/48fb5955a89f4beb962c3aeda54970b0.mp4
upstreamTaskId=233704973
```

文件确实存在（2.5 MB）。所以“生成成功”判断是对的。

## 1. 为什么不显示
前端 `macro_arrangement.js` 从 `snapshot.media[segmentId][cardNumber].videoFile`
读取已生成视频。我们旧链路只做了两件事：

- VideoPipeline 把 mp4 存进素材库
- task_store.succeed 写 result

**没有把结果写回 macro 快照的 `media`**，所以刷新后卡片仍显示未生成。

修法：

- `VideoPipeline.start()` 增加 `segment_id / card_number / on_done`；
  任务成功后回调
- `macro/media/submit` 传回调，把 `videoFile / assetId / upstreamTaskId / history`
  写进 `macro:<projectId>` 的 `media[segment][number]`
- 新增 `app/api/media_recovery.py`：对**历史任务**（旧代码没写 media）从
  `state.db` 的 done 任务回补 media，并从 prompt 的 `【镜头】N` 和场次标题
  推断 segment/card；顺带补回卡片

真实数据副本验证：

```
scenes  [('scene-1',8), ('scene-2',8)]
plan    [('scene-1',8), ('scene-2',8)]
media   {'scene-1': ['1']}
        scene-1 1 videos/48fb...mp4 upstream=233704973
```

旧项目打开后即可看到已生成视频，不需要数据迁移。

## 2. 为什么没有场景衔接
旧 prompt 只有一行：`【镜头】1\n【画面】第一场：地下记忆当铺，夜`
——没有风格、上一镜头、下一镜头，模型自然按孤立画面生成。

修法（`app/api/media_quote.py`）：报价时组装 prompt：

1. `settings.styleSpec.prompt`（统一美术风格）
2. 当前场次标题
3. 本镜头 storyboard
4. 上一镜头 / 下一镜头 storyboard
5. 明确指令：保持人物造型、服装、场景布局、色板、材质与光线连续一致

同时 `macro/media/submit` 把 `referenceAssetIds` 解析成素材库文件路径，
作为 `images` 传给上游 `/v1/media/generate`，让参考图真正参与生成。

## 3. 回归
357 tests OK（新增 `test_video_result_written_back_to_snapshot`）；
规则 PASS；首页 28 项 0 异常；前端契约缺口 0；
`verify_all.py --with-ui` 10 项全 PASS（8.8 分钟，含 18 页点击审计）。

## 4. 边界
- 已生成的那条视频用的是旧 prompt，**无法追溯加衔接**；要重新生成才会带上下文。
- 真正的跨镜头视觉连续（尾帧承接）还需要上游 tail-frame 能力；
  这次做的是“提示词上下文 + 参考图”级别的衔接。
