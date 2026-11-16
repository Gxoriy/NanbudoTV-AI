"""短剧改写工作台 · 重建内核。

分层约定（违反即 CI 失败）：
  app/main.py     入口：freeze_support、端口分配、线程、桌面壳
  app/api/        传输层：只做校验与转发，不含业务
  domain/         业务逻辑：不 import http.server，不碰磁盘细节
  infra/          基础设施：任务、模型网关、存储、安全
  runtimes/       重型可选运行时（torch / playwright）
"""

__version__ = "2.1.280+rebuild.1"
APP_NAME = "NanbudoTV·AI"
