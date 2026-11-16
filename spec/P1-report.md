# P1 地基层 · 进度报告

日期：2026-11-16　|　内核版本：`2.1.280+rebuild.1`　|　测试：**35 passed**　|　门禁：**PASS**

## 1. 完成情况

| ID | 任务 | 状态 | 产物 |
|---|---|---|---|
| P1-01 | 入口骨架：`freeze_support` + 端口 0 动态分配 + 端口回写 + daemon 线程 | ✅ | `app/main.py` |
| P1-02 | SQLite(WAL) 任务状态机：落盘、幂等、中断恢复、失败分类 | ✅ | `infra/tasks/{models,store}.py` |
| P1-03 | provider 注册表：豆包 `responses` / 千问 `chat_completions` / custom | ✅ | `infra/llm/*` |
| P1-04 | 传输层路由：按域注册、前缀分派、未迁移统一 501 | ✅ | `app/api/router.py`、`app/api/system.py` |
| P1-07 | CI 门禁：行长 / 数字后缀 / freeze_support / 依赖方向 | ✅ | `tools/check_rules.py` |
| P1-06 | 日志脱敏 + 子模块健康位 | ✅ | `infra/obs/{redact,health}.py` |
| P1-05 | `infra/store` 仓储抽象 + hash 目录名 | ⬜ 顺延（ADR-006） | — |

## 2. 实测验证（不是"写完就算"）

| 验证项 | 结果 |
|---|---|
| 端口动态分配 | 两次启动分别拿到 `54336` / `54399`，与旧实现的固定 `8765` 并存不冲突 |
| 端口回写文件 | `data/runtime-<pid>.json`，退出后自动删除；启动时清理 pid 已死的残留文件 |
| 优雅退出 | `POST /api/shutdown` → 进程 1s 内退出，清理 runtime 文件 |
| 未迁移路由语义 | `GET /api/visual/macro/state` → `501 {"error":"not_migrated"}` |
| 任务崩溃恢复 | 单测模拟进程被杀 → 重启后 `interrupted`，可 `start()` 续跑 |
| 多实例隔离 | 单测同时起两个 server，`/api/health` 各自返回自己的 `port` |
| provider 结构对齐 | 新内核 `/api/model-profiles` 与旧实现三家 `baseUrl/model/protocol` 完全一致（仅多一个 `label`） |
| 日志脱敏 | 单测确认 Bearer / `sk-` / `DW-` 卡密 / 长 hex 在日志出口被替换 |
| 健康位 | `/api/health` 新增 `status` + `components`（tasks / data_dir / llm / subtitle），旧四字段不变 |

## 3. 三个必须记住的坑（都已修）

### 3.1 `python -m app.main` 会让 `from ..main import x` 拿到另一个模块对象

表现为 `/api/shutdown` 返回 200 但进程不退出：`__main__` 与 `app.main` 是两份模块实例，各自的 `threading.Event` 互不相干。
**结论**：入口把回调注入给 `app/api/system.build(..., on_shutdown=...)`，禁止跨层反向 import 入口模块。

### 3.2 前端任务契约不是"随便定"的（这条会直接导致线上无限轮询）

实测 `static/*.js`：
- 终态判定是 `['done','error','failed','canceled','cancelled'].includes(state)` → 内部状态**必须**是 `done`/`error`，不能叫 `succeeded`/`failed`
- `progress` 被当 **0~100** 用（`progressBar.value = Number(task.progress)`）
- 字段名是 camelCase：`startedAt` / `createdAt`
- `/api/tasks` 必须含 `tasks` 与 `activeCount`；`/api/tasks/{id}` 允许 `{task:{...}}` 或裸对象（前端 `task.task || task`）

**落地**：库存 0~1 内部比例，`Task.public()` 统一转 0~100 + camelCase + `interrupted → state=error, errorCode=interrupted, resumable=true`（既不骗前端，也不丢续跑语义）。

### 3.3 抽象"最小可运行两实例"才发现端口写死

旧实现 `8765` 是硬编码常量，不是配置。新内核 `--port 0`，并把实际端口写进 `runtime-<pid>.json`，桌面壳/调试脚本读文件而不是猜端口。

## 4. 新增的运行方式

```powershell
# 只起内核（无窗口，调试用）
python -m app.main --no-gui --port 0

# 跑验收测试
python -m unittest discover -s tests

# 跑 CI 门禁
python tools/check_rules.py
```

## 5. 与方案 A 计划的偏差（需同步到任务清单）

1. **P1-04 的 catch-all 适配器改为 501 兜底**：旧实现只有字节码，运行时转发不可行。适配器降级为"规格层契约 + 冒烟基线比对"，已写进 `P0-report.md` 决策记录第 4 条。
2. **P4-04 的响应字段兼容层提前到 P1**：任务接口的 camelCase / 0~100 / done-error 必须现在就对齐，否则后续每迁一个域都要返工。
3. **P1-05 依赖 P2 试点**：`infra/store` 的目录策略要先看字幕域的真实落盘形态再定，避免抽象错。建议顺序调整为 **P2-01 → P1-05 → P2-02**。

## 6. 下一步

- 先做 **P1-06**（日志脱敏 + `/api/health` 子模块健康位，半天量级）
- 再进 **P2-01 / P2-02**（字幕域试点 + ASR 封装），P1-05 在试点中定形态
