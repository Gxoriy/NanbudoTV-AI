# P4 前端接入报告

## 1. 结论先说

前端页面已经能在本地内核上**真正跑起来**：资源全部加载、接口全部 200、无控制台错误。
这一步之前是黑的——页面一打开就 12 个 404，JS 根本没执行。

## 2. 根因：`/static/` 前缀没挂

前端 HTML 里资源引用是绝对路径：

```html
<script src="/static/visual_page.js"></script>
<link rel="stylesheet" href="/static/themes228.css">
```

而内核只把 `static/` 挂在根（`/visual_page.js`），于是：

```
404 /static/subtitle_removal245.js
404 /static/themes228.css
404 /static/subtitle_region244.js
...（每个页面 5~12 个）
```

**JS 一个都没加载**，页面只剩 HTML 骨架与内联占位文字。

修复：`app/main.py::_serve_static` 同时接受 `/static/x` 与 `/x`（`/static` 前缀被剥掉再查表）。

## 3. 冒烟结果（Playwright 真浏览器）

| 页面 | 标题 | 接口调用 | 4xx/5xx |
|---|---|---|---|
| `/` | NanbudoTV·AI | health/history/license/model-profiles/rewrite-projects/tasks/tutorials/visual.* 共 13 个 | **0** |
| `/subtitle_removal242.html` | 视频去字幕 | subtitle/list、subtitle/projects | **0** |
| `/video_voice.html` | 视频配音工作流 | tutorials | **0** |
| `/visual.html` | 视觉 | client/config、health、license/status、visual/{points,profile,projects,styles,usage} | **0** |

工具：`tools/ui_smoke.js`（Playwright headless）+ `run_ui_smoke.py` 驱动（起内核→跑页面→收报文）。

## 4. 本轮补齐的 P4 项

| 项 | 做法 | 验证 |
|---|---|---|
| 登录/激活流程自动化 | `tools/ui_login.js`：打开 `/login.html` → 填 `#cardKey` → 点 `#loginButton` → 等跳转 | 新设备码 `DW-7F629-…` 激活后 `licensed=true`，页面跳到 `/`，再进字幕页不再回登录 |
| 计费文案 | 字幕页/配音页把 `预计 0 积分` 改为 `免费`（`cost245` / `cost260` 辅助函数，只改显示层） | 改完重跑浏览器冒烟：0 控制台错误、0 4xx/5xx |
| detect 入口 | **旧版前端本来就有按钮**（`<button id="detect" disabled>自动识别字幕区域</button>`，绑定 `run('detect')`），只是后端没有该接口 | 现在端到端跑通（见下） |

### 字幕页真实流程（Playwright 驱动 UI，不是调接口）

```
[*] 打开字幕页 /subtitle_removal242.html
[*] 导入视频完成（#localFile 选文件 → 上传 200）
[*] 点"自动识别字幕区域" → 200 /api/subtitle/detect
[*] 选区 X=9 Y=83 W=82 H=11
[*] 提示：已定位字幕候选（6/6 帧命中），选区已向外对齐到整数网格，请检查后再处理。
```

真值对照（合成片白条 x=60/640、y=300/360、w=520/640、h=36/360）：
9.4% / 83.3% / 81.3% / 10.0% → 检测 **9 / 83 / 82 / 11**，误差在 1% 内。

## 5. 仍然缺的 P4 项

1. **`localRepair` 按钮态**：`capabilities.localRepair[0]` 后端已给，但前端未消费（不影响使用，仅少一个可用性提示）
2. **detect 在"拆字幕轨"模式下被禁用**（旧版逻辑如此：`$('detect').disabled=…||strip245()`），只有"像素修补"模式能自动识别
3. **云端模式仍是 409**：`/api/subtitle/submit` 未配云端时返回 `cloud_unconfigured`，前端会弹错——符合"仅本地/自建云端"的定位，但文案要更明确

## 5. 卡密

新卡 `DW-PWMB-AXYU-ASP8-C8H8-5X4P-ZSZW-RQ7G-QGTJ` 已通过 `tools/import_card.py` 导入本地授权库
（永久 / 全功能 / 外部导入），激活实测 `licensed=true, permanent=true`。
