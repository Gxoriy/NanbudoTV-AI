# 步骤 02 三个问题修复报告（2026-11-20 第二轮）

## 1. 大图「使用角色音色配音 · 单独报价」点击无响应

排查：`/static/video_voice.html` 与 `/static/video_voice.js` 都存在，
接口 `/api/video-voice/{source,status,quote,generate,observe}`、`/api/voices/catalog` 全部 200。
浏览器直开该页正常渲染「视频音色替换」，控制台无 JS 报错（仅 favicon 404）。

根因：它是 `target="_blank"` 的普通链接，桌面壳（pywebview）会**拦截新窗口**，
`window.open` 返回 null，点击即“没反应”。

修法（前端最小改动）：创建链接时挂一个兜底——

```js
voice260.addEventListener('click', event => {
  const win = window.open(voice260.href, '_blank');
  if (!win) { event.preventDefault(); window.location.href = voice260.href; }
});
```

能新开就新开，开不了就在当前页跳转，页面自带「返回原创作板块」。

## 2. 下一步：分镜 报「请先识别当前剧本的人物、场景和物品」

`openCutModeDialog()` 的守卫：

```js
if (!state.project.workflowAssetSourceHash) return toast("请先识别当前剧本的人物、场景和物品。", true);
```

资产提取成功后我们只写了 `settings.assets`，**没写 `workflowAssetSourceHash`**，
DTO 也没暴露这个字段 → 永远为假，即使人物 3/场景 2/物品 7 都齐了。

修法：
- 提取完成时写入 `settings.workflowAssetSourceHash`（FNV-1a，同源稳定）与
  `workflowAssetSourceLength`
- DTO 暴露这两个字段

## 3. 匹配本地资产弹窗「12 总资产 / 0 推荐 / 此分类下暂无资产」

`asset_match230.js` 的契约是**每个资产一行**：

```
targets:[{targetKey,name,kind,status,reason,recommendedVersionId,
          candidates:[{versionId,name,sourceName,url,recommended,eligible,requiresReview}]}]
status: recommended | review | existing | busy | unmatched
```

我们第一版 matches 只回“已命中”的行、且 `candidates` 为空，弹窗分类计数全 0。

两个具体 bug：
1. 素材库行是**扁平结构**（`file` 在顶层），代码却读 `payload.file` → 所有库记录被跳过
2. 只回命中行 → 未命中的资产不出现，分类统计对不上

修法：
- 库行统一成扁平（`file` 顶层兼容 payload）
- 每个资产都出行：已有图片 → `existing`；任务中 → `busy`；有同名库图 → `recommended`
  （带 `candidates` 与 `/api/asset-library/image?id=…` 缩略图地址）；否则 `unmatched`
- 统计 `recommendedAssets/alreadyHasImageAssets/busyAssets/unmatchedAssets` 与行状态一致
- 新增 `/api/asset-library/image` 别名（`safeImage` 只认这个前缀）
- `inherit` 按 `{targetKey, versionId}` 写回 `imageFile/status=done/inherited=true`

## 4. 验收（真机，非模拟）

`tools/audit_step2b.py`（含真实资产提取）：

```
[OK] 资产提取完成            state=done
[OK] 资产 hash 已写入        hash=8ba98e79
[OK] matches 每项一行        rows=6 total=6
[OK] 命中推荐与候选          status=recommended cand=1
[OK] 候选带可用图片地址      /api/asset-library/image?id=2a35e4f2…
[OK] 继承写入 imageFile      inherited=1 file=assets/library-linwan.png
合计 6 步，失败 0
```

`tools/audit_step2.py`（上一轮的凭证/分场）：4 步 0 失败。

## 5. 回归

346 tests OK；规则 PASS；首页 28 项 0 异常。

## 6. 诚实边界

- 音色那条是**前端一行兜底**（其余全部是服务端修复）；若桌面壳连同页跳转也拦，
  需要把 `video_voice.html` 改成弹层——那是更大的改动，等确认现象再动。
- 资产匹配是**同名/包含**匹配，跨语言别名（“林晚” vs “Lin Wan”）不会命中。
- 分场仍是本地规则切分（按“第 N 场”标题）。
