# 卡密签发与授权运维

代码：`domain/license/`、`app/api/license.py`、`tools/issue_card.py`
接口：`/api/license/{status,activate,refresh}`　|　计费：全部 0（ADR-008）

## 1. 设计（ADR-003 落地版）

| 项 | 实现 |
|---|---|
| 卡号 | `DW-` + 5 段 × 5 位（去 I/O 的 base32 字母表），共 28 字符 |
| 存储 | 库里只存 `sha256(规范化卡号)`，明文只在签发时打印一次 |
| 绑定 | 激活时绑到 `deviceCode`（`DW-XXXXX-…`）；同一设备换卡即换绑 |
| 设备码来源 | 请求头 `X-Device-Code` 优先，否则由 `IP+UA` 派生（网页版无需 Cookie） |
| 有效期 | `--days N` 或永久；到期后 `status=expired`，所有功能回到 locked |
| 吊销 | `--revoke`，立即对所有设备生效 |
| 计费 | `points/usage` 恒为 0，字段保留只为兼容旧前端 |

响应形状与旧版逐字段对齐（`spec/api-samples/api_license_status.json`），契约检查会校验旧键全覆盖。

## 2. 签发

```bash
cd /opt/nanbudo-cloud
./venv/bin/python tools/issue_card.py --db kernel-data/license.db --days 365 --note "学习组 A"
# 输出：卡密: DW-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX （只显示这一次）
```

永久卡：`--permanent`；限定功能：`--features rewrite,original`；吊销：`--revoke DW-…`

## 3. 激活与查询

```bash
curl -X POST https://horiy.fun/api/license/activate \
  -H "Content-Type: application/json" \
  -H "X-Device-Code: DW-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" \
  -d '{"cardKey":"DW-…"}'

curl https://horiy.fun/api/license/status
```

## 4. 实测

```
签发: DW-KL88E-P***-2VNWJ（365 天）
激活: licensed=true status=active days=365 cardMask=DW-KL88***2VNWJ
消息: 授权剩余约 365 天。
```

未激活设备返回 `status=none`、`licensed=false`，六个功能位全部 `locked`，前端可直接据此禁用按钮。

## 5. 注意

- 卡密库在服务器 `kernel-data/license.db`，**不要**提交到仓库；本机测试用 `<项目>/data/license.db`。
- 计费已归零，卡密只承担"功能开关 + 设备绑定"，不涉及任何金额。
- 旧版卡的格式（`DW-V9PG-…-96VK`，8 段）与本版（5 段）不同，旧卡无法直接激活；
  如需迁移，用旧卡的 `deviceCode` 人工核对后在服务器签发新卡即可。
