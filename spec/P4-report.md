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

## 4. 仍然缺的 P4 项

1. **登录/激活流程自动化**：还没用 Playwright 走"输入卡密 → 激活 → 跳转"完整链路
2. **计费文案**：页面仍显示"预计消耗 0 积分"，未改成"免费"；`pricingMode=free` 已由后端给出，前端没消费
3. **`localRepair` 按钮态**：`capabilities.localRepair[0]` 已提供，前端未据此禁用/启用
4. **detect 按钮**：前端目前没有触发点（旧版也没有），需要新增入口

## 5. 卡密

新卡 `DW-PWMB-AXYU-ASP8-C8H8-5X4P-ZSZW-RQ7G-QGTJ` 已通过 `tools/import_card.py` 导入本地授权库
（永久 / 全功能 / 外部导入），激活实测 `licensed=true, permanent=true`。
