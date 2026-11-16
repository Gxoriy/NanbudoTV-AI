# 应用输出协议

仅输出完整 JSON 对象，三个数组始终存在；本段没有某类资产时用空数组。只输出人物、场景、物品，不返回剧本、分镜、视频卡、说话人对齐或生成指令。

```json
{
  "characters": [
    {
      "name": "原文规范名",
      "aliases": ["明确指向本人的原文称谓"],
      "variant": "",
      "description": "原文明示的身份与视觉事实",
      "storyFunction": "此人在本段具体做什么",
      "importanceReason": "需要独立参考的原因",
      "evidence": ["原文短引"],
      "appearsIn": ["第1集"]
    }
  ],
  "scenes": [
    {
      "name": "所属场所及具体功能区",
      "aliases": ["明确指向同一空间的原文简称"],
      "variant": "",
      "description": "原文空间、布局与可见陈设",
      "storyFunction": "本段在此发生的行动",
      "importanceReason": "需要保持空间一致的原因",
      "evidence": ["原文短引"],
      "appearsIn": ["第1集"]
    }
  ],
  "props": [
    {
      "name": "原文具体物品名称",
      "aliases": ["明确指向此物的原文简称"],
      "variant": "",
      "description": "原文外观、归属、状态与关键文字",
      "storyFunction": "物品参与的关键动作或信息展示",
      "importanceReason": "为何需要独立视觉资产",
      "evidence": ["原文短引"],
      "appearsIn": ["第1集"]
    }
  ]
}
```

示例仅说明字段结构，不规定资产数量，不是要复制的资产。可选字段 `identity` 是原文明示的身份或所属关系，用于区分同名实体，不是自行编造的 ID。`variant` 没有原文依据时为空。`aliases`、`evidence` 和 `appearsIn` 均为字符串数组，不返回自行发明的资产 ID。姓名、别名和描述不能包含应用内 `@` 引用语法；由应用保存资产后分配 ID。若原文完全不包含可视剧情，允许三个数组都为空，不编造资产凑数。
