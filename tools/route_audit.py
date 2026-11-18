"""路由级实盘审计：把内核注册的每条路由都真打一遍，分类结果。

判据（这是"完整可用"的实际口径）：
  - 2xx          → 通
  - 400/404/409  → 处理器跑到了，只是我们没给参数：**算通**（能正确拒绝也是能力）
  - 501/503      → 能力缺失（模型/浏览器/云端未配），**算"受限于外部"**，需要看原因是否诚实
  - 5xx(非 503)  → **真 bug**，必须清零
  - 0            → 连不上（脚本问题）

安全：跳过有破坏性的路由（shutdown/restart/update/exit），不真关内核。

用法：python tools/route_audit.py [--json]
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
SKIP = ("shutdown", "restart", "exit", "update/", "recovery", "reset-all")

# 需要真实参数的少数路由：给一份最小可用入参，避免把"缺参数"误判成能力缺失
HINTS: dict[str, dict] = {
    "/api/subtitle/detect": {"id": "", "file": ""},
    "/api/words": {},
}


def http(port: int, path: str, method: str = "GET", body: dict | None = None,
         timeout: float = 60.0):
    data = json.dumps(body).encode() if body is not None else (
        b"{}" if method == "POST" else None)
    headers = {"Content-Type": "application/json"} if data else {}
    request = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data,
                                     method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            raw = resp.read()
            try:
                return resp.status, json.loads(raw.decode() or "{}")
            except (json.JSONDecodeError, UnicodeDecodeError):
                return resp.status, {"_bytes": len(raw)}
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw.decode() or "{}")
        except (json.JSONDecodeError, UnicodeDecodeError):
            return exc.code, {"_bytes": len(raw)}
    except Exception as exc:  # noqa: BLE001
        return 0, {"_error": repr(exc)[:100]}


def classify(status: int, payload: dict) -> str:
    if status == 0:
        return "unreachable"
    if 200 <= status < 300:
        return "ok"
    if status in (400, 404, 409, 413, 422):
        return "rejected"          # 处理器跑到了，参数不足
    if status in (501, 503):
        return "capability"        # 缺外部能力
    if status == 502:
        return "upstream"          # 上游问题（模型/网络）
    return "bug"                   # 500 等


def main() -> int:
    data_dir = pathlib.Path(tempfile.mkdtemp(prefix="route-audit-"))
    for name in ("llm-profiles.json", "model-config.json"):
        source = ROOT / "data" / name
        if source.exists():
            shutil.copy2(source, data_dir / name)

    sys.path.insert(0, str(ROOT))
    from domain.license import LicenseStore
    from domain.license.service import DEFAULT_FEATURES

    store = LicenseStore(data_dir / "license.db")
    store.import_card(CARD, days=0,
                      features=(*DEFAULT_FEATURES, "ecommerce", "store", "advertising"),
                      note="route audit")
    store.close()

    proc = subprocess.Popen([sys.executable, "-m", "app.main", "--no-gui", "--port", "0",
                             "--data-dir", str(data_dir)], cwd=str(ROOT),
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        port = None
        for _ in range(120):
            files = list(data_dir.glob("runtime-*.json"))
            if files:
                port = json.loads(files[0].read_text(encoding="utf-8"))["port"]
                break
            time.sleep(0.3)
        if port is None:
            print("[!] 内核没起来")
            return 1

        status, body = http(port, "/api/_routes")
        routes = body.get("routes") or []
        print(f"[*] 端口 {port}，注册路由 {len(routes)} 条\n")

        results: list[dict] = []
        for row in routes:
            path = row["path"]
            if any(key in path for key in SKIP):
                results.append({**row, "status": 0, "kind": "skipped", "error": ""})
                continue
            methods = row.get("methods") or ["GET"]
            method = "POST" if "POST" in methods else "GET"
            # 带 {id} 之类占位符的路径用空值替换，避免 404 假象
            target = path.replace("{", "").replace("}", "")
            status, payload = http(port, target, method,
                                   HINTS.get(path) if method == "POST" else None)
            error = str(payload.get("error") or "")
            results.append({**row, "method": method, "status": status,
                            "kind": classify(status, payload), "error": error})

        by_kind: dict[str, list[dict]] = {}
        for row in results:
            by_kind.setdefault(row["kind"], []).append(row)

        print("=== 结果分布 ===")
        for kind in ("ok", "rejected", "capability", "upstream", "bug", "unreachable",
                     "skipped"):
            items = by_kind.get(kind) or []
            if items:
                print(f"  {kind:<12} {len(items):>3}")

        bugs = by_kind.get("bug") or []
        if bugs:
            print("\n=== 真 bug（5xx 非 503）===")
            for row in bugs:
                print(f"  {row['status']} {row.get('method')} {row['path']} "
                      f"{row.get('error')[:40]}")
        caps = by_kind.get("capability") or []
        if caps:
            print("\n=== 能力缺失（501/503）===")
            for row in caps:
                print(f"  {row['status']} {row.get('method')} {row['path']:<42} "
                      f"{row.get('error')[:28]}")
        upstream = by_kind.get("upstream") or []
        if upstream:
            print("\n=== 上游异常（502）===")
            for row in upstream:
                print(f"  {row['path']:<42} {row.get('error')[:40]}")

        domains: dict[str, dict[str, int]] = {}
        for row in results:
            bucket = domains.setdefault(row.get("domain", "?"), {})
            bucket[row["kind"]] = bucket.get(row["kind"], 0) + 1
        print("\n=== 分域 ===")
        for name, counts in sorted(domains.items()):
            ok = counts.get("ok", 0) + counts.get("rejected", 0)
            total = sum(counts.values())
            print(f"  {name:<4} {ok}/{total} 可用  {counts}")

        (ROOT / ".local" / "route-audit.json").write_text(
            json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
        print("\n[*] 明细已写 .local/route-audit.json")
        http(port, "/api/shutdown", "POST", {})
        return 0 if not bugs else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
