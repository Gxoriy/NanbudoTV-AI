# P2 字幕域试点 · 进度报告

日期：2026-11-16　|　测试：**81 passed**（venv，含 cv2）　|　门禁：**PASS**　|　契约检查：**19/19 PASS**

## 1. 完成情况

| 任务 | 状态 | 产物 |
|---|---|---|
| P2-01 选区契约 / 阶段词表 / 记录存储 | ✅ | `domain/subtitle/{region,models,store}.py` |
| P2-02 导入 / 媒体读取（Range）/ 移除独立字幕轨 | ✅ | `domain/subtitle/mp4.py` |
| P2-02b 本地像素修补（**B 档**） | ✅ | `domain/subtitle/repair.py` |
| P2-03 计费 | ✅ 归零 | `pricingMode=free`、`prices={0,0}`、无冻结/扣点 |
| P2-04 云端去字幕（自建服务） | ✅ 客户端+服务端均就绪 | `infra/cloud/`、`server/`、`spec/cloud-api.md`、`spec/server-deploy.md` |
| P2-05 字幕候选检测 `detect` | ✅ 本地 cv2 多帧聚类 | `domain/subtitle/detect.py` |
| S2 授权三件套 `/api/license/{status,activate,refresh}` | ✅ 自建签发 + 设备绑定 | `domain/license/`、`tools/issue_card.py`、`spec/license-ops.md` |
| 前端上线 `/app/` + 内核服务 | ✅ 公网可访问 | 见 `spec/server-deploy.md` |
| `existing`、`import-existing`、`resume`、`stop` | ⬜ 501 兜底 | — |

## 2. 端到端实测（`tests/smoke/check_contract.py`，真起进程）

```
上传 -> phase=ready duration=12.0
免费报价 -> 200 estimatedPoints=0.0
未配置云端提交 -> 409 cloud_unconfigured
媒体读取 200 664B        Range 206 100B
本地去字幕轨 -> done results/…-strip.mp4（结果无字幕轨）
本地像素修补 -> done results/…-repair.mp4
```

## 3. 本轮三个关键实现点

### 3.1 像素修补必须用 ROI + 时序 mask

- 只在字幕带 ROI 内 inpaint（全画面会白算 90% 像素）
- mask 需要"最近 N 帧至少命中 M 次"，否则逐帧阈值会把高光噪点当文字：实测同一算法下 mask 质量差 7.5 dB，耗时从 17 ms 涨到 92 ms/帧
- `np.frombuffer` 是只读视图，回写修补结果前必须 `.copy()`（本轮实际踩到）

### 3.2 进程收尾要统一，否则留僵尸与半成品

解码/编码两个 ffmpeg 子进程，取消或异常时必须一起 kill、关管道、删半成品文件。
`_abort()` 统一处理；成功路径也要关 `decoder.stdout`（否则 ResourceWarning 一串）。

### 3.3 计费归零不是"把价格改成 0"

- `quote` 不再受"未配置"限制（免费功能不需要价格与密钥），只校验选区与记录
- `submit` 才要求云端地址，未配置时 `409 cloud_unconfigured` 并提示本地可用
- `capabilities` 增加 `localRepair` 可用性标记，缺 ffmpeg/numpy 时前端可禁用按钮
- 与旧样本的等价性目标放弃逐字段相等（`pricingMode` 语义变了），改为"旧键全覆盖 + 显式 0 价"

## 4. 依赖与环境

| 组件 | 版本 | 位置 |
|---|---|---|
| ffmpeg / ffprobe | 9.0.2 | `E:\PublicWork\ffmpeg\bin`（用户 PATH 已写） |
| numpy / opencv-python | 2.5.5 / 5.0.0 | `F:\WorkAPP\NanbudoTV·AI\.venv` |

主内核仍只依赖标准库；cv2/numpy 只在像素修补路径按需导入，缺失时返回 501 并说明原因。

**测试要用 venv 解释器**（否则 cv2 缺失，修补用例走 501 分支）：
```powershell
$env:Path += ';E:\PublicWork\ffmpeg\bin'
.\.venv\Scripts\python.exe -m unittest discover -s tests
.\.venv\Scripts\python.exe tests\smoke\check_contract.py
```

## 5. 下一步

1. **服务端**：按 `spec/cloud-api.md` 建 `server/`（health + remove + 队列），部署到 horiy.fun，证书用 `F:\Note\服务器` 里的材料
2. `detect`：字幕候选检测（时序一致 + 形态学），把选区从"手填"变成"自动推荐"
3. 前端：把 `localRepair` 与免费文案接进 `subtitle_removal245.js`（P4 双轨）
