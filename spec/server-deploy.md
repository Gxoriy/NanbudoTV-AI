# 云端服务部署记录（horiy.fun · 实机）

更新时间：2026-11-16　|　状态：**已上线并跑通端到端**　|　代码：`server/`

## 0. 实机事实（和最初的假设不一样）

| 项 | 实际情况 |
|---|---|
| 机器 | `VM-0-12-opencloudos`，**OpenCloudOS 9.6（Linux）**，不是 Windows |
| 规格 | 4 vCPU / 3.5 GB（可用 ~1.8 GB）/ 磁盘 40G（用 55%） |
| 已有服务 | 宝塔面板(30662)、nginx(80/443)、PostgreSQL、Docker MySQL/Redis、自带 backend(18830) |
| Python | 3.11.6（原无 pip，已 `dnf install python3-pip`） |
| ffmpeg | 原无；`dnf` 装到 7.0.2 **但缺 libx264**（腾讯构建，非 GPL） |

> 站点 `horiy.fun` 由宝塔管理，配置在 `/www/server/panel/vhost/nginx/html_horiy.fun.conf`，
> 已 `include .../extension/horiy.fun/*.conf`。我们**不改宝塔生成的文件**，只往 extension 里加一段。

## 1. 部署结构

```
/opt/nanbudo-cloud/            代码（domain/ infra/ server/ requirements.txt）
/opt/nanbudo-cloud/venv/       Python venv（numpy 2.4.6 + opencv-python-headless 5.0.0）
/opt/nanbudo-cloud/config/     accounts.json + secret.txt（0800，仅本机）
/etc/systemd/system/nanbudo-cloud.service
/www/server/panel/vhost/nginx/extension/horiy.fun/nanbudo-cloud.conf   ← /api/v1/ 反代
```

服务只监听 `127.0.0.1:8787`，TLS 与体积限制由 nginx 承担。

## 2. 一次性命令（已执行）

```bash
# 依赖
dnf -y install python3-pip vulkan-loader ffmpeg
python3 -m venv /opt/nanbudo-cloud/venv
/opt/nanbudo-cloud/venv/bin/pip install numpy opencv-python-headless

# 代码
scp nanbudo-cloud.tar.gz root@horiy.fun:/tmp/ && tar -xzf /tmp/nanbudo-cloud.tar.gz -C /opt/nanbudo-cloud

# 账号（口令只打印一次；--password 供自动化）
cd /opt/nanbudo-cloud && ./venv/bin/python -m server.cli \
  --accounts config/accounts.json create-account CodeBuddy_Uers

# 启动
systemctl daemon-reload && systemctl enable --now nanbudo-cloud
```

## 3. nginx 片段（extension，宝塔模板不会覆盖）

```nginx
location ^~ /api/v1/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 64m;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_read_timeout 900s;
    proxy_send_timeout 900s;
}
```

证书沿用宝塔已有的 `/www/server/panel/vhost/cert/horiy.fun/{fullchain,privkey}.pem`。

## 4. 实测结果

```
GET  https://horiy.fun/api/v1/health      -> {"ok":true,"version":"1.0.0","queue":0}
POST /api/v1/auth/token                   -> 144 字符令牌
GET  /api/v1/whoami (Bearer)              -> CodeBuddy_Uers
本机内核 upload→quote(0 分)→submit→轮询    -> phase=done，1.0s
取回结果 GET /api/subtitle/media           -> 200，70 KB mp4
```

## 5. 已知限制与后续

1. **编码器**：已安装带 libx264 的静态构建到 `/opt/ffmpeg-static`，`/usr/local/bin/ffmpeg` 优先于系统版。
   同一段 1 秒 320×240 测试片：`mpeg4` 输出 70 KB → `libx264` 输出 **27 KB**（-61%）。服务已重启并生效。
2. **libopenh264 不能用**：它不接受 `-preset/-crf`，会直接 `Invalid argument` 退出（已从候选列表剔除）。
3. **单 worker**：4 核机器同时只跑一个编码任务；队列上限 8，超出返回 `503 busy`。
4. **内存**：1.8 GB 可用，720p 尚可，1080p 长片需观察；必要时加 swap 或换 x264 preset。

## 6. 前端与内核（2026-11-16 追加）

现有站点根目录是另一套页面（`index.html`、`download/` 等），**未覆盖**；新前端部署在子目录：

```
/www/wwwroot/horiy.fun/app/        504 个文件（static/ 全量）
systemd: nanbudo-kernel            127.0.0.1:8788（python -m app.main --no-gui）
kernel-data/subtitle-config.json   baseUrl + token（云端可用）
```

nginx 在同一 extension 片段里分流：

| 路径 | 上游 |
|---|---|
| `/api/v1/*` | 云端 8787（`location ^~`，优先） |
| `/api/*` | 内核 8788 |
| `/app/*` | 站点目录静态文件 |

实测：
```
https://horiy.fun/app/                     -> 200
https://horiy.fun/api/health               -> 内核，components 全 ok
https://horiy.fun/api/subtitle/capabilities -> configured=true（服务器侧内核已带令牌）
https://horiy.fun/api/v1/health            -> 云端 1.0.0
```

**注意**：网页版目前只有字幕域 + 系统域可用，其余域（视觉/配音/改写/电商…）仍是 `501 not_migrated`，
界面会显示接口错误；旧的登录/授权 UI 也会因 `/api/license/*` 未实现而报错。这是 P3 的进度问题，不是配置问题。

## 7. 运维

```bash
systemctl status nanbudo-cloud
journalctl -u nanbudo-cloud -n 50 --no-pager
cd /opt/nanbudo-cloud && ./venv/bin/python -m server.cli list-accounts
cd /opt/nanbudo-cloud && ./venv/bin/python -m server.cli set-password CodeBuddy_Uers
```

账号文件改动**无需重启**（`AccountStore` 按 mtime 热加载，本轮已修）。
