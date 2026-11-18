# 通道巡检：每条主链路跑一遍（2026-11-18）

目标不是"质量好不好"，而是**通道通不通**：每一步只要求 200 + 关键字段在，
不校验内容。工具：`tools/lane_smoke.py`。

```powershell
python tools\lane_smoke.py                # 跳过要花钱的出图/出视频
python tools\lane_smoke.py --with-media   # 连出图一起跑
```

## 1. 巡检结果（29 步全绿）

| 域 | 步骤 | 结果 |
|---|---|---|
| **S1 会话/授权** | license/status → session/login（卡密）→ session/status | 3/3 |
| **S2 运行时/存储** | runtime/status、storage/status、upload | 3/3 |
| **D1 改写** | source/analyze（LLM）→ rewrite/generate 提交 → 任务完成（metaFile 落盘） | 3/3 |
| **D2 视觉** | project/create → project/source → project/prepare（三阶段）→ episode/state → **episode/frame（出图）** | 6/6 |
| **D3 字幕** | upload → detect（9/83/82/11）→ quote → local-start(strip) → **拆轨完成（dropped=1）** | 5/5 |
| **D4 配音** | voices/catalog → voices/media（试听 WAV）→ video-voice/quote | 3/3 |
| **D5 电商** | ecommerce/create → batch/create → quote → save | 4/4 |
| **D6 采集** | link/analyze（Playwright）→ watch/status | 2/2 |

关键证据：

```
[OK] D1 rewrite/generate 完成  state=done file=scripts/274059c6…
[OK] D2 episode/frame 完成     state=done file=assets/3edf0913…
[OK] D3 subtitle/strip 完成    phase=done file=results/0d024db4… msg=已移除 1 条独立字幕轨
[OK] D4 voices/media 试听      200（60872B RIFF WAV）
```

## 2. 本轮修掉的通道断点：图像账号池空 → 加备用网关

巡检第一次跑（`--with-media`）时 D2 出图失败：

```
[FAIL] D2 episode/frame 完成 502 state=error
       err=创建任务失败（503）: no available account
```

KIE 网关（`43.130.31.50:18813`）账号池空了，和当初视频网关的情况一样。
于是探测 `api.lk888.ai`，发现它带一批图像模型：

```
banana-pro / banana-2 / tt-image-2.5 / doubao-seedream-5-5 / muse-image …
（注意：图像模型的 resolution 只认 auto/1K/2K/4K，传 720p 会报参数不合法）
```

实测 `banana-pro` 出图成功：4.1 MB JPEG、约 87 秒。

**做法**：`ImageConfig` 增加 `fallback`（baseUrl/apiKey/model/resolution），
`generate()` 在主网关报"账号池空/超时/5xx"时自动切备用；**参数错误不重试**（否则会掩盖真问题）。
KIE 把 `503 no available account` 归类为 `internal`，所以判定同时看错误码与文案。

## 3. 巡检脚本自身踩的两个坑（都属"假失败"）

1. **字幕样本没带上字幕轨**：`-vf` 与 `-map` 同时用，ffmpeg 报"只有一个输入"，样本生成失败后
   静默退回无字幕轨版本，于是接口如实回"未发现独立字幕轨"，被误判为失败。
   改成 `-filter_complex` 后 `dropped=1`，真的产出了 `results/…-strip.mp4`。
2. **`local-start` 需要 `confirmed: true`**：这是防误触的设计（前端也是"确认后再处理"），
   冒烟脚本没传就拿到 400。这类 400 是**接口正确**，不是缺陷。

## 4. 边界

- 巡检只覆盖"一跳"：每步挑主链路最关键的一次调用，不做组合场景（组合场景见
  `tools/ui_scenario.js` 的登录+视觉链路）。
- `--with-media` 会真的花钱（出图约 87s/次）；默认关闭。
- 视频生成（`episode/video`）单次 1~3 分钟且成本更高，默认不放进巡检。
