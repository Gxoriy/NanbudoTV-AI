"""复现「点生成参考图后资产全丢」：settings 保存是否抹掉 assets。

复现路径与真实前端一致：
1. 项目里有 3 个旧资产（没有 id）
2. 保存一次外观设置（只带 style，不带 assets）——之前这里会把 assets 抹空
3. 再提交参考图生成（本轮故意把图像模型置空，避免产生真实费用）

验收标准：
- 保存设置后 assets 仍为 3（不再清零）
- 生成接口不再返回 invalid_input（模型未配置时应是 503 model_unconfigured）
"""

from __future__ import annotations

import json
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
CARD = "DW-PWMB-AXYU-ASP8-C8H8-5X4P-ZSZW-RQ7G-QGTJ"
STEPS: list[dict] = []


def http(port, path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data,
                                 method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw.decode() or "{}")
        except json.JSONDecodeError:
            return exc.code, {}


def step(name, ok, detail=""):
    STEPS.append({"name": name, "ok": ok, "detail": detail})
    print(f"[{'OK  ' if ok else 'FAIL'}] {name:<32} {str(detail)[:110]}")


def main() -> int:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="assets-wipe-"))
    for name in ("llm-profiles.json",):
        source = ROOT / "data" / name
        if source.exists():
            shutil.copy2(source, tmp / name)
    # 复制真实模型配置后把图像 key 清空：验证不产生真实费用
    cfg = json.loads((ROOT / "data" / "model-config.json").read_text(encoding="utf-8"))
    cfg.setdefault("images", {})["apiKey"] = ""
    cfg["images"]["baseUrl"] = "http://127.0.0.1:1"
    (tmp / "model-config.json").write_text(json.dumps(cfg, ensure_ascii=False),
                                           encoding="utf-8")

    sys.path.insert(0, str(ROOT))
    from domain.license import LicenseStore
    from domain.license.service import DEFAULT_FEATURES

    store = LicenseStore(tmp / "license.db")
    store.import_card(CARD, days=0, features=DEFAULT_FEATURES, note="assets wipe")
    store.close()

    # 旧项目通过 API 造：先建项目，再写入"没有 id"的资产（模拟上一版本提取结果）
    proc = subprocess.Popen([sys.executable, "-m", "app.main", "--no-gui", "--port", "0",
                             "--data-dir", str(tmp)], cwd=str(ROOT),
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        port = None
        for _ in range(120):
            files = list(tmp.glob("runtime-*.json"))
            if files:
                port = json.loads(files[0].read_text(encoding="utf-8"))["port"]
                break
            time.sleep(0.3)
        print("[*] 端口", port)

        _, created = http(port, "/api/visual/project/create", "POST",
                          {"projectName": "旧资产项目", "createRequestId": "wipe-1"})
        pid = (created.get("project") or {}).get("id") or ""
        http(port, "/api/visual/settings", "POST", {
            "projectId": pid,
            "settings": {"assets": {"people": [{"name": "林晚"}, {"name": "陈默"},
                                              {"name": "快递员"}],
                                    "scenes": [], "props": []}},
        })
        _, body = http(port, f"/api/visual/project?id={pid}")
        people = ((body.get("project") or {}).get("assets") or {}).get("people") or []
        step("读取时补 id", len(people) == 3 and all(r.get("id") for r in people),
             f"ids={[r.get('id') for r in people]}")

        status, saved = http(port, "/api/visual/settings", "POST",
                             {"projectId": pid,
                              "settings": {"visualStyle": "live_action",
                                           "imageResolution": "2K"}})
        _, after = http(port, f"/api/visual/project?id={pid}")
        people2 = ((after.get("project") or {}).get("assets") or {}).get("people") or []
        step("保存设置后资产不丢", status == 200 and len(people2) == 3,
             f"status={status} n={len(people2)}")

        _, dbg = http(port, f"/api/visual/project?id={pid}")
        raw_rows = (((dbg.get("project") or {}).get("settings") or {})
                    .get("assets") or {}).get("people") or []
        print("[dbg] raw rows:", [(r.get("id"), r.get("name")) for r in raw_rows])
        status, submitted = http(port, "/api/visual/asset/generate", "POST", {
            "projectId": pid, "kind": "people",
            "assetId": "people-2", "prompt": "",
            "imageModel": "google/nano-banana", "tier": "economy",
            "imageResolution": "1k", "size": "1024x1024", "ratio": "16:9",
        })
        code = submitted.get("error") or ""
        step("生成不再 invalid_input", status != 400 and code != "invalid_input",
             f"status={status} code={code} msg={submitted.get('message') or ''}")

        _, final = http(port, f"/api/visual/project?id={pid}")
        people3 = ((final.get("project") or {}).get("assets") or {}).get("people") or []
        step("提交后资产仍为 3", len(people3) == 3, f"n={len(people3)}")

        failed = [row for row in STEPS if not row["ok"]]
        print(f"\n合计 {len(STEPS)} 步，失败 {len(failed)}")
        (ROOT / ".local" / "assets-wipe.json").write_text(
            json.dumps(STEPS, ensure_ascii=False, indent=1), encoding="utf-8")
        return 0 if not failed else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
