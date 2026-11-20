# 原版 1.280 更新同步与全量复验（2026-11-20）

## 一、发现的原版变化

对比 `F:\WorkAPP\短剧改写工作台\_internal\static` 与仓库 `static/`：

- **原版 173 个静态文件，我们原先 166 个**：缺 7 个新组件
- 同名但内容变化 21 个（前端新增功能/字段）

新增文件：

```
asset_tools283.css/js       资产合并 / 使用项目图片
canvas_tail283.js
canvas_tools283.css
workflow_script_review286.css
workflow_series282.css/js   多剧集管理
```

内容变化较大的：`app.js`、`visual_page.js`、`macro_arrangement.js`、
`ecommerce259.js`、`video_canvas.js`、`login.js` 等。

## 二、同步方式

- 173 个静态文件**整目录复写**到仓库 `static/`
- 我方两处本地补丁重打（备份在 `.local/static-backup-before-upstream/`）：
  - `visual_page.js`：音色链接在新窗口被拦时同页跳转兜底
  - `subtitle_removal245.js`：零积分显示“免费”
- `codeHash` 覆盖前端静态文件，`which_code.py` 可复验

## 三、新增 12 个接口缺口 → 全部补齐

`tools/front_contract_check.py` 同步前报 12 条缺失；新增
`app/api/feature_pack.py`（在 `main.py` 接线）补齐 14 条路由：

| 组件 | 接口 | 实现 |
|---|---|---|
| app.js / login.js | `/api/update/apply-online` | 返回可核验 ok + message（演示不替换运行文件） |
| visual_page.js | `/api/visual/project/script-review` GET/POST | 按行分类、未决/未映射计数、确认决策写回项目 |
| asset_tools283.js | `/api/visual/assets/merge/preview` | 校验参数，回 planHash/aliases/影响集数 |
| asset_tools283.js | `/api/visual/assets/merge/apply` | 合并为一个资产，旧名保留为别名 |
| asset_tools283.js | `/api/visual/asset/use-project-image` | 把项目内已有图片设为目标资产参考图 |
| macro_arrangement.js | `/api/visual/macro/media/video-settings` | 保存/重置卡片模型与分辨率 |
| workflow_series282.js | `/api/visual/series` GET | 返回 `project.seriesManaged / episodes / deletedEpisodes` |
| visual_page.js | `/api/visual/series/convert` | 项目转多剧集，原稿作为第 1 集 |
| visual_page.js | `/api/visual/series/settings` | 剧集设置 |
| visual_page.js | `/api/visual/series/delete` / `restore` | 软删除与恢复 |
| workflow_series282.js | `/api/visual/series/episode/{create,update,delete}` | 剧集 CRUD（软删除） |

同步后 `front_contract_check.py`：**合计缺失 0 条**。

## 四、全量冒烟（`verify_all.py --with-ui`）

```
门禁                                    结果      耗时
单元测试                                PASS   22.1s
代码规则 R1-R5                          PASS    0.6s
首页 28 项                             PASS    0.9s
前端契约（页面会调的内核接口）                     PASS    0.7s
旧路由覆盖                               PASS    1.3s
300 路由实盘审计                          PASS    1.5s
启动门控（未登录跳登录页）                       PASS    0.7s
8 域通道巡检                              PASS   84.5s
18 页点击审计                            PASS  376.0s
登录→视觉链路场景                           PASS   44.1s
==============================================
总计 10 项，失败 0 项，8.9 分钟
```

浏览器场景里有一条 400 控制台记录（探针式请求），不影响门禁 PASS。

## 五、是否需要对原版 exe 抓包？

不需要消耗你给的卡密：这次更新把**前端全部明文写在 `_internal/static/`**，
请求 payload 与响应字段消费点都可直接读取；`front_contract_check.py` 会自动列出缺口，
`spec/` 下各域 audit 脚本给出真机验证模板。若以后出现“只有运行时才知道”的接口，
可以再用卡密冒烟（一次只激活一个），按 `tools/ui_macro_probe.js` 的抓包方式取证。

## 六、状态

353 tests OK；规则 PASS；首页 28 项 0 异常；前端契约缺口 0；
10 项全量门禁 PASS。
