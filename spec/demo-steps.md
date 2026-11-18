# 课题演示 · 操作步骤单（真实 `data/`）

> 用法：从上往下照着做即可。每一步都写了「做什么 / 应看到什么 / 讲什么 / 大概多久」。
> 数据口径：直接跑 `data/`（导师给的原始数据），不做隔离。

---

## A. 演示前 10 分钟（准备，不上台）

### A1 备份（30 秒，出问题就靠它）

```powershell
cd F:\WorkAPP\NanbudoTV·AI
Copy-Item data .local\data-backup-$(Get-Date -f yyyyMMdd-HHmm) -Recurse
```

### A2 体检（10 秒，应看到「22 项，不通过 0 项」）

```powershell
.\.venv\Scripts\python.exe tools\demo_check.py --clean
```

关键四行应为 `ok`：

```
ok license.db     cards=1, activations=0
ok visual.db      visual_projects=1
ok images         model=google/nano-banana key=已填 备用=有 banana-pro
ok 视觉项目        测试-202611161707
```

### A3 彩排（40 秒，应看到「15 步，失败 0」）

```powershell
.\.venv\Scripts\python.exe tools\rehearse_demo.py
```

> 彩排用的是 `data/` 的**副本**，真实目录零写入（不会占设备绑定）。

### A4 启动

```powershell
.\scripts\start.ps1            # 开桌面窗口（推荐，现场更好看）
```

窗口自动打开；若用纯内核模式（`.\scripts\start.ps1 -NoGui`），端口这样取：

```powershell
$j = Get-Content (Get-ChildItem data\runtime-*.json | Select-Object -First 1) | ConvertFrom-Json
$j.baseUrl
```

**记下这个地址**，浏览器粘进去即可。

---

## B. 上台：六个环节

### 环节 1｜门控与登录（约 1 分钟）

| 步骤 | 操作 | 应看到 |
|---|---|---|
| 1 | 打开 `http://127.0.0.1:<端口>/` | **自动跳转**到登录页（服务端 302），提示「请先激活卡密」 |
| 2 | **先故意填一张错卡**，随便写 | 红色提示「卡密无效，请核对后重试。」 |
| 3 | 填真卡：`DW-PWMB-AXYU-ASP8-C8H8-5X4P-ZSZW-RQ7G-QGTJ` | 自动跳回首页 |

讲解要点（挑一句讲）：
- 错卡提示是**中文**——旧接口只回 `invalid_card`，用户看到的是英文码，这是刻意修的。
- 登录会把本机写进 `activations`（设备码由浏览器 UA 派生）；**卡支持多设备**，不影响其他机器。

### 环节 2｜首页体量与入口（约 30 秒）

| 步骤 | 操作 | 应看到 |
|---|---|---|
| 1 | 停在首页，指向各数据块 | 有真实数据（不是空列表） |
| 2 | 点「短剧项目中心」 | 打开工作流（`visual.html`，嵌在 iframe 里） |

讲解要点：首页 28 项数据块有独立门禁（`tools/check_homepage.py`），**0 异常**。

### 环节 3｜短剧主线（约 3 分钟，核心）

| 步骤 | 操作 | 应看到 / 耗��� |
|---|---|---|
| 1 | 项目中心里指向已有项目 `测试-202611161707` | **主动说明**：这是 11-16 联调留下的空项目，分镜为空 |
| 2 | 点「新建项目」→ 命名 → 确定 | 项目创建成功 |
| 3 | 在「剧本 / 源素材」框里填：`第一场 图书馆 日 内` + 换行 + `林晚把剧本推到周野面前：这段冲突太软。` | 自动保存（右下角提示） |
| 4 | 点「准备 / 提取大纲」 | 出现三阶段进度：`normalize → storyboard → assemble`，**约 46 秒**（实测 8.4s / 37.6s / 0ms） |
| 5 | **紧接着再点一次同样的按钮** | **0 秒**返回，命中缓存 |

讲解要点（这是最有说服力的一段）：
- 三阶段是**阶段化**：`assemble` 是本地汇总（0ms），失败时只重试失败那一段，不用整轮重来。
- 第二次 0 秒是**切分指纹**（源文本 + 镜数 + 用途 的 sha256）：省一次上游调用，**同一份稿子结果不漂移**。
- 上游偶发断连时，返回里会带 `stages`（哪一步失败、前序结果保留），不会静默失败。

### 环节 4｜出图（可选，约 90 秒；时间紧就跳过）

| 步骤 | 操作 | 应看到 |
|---|---|---|
| 1 | 选中一个镜头，点「生成 / 出图」 | 任务进度条推进 |
| 2 | 等待 | **约 87 秒**出图（3.9 MB JPEG） |

