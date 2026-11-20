# 视频域端到端验收（2026-11-20 第四轮）

用户反馈三处"点了就失败/清空/空壳"。先列任务与验收标准，再逐条实跑。

## 一、验收清单与标准

| # | 链路 | 验收标准（可判定） |
|---|---|---|
| 1 | 短剧工作流 · 生成参考图 | ① 提示词为空也能提交（返回 200 + taskId，不再 `invalid_input`）② 任务结束资产**数量不变** ③ 该资产 `status` 变为 `done` 且 `imageFile` 落盘（失败则 `failed` + error，也不能清空） |
| 2 | 爆款拆解 | 上传 mp4 后 `project.analysis` 非空（hook/structure/shots），`project.results` ≥ 1 |
| 3 | 全新画布 2.0 | 创建返回 `document`（含 id/graph/updatedAt）；项目资产 `upload/list/rename/remove` 全 200 且列表随操作变化 |

## 二、根因与修复

| 现象 | 根因 | 修法 |
|---|---|---|
| 参考图 **invalid_input** | 卡片提示词框允许为空，服务端 `prompt` 为空直接 400 | 空提示词用「资产名 + 画型 + 项目画风」兜底生成 prompt |
| 参考图生成后卡片仍"待生成/失败" | 生成结果只落到 asset-library，**没写回** `project.settings.assets`；前端卡片读 `item.status` / `item.imageFile` | 成功后写 `status=done`+`imageFile`+`history`，失败写 `status=failed`+`error` |
| 失败后"全部清空、回步骤 01 循环" | 400 触发前端重载项目，看到的项目 brief 没有 assets，视觉上等于清空 | 上面两条修好后不再走失败分支；同时保证 refetch 仍有资产 |
| 拆解"返回内容为空" | `project.analysis` 只在 `payload` 里，未提升到顶层；结果列表虽写了 `results`，但识别资产/生成按钮都依赖 `analysis` | `breakdown_project` / `_bd_public` 顶层补 `analysis/analysisHistory/motionReference/generation` |
| 画布项目资产 `not_migrated` | `/api/canvas/assets/{upload,list,rename,remove}` 未实现 | 四个接口落到 canvas 文档 `payload.assets`，文件存 `canvas-assets/` |
| 画布资产上传 400 | 先 `req.json()` 解析二进制流 → "请求体不是合法 JSON" | 仅 `content-type: application/json` 时才解析 body |

## 三、实跑结果（`tools/audit_video_e2e.py`，真实模型）

```
[*] 端口 57855
=== 参考图生成 ===
[OK] 资产提取            people=2 scenes=1
[OK] 资产已持久化        refetch=2 ids=['people-1','people-2']
[OK] 提交参考图生成      status=200（空 prompt 也通过）
[OK] 生成任务结束        state=done
[OK] 资产数量未丢失      rows=2
[OK] 资产状态已回写      status=done file=assets/bcd3412a…
=== 爆款拆解 ===
[OK] 上传 mp4 / 拆解任务 done
[OK] 拆解内容非空        keys=[hook,sellingPoints,shots,structure] results=1
=== 画布项目资产 ===
[OK] 创建画布 / 上传 n=1 / 列表 n=1 / 重命名 / 移出 n=0
合计 14 步，失败 0
```

## 四、诚实边界

- 参考图这次是**真实出图成功**（用户配置的 kie / google/nano-banana），会产生正常调用费用；只跑 1 张。
- 拆解结果仍是**文本分析 + 分镜 JSON**（落盘为 `.json` 结果文件），不是自动生成视频。
- 画布资产是"项目资产库"，只做上传/改名/移出；渲染成片仍走画布生成链路。
- 三处修复均为服务端字段/接口补齐，未改动前端 JS。

## 五、复跑

```powershell
.\.venv\Scripts\python.exe tools\audit_video_e2e.py     # 14 步，含真实出图
.\.venv\Scripts\python.exe tools\audit_video_domains.py # 10 步，纯接口
.\.venv\Scripts\python.exe .local\deploy\run_ecom_canvas.py  # 浏览器：电商 + 新建画布
```
