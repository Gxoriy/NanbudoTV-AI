# 步骤 03「媒体模型目录格式无效」修复（2026-11-20）

## 现象
补充分镜后，卡片区提示：

> 媒体目录暂不可用：媒体模型目录格式无效，未开放生成。。已保存作品仍可查看，未提交媒体。

按钮里也没有「生成本场全部视频」。

## 根因
新版 `macro_arrangement.js::loadCatalog()`：

```js
const response = await api('/api/visual/macro/media/catalog?projectId=...');
if (!Array.isArray(response.models)) throw Error('媒体模型目录格式无效，未开放生成。');
```

我们的 handler 只回 `{ok, media:[], message: VIDEO_REQUIRED}`：

- **`models` 字段不存在** → 直接判定格式无效
- 也没有 `videoPricing/imagePricing/assets`，前端算不出价格、找不到参考图

所以分镜卡虽然保存成功，但媒体面板被整体关掉。

## 修法
`/api/visual/macro/media/catalog` 改为返回完整目录：

| 字段 | 来源 |
|---|---|
| `models[]` | `domain.pricing.visual_profile_defaults()['visualModels']`（image/video，带 `gatewayReady/enabled`） |
| `imagePricing[]` / `videoPricing[]` | 同一默认配置（1k/2k/4k/auto、480p/720p/1080p） |
| `assets[]` | 项目 settings.assets 中已有 `imageFile` 的资产，`imageReady=true`，带可预览 URL |
| `projectMediaDefaults` / `concurrency` / `videoRouteGroups` | 前端渲染所需的空/默认结构 |

保留 `media` 字段兼容旧调用方。

## 真机复验
浏览器跑完整链路（提取大纲 → 确认切分 → 确认报价 → 任务完成）后：

```
-- toasts -- []
-- workspaceFinal --
第 1 场 · 第一场：地下记忆当铺，夜
补齐分镜  生成本场全部视频  下载本场视频
```

媒体目录错误消失，「生成本场全部视频」按钮出现。

## 回归
355 tests OK（新增 `test_macro_media_catalog_has_models`）；规则 PASS；
首页 28 项 0 异常；前端契约缺口 0。

## 边界
这次补的是**目录/价格/参考图元数据**，让媒体面板开放并可核价。
真正生成视频仍走 `/api/visual/macro/media/submit`，需要上游视频管线配置；
未配置时该接口明确返回 501，不会假装生成成功。