如果要讲技术细节：主网关（KIE）账号池空时会**自动切备用 `banana-pro`**，这也是刚才耗时 87 秒的原因。

### 环节 5｜字幕链路（约 1.5 分钟，最稳，建议一定演）

| 步骤 | 操作 | 应看到 / 耗时 |
|---|---|---|
| 1 | 打开「视频去字幕」页（`subtitle_removal242.html`） | 导入区 |
| 2 | 拖入一个带字幕轨的 mp4 | 导入成功，显示时长/分辨率 |
| 3 | 点「检测字幕区域」 | 选区框出现，提示「已定位字幕候选（6/6 帧命中）」 |
| 4 | 点「本地处理 / 拆轨」并确认 | **秒级**完成：「已移除 1 条独立字幕轨；原片保留。」 |
| 5 | （可选）点「语音转写」 | 本地 faster-whisper，**约 43 秒**，出分段 + SRT |

讲解要点：
- 拆轨是**纯 Python 解析 MP4 box**（还修了 `stco` 偏移，否则会花屏），不依赖 ffmpeg。
- 检测用 PyAV 取帧 + OpenCV 阈值，**也不需要 ffmpeg**。

### 环节 6｜收尾：体量与诚实（约 1 分钟）

```powershell
.\.venv\Scripts\python.exe tools\verify_all.py
```

应看到 7 项全部 PASS（约 1.9 分钟；含浏览器版加 `--with-ui` 是 9 项 / 8.5 分钟）。

口头给数字：

```
265 条旧路由 100% 注册     300 条注册路由实盘：0 个 5xx
322 项单测                 9 项门禁全 PASS（含 18 页点击、登录链路）
```

然后**主动讲 5 条边界**（`spec/delivery.md` 第 7 节）：
`update/*` 501（本地版不做在线更新）、视频按次计费且慢、图像主网关账号池可能空（已自动切备用）、
像素修补仍需 ffmpeg、云端去字幕未配置（409）。

---

## C. 应急卡片（当场出问题时照着说）

| 现象 | 一句话应对 |
|---|---|
| 出图 502 `no available account` | 「主网关账号池空了，系统会自动切备用网关；刚才那次 87 秒就是走的备用。」 |
| 分镜 502 `bad_model_output` | 「渠道答成了散文，我们已经重问；再失败会显示失败阶段并保留前序结果，可以只重试这一段。」 |
| 视频一直转圈 | 「上游单片 1~3 分钟按次计费，演示只看提交与进度，不等成片。」 |
| 页面 console 有 400 | 「那是我刚才故意用错误卡登录的负向用例。」 |
| 某页打不开/样式错 | 「先刷新；还不行就切到字幕链路（纯本地，不依赖外网）。」 |

---

## D. 收尾

```powershell
# 关内核（会清 runtime 文件）
$j = Get-Content (Get-ChildItem data\runtime-*.json | Select-Object -First 1) | ConvertFrom-Json
Invoke-RestMethod -Method POST "$($j.baseUrl)/api/shutdown"
```

**万一演示中改坏了数据**（误删项目等）：

```powershell
Remove-Item data -Recurse -Force
Copy-Item .local\data-backup-<时间戳> data -Recurse
```

---

## E. 速查（一页备忘录）

| 时间 | 做什么 | 命令 / 值 |
|---|---|---|
| -10 min | 备份 | `Copy-Item data .local\data-backup-$(Get-Date -f yyyyMMdd-HHmm) -Recurse` |
| -9 min | 体检 | `python tools\demo_check.py --clean`（22 项） |
| -8 min | 彩排 | `python tools\rehearse_demo.py`（15 步） |
| -5 min | 启动 | `.\scripts\start.ps1` |
| 0 min | 登录 | 错卡 → 真卡 `DW-PWMB-AXYU-ASP8-C8H8-5X4P-ZSZW-RQ7G-QGTJ` |
| +1 | 项目中心 | 首页 → 短剧项目中心 |
| +2 | 主线 | 新建 → 填原稿 → 准备（46s）→ 再点一次（0s） |
| +5 | 出图（可选） | 87s |
| +7 | 字幕 | 导入 → 检测 → 拆轨（秒级）→ 转写（43s） |
| +9 | 收尾 | `python tools\verify_all.py` |
| +11 | 讲边界 | 5 条已知边界 |

**红线三条**：别中途换浏览器（换 UA = 换设备，要重登）；别点 `update/*`；别用 `-DataDir` 临时目录（会显得空壳）。
