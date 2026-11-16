# 决策记录（ADR）

按时间追加，不删改；推翻旧决策时新增一条并标注 supersedes。

---

## ADR-001 后端 265 条路由全部保留

- 日期：2026-11-16
- 背景：业务方无法判定哪些路由已废弃。
- 决策：全部 `status=active`；9 条前端零引用者只打 `orphan_backend` 标记与 `orphan_reason`，不降级。
- 后果：迁移期"宁留勿删"；若后续确认废弃，改 `route-spec.json` 的 `status` 即可，不动代码结构。

---

## ADR-002 前端基线入库并加指纹

- 日期：2026-11-16
- 决策：`_internal/static` 全量复制到 `static/`（504 文件 / 30.8 MB，代码 148 个），生成 `spec/static-manifest.json`（sha256）。
- 后果：P4 双轨有据可依；误改老页面可被指纹比对发现。

---

## ADR-003 卡密走 B：自建签发体系（supersedes 无）

- 日期：2026-11-16
- 背景取证（`app.pyc` 只读扫描，718 个 code object / 2697 条字符串）：
  - 客户端只有 `/api/license/{activate,refresh,status}` 三条调用，**0 个 PEM 块**、无 HMAC/验签逻辑、无 keygen 函数
  - `featureStatus` 每项带 `source:"admin"`，`hasStoredLicense` 由服务端回填
  - 结论：卡密由原厂服务端签发与校验，客户端仅缓存最近一次结果 + `license_watchdog` 复验
- 决策：**不复刻原厂签发链路**（私钥不在手上，本机无法生成原厂卡密），新版自建一套可离线验签的签发体系。
- 设计要点：
  | 项 | 方案 |
  |---|---|
  | 卡号 | `DW-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX`，随机 base32 + CRC 校验位（防手抖，不承担安全） |
  | 签发 | 服务端/离线工具用 **Ed25519 私钥**签 `[卡号, 权益集, 有效期, 绑定 deviceCode]` → compact token |
  | 客户端 | 只内嵌公钥做验签，**不具备签发能力**（防止被逆向后自制卡） |
  | 设备绑定 | 沿用 `DW-` 前缀的 `deviceCode`（本机已有样例：`DW-C4E39-4F2E2-7F3F7-E990A-21289`） |
  | 离线宽限 | 已验签 token 允许 7 天离线（对齐旧 `offlineUntil` 语义） |
  | 吊销 | 服务端撤销名单，客户端联网拉增量；离线期以本地名单为准 |
  | 迁移 | 老卡凭 `deviceCode + cardMask` 批量导入兑换（需老服务端导出或人工后台核对） |
- 后果：
  - `infra/security` 按"签发中心 + 验签器"两块实现，不再做"兼容老服务端"的只读分支
  - 旧 exe 的授权到期不影响新内核（新内核不依赖旧授权）
  - 需要在 P3-06 前拿到/生成一对 Ed25519 密钥，公钥随包分发，私钥只存在于签发工具侧

---

## ADR-004 catch-all 适配器不落地，改 501 兜底

- 日期：2026-11-16
- 背景：旧实现只剩字节码，`/api/` 本身 404 说明是"前缀 + 显式分支"，无法在新进程内运行时转发。
- 决策：未迁移路由统一 `501 {"error":"not_migrated","path":...}`。
- 后果：适配器只存在于规格层（`route-spec.json` + 冒烟基线），验收以基线比对为准。

---

## ADR-005 任务对外契约固定为 done/error + 0~100

- 日期：2026-11-16
- 背景：`static/*.js` 用 `['done','error','failed','canceled','cancelled'].includes(state)` 判终态，`progress` 直接塞进 `<progress>`（0~100）。
- 决策：内部状态用 `done`/`error`（不叫 succeeded/failed）；库存 0~1 比例，`Task.public()` 统一转 0~100 + camelCase；`interrupted` 对外呈现 `state=error, errorCode=interrupted, resumable=true`。
- 后果：P4-04 的响应兼容层提前到 P1；后续每个域都必须走同一套 `public()` 口径。

---

## ADR-006 `infra/store` 顺延到 P2-01 之后

- 日期：2026-11-16
- 背景：目录/命名抽象需要在真实业务域上验证，先建抽象容易建错。
- 决策：先做字幕域试点，拿到落盘形态后再抽 `infra/store`。
- 后果：P1 交付不含 `infra/store`；P2-01 的存储代码允许先内联在 `domain/subtitle`，抽公共层时再上移。

---

## ADR-007 本地视频处理不引入 ffmpeg，改用纯标准库拆 MP4

- 日期：2026-11-16
- 背景：实测旧版 `_internal` 无 ffmpeg/ffprobe/numpy/cv2，最大动态库是 libcrypto 与 python312.dll。说明其本地处理本就是纯 Python 拆 box。
- 决策：新内核 `domain/subtitle/mp4.py` 用标准库实现探测与独立字幕轨移除；不打包 ffmpeg。
- 后果：包体不增重、可单测；但只能删独立字幕轨，像素级擦除必须走云端（对应前端文案的承诺范围）。删轨时必须修补保留轨的 stco/co64 偏移（moov 变短导致 mdat 前移）。

