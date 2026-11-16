# D6 采集域复刻报告（2026-11-16）

结论：D6 全部 17 条路由已注册，13 条真实实现，4 条受外部能力限制返回明确 501。

真实实现并已真机跑通：

- /api/watch/{open,start}：有头浏览器窗口，子进程 tools/watch_window.js，独立 profile 保留登录态
- /api/watch/{stop,discard}：通过 stdin 发 stop 让 Node 侧优雅关浏览器，避免 profile 损坏
- /api/watch/status：running / pid / url / startedAt
- /api/link/analyze：无头采集标题、描述、封面、video 与 audio 直链、网络里抓到的 mp4/m3u8
- /api/link/download：浏览器上下文下载，复用系统代理与 Cookie
- /api/link/import：下载并建 download 记录
- /api/hall/series/download：解析页面后逐个下载并建记录
- /api/hall/series/transcribe：本地 faster-whisper 转写，输出分段与 SRT
- /api/hall/{downloads,downloads/cover,downloads/stream}：列表、封面、Range 流
- /api/hall/{episodes,rank}：参数校验与空库如实返回
- /api/upload：通用上传

真机链路：

```
[*] 启动窗口 200 running=True pid=4996
[*] 关闭窗口 200 采集窗口已关闭。
[*] 链接下载 200 耗时=2s bytes=201720
[*] 转写 200 耗时=43s 段数=2 语言=zh
[*] 首段 0.0~1.8: 今天天气不错
```

踩掉的三个坑：

1. 子进程输出按 GBK 解码，中文标题导致 UnicodeDecodeError，上层只看到"采集进程无输出"。现在统一 utf-8 加 replace。
2. 裸 urllib 下载不了媒体，Chromium 能开的站点 Python 直连超时。改用浏览器上下文下载。
3. 浏览器调用封装成功返回 dict、失败返回 Response，调用方按 Response 取 status 会炸。统一成二元组。

仍受外部能力限制：

- /api/link/cover 与 /api/link/stream：需要目标站点接口约定，未知
- /api/visual/episode/video 与 /api/visual/macro/media/submit：中转站收录 254 个视频模型，但创建任务返回 503 no available account
- /api/breakdown/motion 开头：需要 torch 与视频模型权重