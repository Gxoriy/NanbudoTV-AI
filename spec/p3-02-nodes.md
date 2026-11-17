# P3-02 视觉域：执行器 + 节点注册表（落地记录）

## 1. 为什么需要这一层

旧版 D2 的 180 处调用里有相当一部分写在几个巨型函数里（`macro/*` 一个分支二十多段），
改一处要通读全文、也无法观测"哪一步慢/哪一步失败"。

这里把"顺序"从代码里抽出来：每个环节是一个 `NodeSpec`，`Executor` 按名字顺序执行并记录
trace。**新增环节 = 加一个函数 + register**，执行器、接口、前端进度都复用。

## 2. 节点清单（9 个，4 个阶段）

| 阶段 | 节点 | 依赖能力 | 说明 |
|---|---|---|---|
| prepare | `source.normalize` | — | 规范化源文本，补 `fps` / `secondsPerCard` |
| prepare | `storyboard.plan` | `llm` | 逐镜规划（有 `plan()` 用它，否则退化成短 JSON 请求） |
| prepare | `assets.match` | `assets`（可选） | 按项目素材库做名称匹配，纯本地 |
| compose | `cards.build` | — | 按单卡时长把镜头合并成视频卡 |
| compose | `cards.quote` | — | 报价恒 0（免费） |
| generate | `card.draft` | `llm` | 为每张卡生成出图提示词 |
| generate | `media.submit` | `video` | 提交视频任务（异步，返回 taskId） |
| compose | `media.observe` | `video`（可选） | 读取任务状态，不阻塞 |
| export | `export.assemble` | — | 装配可导出结构（卡 + 提示词 + 统计） |

**能力是注入的**：节点从 `ctx["_services"]` 取 `llm` / `video` / `assets`，
缺哪个就抛 `NodeError("缺少能力：xxx")`，绝不返回假数据。

## 3. 流水线预设

| 预设 | 步骤 |
|---|---|
| `inspect` | normalize → assets.match → cards.build（纯本地，可离线跑） |
| `storyboard` | normalize → storyboard.plan → cards.build → cards.quote → assemble |
| `macro` | 全量九步（含 card.draft / media.submit / media.observe） |

## 4. 两个接口

```
GET  /api/visual/_nodes         节点自省：stage / inputs / outputs / requires / pipelines
POST /api/visual/_pipeline/run  {pipeline, context} → {ok, trace, context(白名单)}
```

失败语义：**422 + 已完成步骤的 trace**，前端可以只重试失败那一段。

## 5. 真机验证

```
[*] 节点自省 200 total=9 pipelines=['inspect', 'macro', 'storyboard']
    prepare   ['assets.match', 'source.normalize', 'storyboard.plan']
    generate  ['card.draft', 'media.submit']
    compose   ['cards.build', 'cards.quote', 'media.observe']
    export    ['export.assemble']

[*] inspect 200 ['source.normalize:ok(0.0ms)', 'assets.match:ok(0.1ms)', 'cards.build:ok(0.0ms)']
    卡片数=3 总字数=22

[*] storyboard 200 耗时=15s ['source.normalize:ok(0.0ms)', 'storyboard.plan:ok(14655.0ms)',
    'cards.build:ok(0.0ms)', 'cards.quote:ok(0.0ms)', 'export.assemble:ok(0.0ms)']
    首镜: 大学图书馆内，午后阳光透过窗户洒在木桌上，两位同学面对面坐着，桌上摊开剧本手稿…
```

## 6. 与现状的关系（说清楚边界）

- 这套执行器是**新增的编排层**：`/api/visual/macro/*` 等既有路由仍走各自 handler，
  它们与节点共享同一批领域对象（素材库、任务队列、LLM、视频管线）。
- 之后把 `macro/*` 的 handler 逐个改成"调用某个预设"，就能真正收敛成一条链路；
  现在先保证节点语义和 trace 可信，再迁移，避免一次性重写把已跑通的路由带崩。
- `breakdown/motion*` 依旧 501（需本地 torch 权重），该节点尚未注册。

## 7. 测试

`tests/test_visual.py`（注册表/执行器）+ `tests/test_visual_pipeline.py`（HTTP 契约）共 22 条：

- 节点自省字段与阶段分布、预设内容
- 缺输入 / 未知节点 / 未知流水线 / context 非对象 → 明确错误
- `retries` 重试到成功、失败保留 trace
- 缺能力 → 422 `node_failed`，且已完成步骤仍可见
- `inspect` 离线可跑、`macro` 会真的调用 video.start
