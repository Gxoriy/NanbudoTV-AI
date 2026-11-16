# 自建云端服务契约（horiy.fun）

客户端实现：`infra/cloud/client.py`　|　服务端实现：待建（`server/`）　|　计费：**全部免费**

## 1. 为什么是自建

ADR-008：项目定位学习研究，不做商业盈利，云端只承载"本地搞不定的高频背景擦除"。
因此不接入任何第三方付费视觉 API，服务端由我们自己部署在 `horiy.fun`。

## 2. 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/health` | 返回 `{"ok":true,"version":"...","queue":N}`，客户端探活 |
| POST | `/api/v1/subtitle/remove` | 去字幕主接口（见下） |

`POST /api/v1/subtitle/remove`

```
headers:
  Authorization: Bearer <token>         # 可空；服务端按配置决定是否校验
  X-Region:     {"x":0,"y":80,"width":100,"height":20}   # 整数百分比网格
  X-Quality:    standard | fine         # 仅影响算法档位，不影响价格（免费）
  Content-Type: application/octet-stream
body:
  原始视频字节（服务端上限 50 MB，超出返回 413）

200 -> 处理后的视频字节（video/mp4）
4xx/5xx -> {"error":"<code>","message":"<中文说明>"}
```

错误码约定（客户端据此分类，不重试）：

| code | 含义 |
|---|---|
| `unconfigured` | 服务端未配置模型/存储 |
| `invalid_input` | 选区非法、视频不可解码、超限 |
| `auth` | 令牌无效 |
| `busy` | 队列满，稍后重试 |
| `internal` | 服务端异常 |

## 3. 客户端配置

`data/subtitle-config.json`（不入库，示例见 `config/subtitle.example.json`）：

```json
{
  "modelName": "视频去字幕",
  "baseUrl": "https://horiy.fun",
  "token": "<服务端分发的访问令牌，可空>",
  "sourceSizeLimit": 52428800
}
```

未填 `baseUrl` → `capabilities.configured=false`，`submit` 返回 `409 cloud_unconfigured`，
本地移除字幕轨与像素修补完全不受影响。

## 4. 部署要点（服务端）

- 证书材料在 `F:\Note\服务器`：`horiy.fun_bundle.crt`、`horiy.fun.key`、`horiy.fun_bundle.pem`、`horiy.fun.csr`。
  **禁止**复制进本仓库或打进客户端安装包。
- `CodeBuddy_Uers.pem` / `CodeBuddy_Uers.txt` 疑似 SSH 私钥与账号清单，仅用于登录部署机，同样不入库。
- 建议形态：nginx（TLS 终止 + `client_max_body_size 64m`）→ 本仓库 `server/`（标准库 HTTP，端口 0 起，回写端口文件）→ 任务队列（复用 `infra/tasks` 的 SQLite 状态机范式）。
- 并发控制：同一时刻只跑 1 个重任务（CPU 推理），其余排队；`busy` 由队列长度决定。

## 5. 待办

1. `server/` 骨架：`/api/v1/health` + `/api/v1/subtitle/remove`（先接 cv2 同款算法，后续可换 LaMa）
2. 令牌签发与吊销（与 ADR-003 的卡密体系共用密钥材料）
3. 部署脚本 + systemd/计划任务 + 日志脱敏（复用 `infra/obs`）