---

## ADR-008 本地修补走 B 档、计费全部归零、云端只连自建服务

- 日期：2026-11-16
- 背景：擦除实测（`spec/erase-feasibility.md`）表明平滑背景可做到 51.8 dB，高频背景经典算法无解；项目定位为学习研究，不做商业盈利。
- 决策：
  1. 本地修补采用 **B 档**：ffmpeg 解码/编码 + `cv2.inpaint(TELEA)` + 时序一致 mask；UI 必须保留"可能留涂抹痕迹、不能还原真实背景"的告知。
  2. **计费规则全部置 0**：`pricingMode=free`、`prices={standard:0,fine:0}`，不冻结、不扣点、不产生订单；报价只用于确认选区。
  3. 云端去字幕只连**自建服务**（`horiy.fun`），客户端不内置任何第三方付费 API；未配置服务地址时明确提示，本地功能不受影响。
  4. 服务端证书/凭据在 `F:\Note\服务器`（证书、私钥、bundle、用户凭据），**不入库、不随包分发**。
- 后果：与旧版"按秒计费"彻底解耦，`usage.records/orders` 不再有金额语义；`capabilities.pricingMode` 由 `fixed_per_second` 改为 `free`，因此不再与旧样本逐字段相等，契约检查改为"旧键覆盖 + 显式 0 价"。

---

## ADR-009 服务端跑在 horiy.fun 的 Windows 上，账号沿用 `CodeBuddy_Uers`

- 日期：2026-11-16
- 取证：`F:\Note\服务器\CodeBuddy_Uers.txt` 实为 **SSH 公钥**（`ssh-rsa AAAA…`，394 字符），
  `CodeBuddy_Uers.pem` 是对应 RSA 私钥，即登录部署机的密钥对，**不是账号表**。
- 决策：
  1. 服务端直接跑在 horiy.fun 那台 Windows 上（`python -m server --port 8787`，计划任务常驻）；
  2. 账号名沿用 `CodeBuddy_Uers`，口令由 `server.cli create-account` 生成，PBKDF2(200k 轮) 加盐存储；
  3. 令牌为 HMAC-SHA256 自签（`base64(payload).base64(sig)`），默认 30 天，密钥 `server-config/secret.txt` 首次启动生成；
  4. TLS 由 nginx 终止，证书直接引用 `F:\Note\服务器` 下的文件，**不复制、不入库**；
  5. 服务端不存用户素材：请求体落临时目录 → 处理 → 立即删除。
- 后果：客户端只需 `baseUrl + token`；账号停用即刻使已签发令牌失效；换掉 secret 即全量吊销。

---

## ADR-010 云端实际部署在 OpenCloudOS（Linux），编码器降级策略

- 日期：2026-11-16
- 事实更正：horiy.fun 那台机器是 **OpenCloudOS 9.6（Linux）**，不是 Windows；
  宝塔面板 + nginx(80/443) + PostgreSQL + Docker MySQL/Redis 已在运行。
- 决策：
  1. 用 `systemd` 常驻（`nanbudo-cloud.service`，监听 127.0.0.1:8787），不改宝塔生成的 vhost，
     只在 `extension/horiy.fun/` 增加 `/api/v1/` 反代片段；
  2. 依赖走 `dnf`（python3-pip、ffmpeg、vulkan-loader）+ venv（numpy、opencv-python-headless）；
  3. 编码器按 `libx264 → mpeg4` 降级：该机 dnf 版 ffmpeg 缺 libx264，`mpeg4 -q:v 3` 保底可用；
     **libopenh264 不可用**（不接受 `-preset/-crf`，会 Invalid argument 退出）；
  4. 账号/口令热加载（文件 mtime 变更即重读），改账号不必重启。
- 后果：服务已上线并通过端到端联调；x264 静态构建装好后重启即自动切换，无需改代码。

---

## ADR-011 服务器只承载"必须云端"的能力，主项目留在本地

- 日期：2026-11-16
- 背景：此前把内核与前端也部署到了服务器，偏离方案 A 的原意（本地完整重建）。
- 决策：
  1. 服务器**只保留** `/api/v1/*` 去字幕云端服务（`nanbudo-cloud`）；
  2. 内核（`app.main`）、前端（`static/`）、全部业务域都只在本地 `F:\WorkAPP\NanbudoTV·AI` 运行；
  3. 已回退：停止并删除 `nanbudo-kernel.service`、删除 `/www/wwwroot/horiy.fun/app/`、移除 nginx `location /api/`。
- 后果：本地项目保持"可完整运行"的形态；服务器仅承担算力密集/需要联网的云端环节。
  后续如需网页访问，应通过"本地内核 + 隧道"而不是把内核搬上服务器。
