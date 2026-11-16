# 本地像素级擦除可行性实测

日期：2026-11-16　|　环境：ffmpeg 9.0.2 / numpy 2.5.5 / cv2 5.0.0　|　脚本：`tools/bench_erase.py`

## 1. 环境安装结果

| 组件 | 位置 | 说明 |
|---|---|---|
| ffmpeg / ffprobe / ffplay 9.0.2 | `E:\PublicWork\ffmpeg\bin` | 已写入 **用户级 PATH**，新开终端可直接调用 |
| numpy 2.5.5 / opencv-python 5.0.0 | `F:\WorkAPP\NanbudoTV·AI\.venv` | uv 自带 Python 是 PEP 668 externally-managed，直接 pip 会污染；用项目 venv 隔离 |

复现：
```powershell
$env:Path += ';E:\PublicWork\ffmpeg\bin'
.\.venv\Scripts\python.exe tools\bench_erase.py
```

## 2. 实测数据（1920×1080，字幕带 1920×180，测 150 帧）

判据：PSNR 相对"干净原帧"，越高越接近无痕。>40dB 基本看不出，30~35dB 有痕迹，<25dB 明显涂抹。

| 方案 | 平滑背景（渐变+硬边） | 高频背景（颗粒+细纹） | 单帧耗时 |
|---|---|---|---|
| 原图（未处理） | 33.09 dB | 32.08 dB | — |
| cv2.inpaint TELEA（精确 mask） | **51.80 dB** | 30.84 dB | ~17 ms |
| cv2.inpaint TELEA（阈值 mask，无需原图） | 51.69 dB | 23.31 dB | 17~92 ms |
| cv2.inpaint NS（精确 mask） | 51.89 dB | 30.78 dB | ~18 ms |
| ffmpeg `delogo` | 32.73 dB | 22.28 dB | ~6 ms（含编码） |

## 3. 结论

1. **能做，但有天花板**。平滑/中低频背景上，`cv2.inpaint` + 紧贴笔画的 mask 可做到 51.8 dB，肉眼基本无痕；这已经覆盖"纯色/渐变/虚化背景"的常见短剧镜头。
2. **高频背景（草地、砖墙、头发、密集纹理）无解**。经典插值算法只能把周围像素抹平，PSNR 反而低于原图（30.84 vs 32.08 → 越擦越糟）。要"看不出"必须上学习型修复（LaMa / E2FGVI / ProPainter），需要 torch + 数百 MB 权重。
3. **`ffmpeg delogo` 只适合兜底**。它按矩形边界插值，矩形内所有像素（含本已干净的背景）一起被糊掉，质量明显低于紧 mask 的 inpaint；优势是 6 ms/帧、一行命令。
4. **mask 质量决定上限**。同一算法，精确 mask 与阈值 mask 在高频背景上差 7.5 dB；阈值法还会把高光噪点当文字，导致 mask 膨胀、耗时涨到 92 ms。生产环境应做**时序一致的检测**（相邻帧同一位置连续出现才判定为字幕），而不是逐帧阈值。
5. **吞吐够用**：1080p 单帧 17 ms（ROI 内 inpaint）≈ 55 fps，加 x264 `veryfast` 编码后仍可 1.5~2× 实时；1 分钟 1080p 片子约 40~60 s 出片，纯 CPU、无 GPU 依赖。

## 4. 与旧版承诺的对照

旧版本地修补的文案是"仅修补识别到的浅色字幕笔画，可能留下模糊或涂抹痕迹，不能还原真实背景"——
这条文案正好对应上表的 TELEA 档位，说明原厂也是同一技术路线，**没有**藏着更强的模型。

因此新内核的定位建议：

| 档位 | 实现 | 承诺 |
|---|---|---|
| 本地移除独立字幕轨 | 纯 Python 拆 MP4（已上线） | 无损、无重编码 |
| 本地像素修补（可选） | cv2.inpaint + 时序 mask | 平滑背景可用；高频背景明确告知会留痕 |
| 云端去字幕（付费） | 服务端模型 | 才敢承诺"接近无痕" |

样本图：`.local/erase-bench/{smooth,hard}_{clean,dirty,mask,cv2_telea,cv2_threshold,cv2_ns}.png`
