"""基础设施层：不依赖 HTTP，不依赖前端。

  tasks/    SQLite(WAL) 任务队列与状态机
  llm/      provider 注册表（P1-03）
  store/    本地仓储抽象（P1-05）
  security/ 授权、计费、签名（P1-06 / P3-06）
  obs/      日志与健康位（P1-06）
"""
