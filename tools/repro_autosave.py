"""验收"原稿自动保存"：接口契约 + 真浏览器复现，附可复现样本与截图。

用法：
  python tools/repro_autosave.py            # 跑一次，截图存 spec/samples/
  python tools/repro_autosave.py --api-only # 只验接口（秒级，无需 Playwright）

复现步骤（与用户现场一致）：
  登录 → 短剧项目中心 → 新建项目 → 在「全剧原稿」里粘贴样本正文 → 等自动保存
断言：无「自动保存未完成 / 正文不一致」提示，且 `project.confirmedScript` 等于刚保存的正文。
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
SAMPLE = ROOT / "spec" / "samples" / "source-sample.txt"
SHOT = ROOT / "spec" / "samples" / "autosave-ok.png"
API_ONLY = "--api-only" in sys.argv
steps: list[dict] = []


def http(port: int, path: str, method: str = "GET", body: dict | None = None,
         cookie: str = ""):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    headers["User-Agent"] = "autosave-repro"
    if cookie:
        headers["Cookie"] = cookie
    request = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data,
                                     method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=60) as resp:
            raw = resp.read()
            payload = json.loads(raw.decode() or "{}") if raw[:1] in (b"{", b"[") else {}
            return resp.status, payload, resp.headers
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw.decode() or "{}"), exc.headers
        except json.JSONDecodeError:
            return exc.code, {}, exc.headers


def step(name: str, ok: bool, detail: str = "") -> None:
    steps.append({"name": name, "ok": ok, "detail": detail})
    print(f"[{'OK  ' if ok else 'FAIL'}] {name:<30} {detail[:110]}")


def normalize(text: str) -> str:
    return (text or "").replace("\r\n", "\n").replace("\r", "\n").strip()


def api_contract(port: int, text: str) -> None:
    """接口契约：保存返回的 project.confirmedScript 必须等于正文（前端就是比这个）。"""
    status, body, _ = http(port, "/api/visual/project/create", "POST",
                           {"projectName": "自动保存-接口验收",
                            "createRequestId": "autosave-api"})
    project = (body.get("project") or {})
    project_id = project.get("id", "")
    step("project/create", status == 200 and bool(project_id), project_id[:8])

    status, saved, _ = http(port, "/api/visual/project/source", "POST",
                            {"projectId": project_id, "sourceText": text})
    returned = str((saved.get("project") or {}).get("confirmedScript") or "")
    step("保存返回带 confirmedScript", bool(returned), f"{len(returned)} 字")
    step("正文一致（前端判定）", normalize(returned) == normalize(text),
         "一致" if normalize(returned) == normalize(text)
         else f"不一致: 返回 {len(returned)} 字 / 输入 {len(text)} 字")

    status, got, _ = http(port, f"/api/visual/project?id={project_id}")
    reread = str((got.get("project") or {}).get("confirmedScript") or "")
    step("重新读取仍能恢复正文", normalize(reread) == normalize(text), f"{len(reread)} 字")


def ui_flow(port: int) -> None:
    result = subprocess.run(
        ["node", str(ROOT / "tools" / "ui_autosave.js"),
         f"http://127.0.0.1:{port}", CARD, str(SAMPLE), str(SHOT)],
        cwd=str(ROOT), capture_output=True, encoding="utf-8", errors="replace",
        timeout=420)
    raw = (result.stdout or "").strip()
    try:
        report = json.loads(raw)
    except json.JSONDecodeError:
        step("浏览器流程", False, (raw or result.stderr or "")[:180])
        return
    for item in report.get("steps") or []:
        step(f"UI {item['name']}", bool(item["ok"]), str(item.get("detail") or ""))
    if report.get("shot"):
        step("截图已保存", pathlib.Path(report["shot"]).is_file(), report["shot"])


def main() -> int:
    if not SAMPLE.is_file():
        print("[!] 缺少样本:", SAMPLE)
        return 1
    text = SAMPLE.read_text(encoding="utf-8")

    data_dir = pathlib.Path(tempfile.mkdtemp(prefix="autosave-"))
    for name in ("llm-profiles.json", "model-config.json"):
        source = ROOT / "data" / name
        if source.exists():
            shutil.copy2(source, data_dir / name)
    sys.path.insert(0, str(ROOT))
    from domain.license import LicenseStore
    from domain.license.service import DEFAULT_FEATURES

    store = LicenseStore(data_dir / "license.db")
    store.import_card(CARD, days=0, features=DEFAULT_FEATURES, note="autosave repro")
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
            print("[!] 内核未启动")
            return 1
        print(f"[*] 端口 {port}  样本 {SAMPLE.name}（{len(text)} 字）\n")

        api_contract(port, text)
        if not API_ONLY:
            ui_flow(port)

        failed = [row for row in steps if not row["ok"]]
        print(f"\n合计 {len(steps)} 步，失败 {len(failed)}")
        if failed:
            for row in failed:
                print("  -", row["name"], row["detail"][:120])
        (ROOT / ".local" / "autosave-repro.json").write_text(
            json.dumps(steps, ensure_ascii=False, indent=1), encoding="utf-8")
        return 0 if not failed else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
