# 视频/视觉域三处实盘审计（2026-11-20）

用户反馈三张截图分别对应「资产识别失败: not_found」「拆解任务完成但无内容」
「画布删除后仍显示，点击报画布内容不完整」。三处都已定位并跑通。

## 1. 资产提取：接口收错了东西

前端「资产提取」发的是 `{projectId, sourceText, modelConfig}`，
服务端 `assets_analyze` 却只接受 `{assetId, file}` 并做图片像素分析 → 404 not_found。
另外 `visual_stage.build` 没有 `task_store`，异步分支一开始还报 NameError；
`VisualAssist` 暴露的是 `_json_call(spec,user)`，不是 `TextAssist.json_call`。

修法：同一路径按 payload 分流——带 `sourceText` 时建异步任务，用 LLM 从剧本提取
`people/scenes/props`，写入 `project.settings.assets`，返回 `{taskId}`；任务结果带 `project`
与 `assetCounts`（前端渲染提示要读）。图片 assetId 的旧路径保留。

## 2. 爆款拆解：结果写错字段

拆解任务把 LLM 结果写进 `project.outputs`，而前端结果列表读 `project.results`
（`!row.deleted`、按 `file/modelName/mode/resolution` 渲染卡片）。所以任务 done、
提示“新生成结果请验收”，但列表永远“暂无待验收结果”。

修法：分析/生成完成后把 JSON 结果落盘到 `breakdown/<project>-<kind>.json`，
并追加到 `project.results`（`saved:false`、`mode:"creative"`），前端即可看到待验收卡片。

## 3. 画布删除：路由未注册 + 软删除没过滤

`/api/canvas/delete` / `/api/canvas/restore` 未注册 → 501 not_migrated，卡片显示红色提示；
删除即便写入 deleted 标记，`canvas_list` 也不过滤 → 列表再次出现刚删的卡片。

修法：注册 delete/restore（支持 `id` 与 `ids` 批量），标记软删除；`canvas_list` 过滤 deleted 项。

## 4. 验收

接口+任务层 `tools/audit_video_domains.py`（真 LLM）：

```
=== 视觉：剧本资产提取 ===
[OK] 资产识别任务    state=done
[OK] 返回项目与资产计数  {"people":2,"scenes":1,"props":2}
=== 爆款拆解 ===
[OK] 上传拆解素材 / 拆解任务完成 / 结果列表可见  results=1
=== 画布删除 ===
[OK] 创建画布 / 删除接口 200 / 列表不再显示
合计 8 步，失败 0
```

浏览器层 `tools/ui_canvas_delete.js`：

```
[OK] 画布卡片可见 / 目标卡片存在 / 点击删除
[OK] 目标卡片消失  before=1 after=0
[OK] 无 not_migrated / 4xx
```

## 5. 关于 IDA

按指示用 IDA Pro 9.5 + MCP 反查过原版：`NanbudoTV·AI.exe` 只是 PyInstaller bootloader
（876 函数 / 1255 字符串），业务线索仍来自 PYZ 与前端契约。这轮三处问题都属于
“请求/响应形状不匹配”，只有把前端真实 payload 与任务轮询契约对齐才能发现。

## 6. 诚实边界

- 拆解结果是**文本 JSON 文件**（分析/分镜），不是自动生成的视频；视频仍需单独走生成流程。
- 画布删除是软删除（可 restore），不是物理删除。
- 资产提取按剧本全文最多 4000 字送入模型，超出会截断。

## 7. 第三轮（2026-11-20 晚）：参考图 / 拆解 / 画布 / 电商

| 现象 | 根因 | 修法 |
|---|---|---|
| 「生成参考图」提示**素材已不存在，未提交生成** | 前端 `project.assets[kind].find(v=>v.id===assetId)`；LLM 提取结果只有 name/role，**没有 id** → 永远查不到 | 资产条目补 `id`（`people-1` / `scenes-1`）、`kind`、缺省 name |
| 拆解任务完成但结果区空 | 上传/查询返回的项目把 `sourceFile`、`mediaType` 藏在 `payload` 里；前端读 `project.media` / `project.sourceFile` → 玩家是空壳 | `breakdown_upload` / `breakdown_project` 顶层补 `media` / `sourceFile` / `results` |
| 「全新画布 2.0」新建失败 | 前端取 `(await api()).document` 且 `document` 要带 `id/graph/updatedAt`；我们只回 `{id,name}` | create/document/save 统一返回完整 `document`（含 `graph`、时间戳） |
| 打开画布报 `reading 'updatedAt'` | `/api/canvas/save` 只回 `{ok,id}`，前端 `doc=response.document` 得到 undefined | save 也返回 `document` |
| 电商页 `Cannot read properties of undefined (reading 'mode')` | 电商页 `state() = doc.ecommerce259`，画布文档没有该对象 | 画布文档补 `ecommerce259` 默认态（mode=video/form/bindings…） |

验收：

```
=== 视觉：资产提取 ===
[OK] 资产识别任务 / 资产计数 {"people":2,"scenes":1,"props":2}
[OK] 资产条目带 id  ids=['people-1','people-2']
=== 爆款拆解 ===
[OK] 上传拆解素材 media=video file=breakdown/...
[OK] 拆解任务完成 / 结果列表可见 results=1
=== 画布 ===
[OK] 创建画布 / 创建返回 document graph=True ecom=True
[OK] 删除接口 200 / 列表不再显示
合计 10 步，失败 0
```

浏览器（`tools/ui_ecom_canvas.js`）：

```
[OK] 电商页无 mode 报错
[OK] 电商页有内容
[OK] 新建对话框打开
[OK] 创建成功且打开   open=UI 新建画布
[OK] 无画布 4xx/JS 报错
```
