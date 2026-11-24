# 剧本改写生成失败：JSON 被截断 + 未知任务错误码（2026-11-24）

## 现象
`/api/source/proposals` 任务线程抛：

```
json.decoder.JSONDecodeError: Unterminated string starting at ...
AssistError: 模型连续 3 次没有返回合法 JSON: {"proposals":[...]
...
ValueError: 未知错误分类: bad_model_output
```

## 根因
### 1. 输出预算不足
`TextAssist` 默认 `max_tokens=900`，三条 proposal（title/hook/summary/
score/reason）很容易超限，返回 JSON 在字符串中间被截断。

### 2. 解析只取到第一个 `}`
`extract_json` 在失败后用 `re.search(r"\{.*\}", ...)`，贪婪匹配到**最后一个
存在的 `}`**，对截断文本常常只剩第一条 proposal，后面的对象被丢掉/无法补齐。

### 3. 错误码不在白名单
`TextAssist` 抛 `bad_model_output`，但 `TaskStore.fail` 只接受
`ERROR_CODES` 里的值（network/quota/internal…）→ 抛 `ValueError`，
线程二次崩溃，任务没有正常进入 error。

## 修法
- `TextAssist` 默认 `max_tokens` 900 → **3000**（三条 proposal 足够）
- `extract_json` 增加 `_repair_truncated_json()`：
  - 补全未闭合字符串
  - 按括号栈补齐 `}` / `]`
  - 优先修复**全文**，失败再退回正则匹配
- `_aux_task.runner` 捕获未知 `code` 时降级为 `internal`，
  原始 code 写进 `error_detail`，不再二次抛异常
- 新增 `tests/test_json_repair.py`，覆盖截断字符串/嵌套数组

## 验收
直接走真实 API（临时数据副本）：

```
started taskId=...
state done
result {'ok': True, 'proposals': [
  {'id':'A','title':'深海盲区：死讯接通时',...},
  {'id':'B','title':'终末频段：0号机械眷属',...},
  {'id':'C',...}], 'count': 3}
```

任务正常 done，不再 502/线程 traceback。

## 门禁
```
360 tests OK（新增 3 条截断 JSON 用例）
规则 R1-R5 PASS
前端契约缺口 0
首页 28 项 0 异常
8 域通道巡检 27/27 PASS
18 页点击审计 PASS
verify_all --with-ui：10 项全 PASS（8.4 分钟）
```
