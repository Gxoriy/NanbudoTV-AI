"""步骤 02 守卫自愈验收：历史项目（已有参考图、没有 workflowAssetSourceHash）。

验收标准：
1. GET /api/visual/project 对旧项目补出 workflowAssetSourceHash（并落库）
2. 再次读取仍然有值（落库成功），资产数量不变（参考图不丢）
3. 该值等于当前正文的 FNV-1a（与资产提取时写入的一致）
"""

from __future__ import annotations

import json
import pathlib
import shutil
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
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw.decode() or "{}")
        except json.JSONDecodeError:
            return exc.code, {}


def step(name, ok, detail=""):
    STEPS.append({"name": name, "ok": ok, "detail": detail})
    print(f"[{'OK  ' if ok else 'FAIL'}] {name:<34} {str(detail)[:110]}")


def fnv(text: str) -> str:
    value = 2166136261
    for char in text:
        value = ((value ^ ord(char)) * 16777619) & 0xFFFFFFFF
    return f"{value:08x}"


def main() -> int:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="asset-hash-"))
    for name in ("llm-profiles.json", "model-config.json"):
        s = ROOT / "data" / name
        if s.exists():
            shutil.copy2(s, tmp / name)
    sys.path.insert(0, str(ROOT))
    from domain.license import LicenseStore
    from domain.license.service import DEFAULT_FEATURES

    store = LicenseStore(tmp / "license.db")
    store.import_card(CARD, days=0, features=DEFAULT_FEATURES, note="asset hash")
    store.close()

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

        source = ("第一场 图书馆 日 内\n林晚把剧本推到周野面前。\n"
                  "第二场 图书馆 夜 内\n灯管坏了一根，雨声盖过翻页的声音。")
        _, created = http(port, "/api/visual/project/create", "POST",
                          {"projectName": "旧项目-已出参考图",
                           "createRequestId": "hash-1"})
        pid = (created.get("project") or {}).get("id") or ""
        http(port, "/api/visual/project/source", "POST",
             {"projectId": pid, "sourceText": source})
        # 模拟旧项目：有资产、有参考图，但没有 hash
        http(port, "/api/visual/settings", "POST",
             {"projectId": pid, "settings": {"assets": {
                 "people": [{"name": "林晚", "imageFile": "assets/a.png",
                             "status": "done"},
                            {"name": "陈默", "imageFile": "assets/b.png",
                             "status": "done"}],
                 "scenes": [{"name": "图书馆", "imageFile": "assets/c.png",
                             "status": "done"}],
                 "props": [{"name": "台灯", "imageFile": "assets/d.png",
                            "status": "done"}]}}})

        status, body = http(port, f"/api/visual/project?id={pid}")
        project = body.get("project") or {}
        got = project.get("workflowAssetSourceHash") or ""
        step("旧项目补出 hash", status == 200 and got == fnv(source),
             f"hash={got}")

        _, again = http(port, f"/api/visual/project?id={pid}")
        people = (((again.get("project") or {}).get("assets") or {})
                  .get("people")) or []
        step("落库后可重复读取", again.get("project", {})
             .get("workflowAssetSourceHash") == got, f"people={len(people)}")
        step("参考图未丢", len(people) == 2
             and all(r.get("imageFile") for r in people),
             f"files={[r.get('imageFile') for r in people]}")

        status, matched = http(port, f"/api/asset-library/matches?projectId={pid}")
        targets = matched.get("targets") or []
        existing = [r for r in targets if r.get("status") == "existing"]
        step("匹配弹窗识别全部资产", status == 200
             and len(targets) == int(matched.get("totalAssets") or 0)
             and len(existing) == len(targets),
             f"total={matched.get('totalAssets')} existing={len(existing)}")

        failed = [r for r in STEPS if not r["ok"]]
        print(f"\n合计 {len(STEPS)} 步，失败 {len(failed)}")
        (ROOT / ".local" / "asset-hash.json").write_text(
            json.dumps(STEPS, ensure_ascii=False, indent=1), encoding="utf-8")
        return 0 if not failed else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
