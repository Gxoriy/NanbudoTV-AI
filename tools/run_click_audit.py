"""起内核（带真实模型配置）→ 逐页点击审计 → 汇总失败点。"""

from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
# 启动门控上线后，浏览器需要先登录；这张卡会被激活到审计用的浏览器 UA 上
CARD = "DW-PWMB-AXYU-ASP8-C8H8-5X4P-ZSZW-RQ7G-QGTJ"


def safe(text: str, limit: int = 100) -> str:
    return str(text).encode("ascii", "replace").decode("ascii")[:limit]


def main() -> int:
    data_dir = pathlib.Path(tempfile.mkdtemp(prefix="click-audit-"))
    for name in ("llm-profiles.json", "model-config.json", "license.db"):
        source = ROOT / "data" / name
        if source.exists():
            shutil.copy2(source, data_dir / name)

    proc = subprocess.Popen([sys.executable, "-m", "app.main", "--no-gui", "--port", "0",
                             "--data-dir", str(data_dir)], cwd=str(ROOT),
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        port = None
        for _ in range(100):
            files = list(data_dir.glob("runtime-*.json"))
            if files:
                port = json.loads(files[0].read_text(encoding="utf-8"))["port"]
                break
            time.sleep(0.3)
        if port is None:
            print("内核未启动")
            return 1
        print(f"[*] 端口 {port}")

        result = subprocess.run(
            ["node", str(ROOT / "tools" / "ui_click_audit.js"),
             f"http://127.0.0.1:{port}", "20", CARD],
            cwd=str(ROOT), capture_output=True, timeout=1200,
            encoding="utf-8", errors="replace")
        if result.returncode != 0:
            print("审计脚本失败:", safe((result.stderr or "")[-400:], 400))
            return 2

        report = json.loads(result.stdout)
        failures_total = 0
        for page in report:
            page_failures = [b for b in page.get("buttons", []) if b["failures"] or b["console"]]
            print(f"\n=== {page['page']} 点击 {len(page.get('buttons', []))} 个 失败 {len(page_failures)} ===")
            if page.get("loadErrors"):
                print("  加载期失败:")
                for call in page["loadErrors"][:4]:
                    print(f"    {call['status']} {safe(call['url'], 46)} {safe(call['body'], 50)}")
            for item in page_failures:
                failures_total += 1
                print(f"  [按钮] {safe(item['label'], 22)} 调用 {item['calls']} "
                      f"clickErr={safe(item['clickError'], 30) or '-'}")
                for call in item["failures"]:
                    print(f"      {call['status']} {safe(call['url'], 44)} {safe(call['body'], 60)}")
                for line in item["console"]:
                    print(f"      console: {safe(line, 90)}")
        print(f"\n合计失败点 {failures_total}")
        (ROOT / ".local" / "click-audit.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
        urllib.request.urlopen(urllib.request.Request(
            f"http://127.0.0.1:{port}/api/shutdown", data=b"{}", method="POST"), timeout=10)
        return 0
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)
        # 保留 data_dir 便于复查
        print(f"[*] 数据目录 {data_dir}")


if __name__ == "__main__":
    raise SystemExit(main())
