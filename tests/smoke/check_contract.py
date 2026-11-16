"""新内核契约检查（每个阶段收口跑一次）。

把"新实现是否等价"变成可执行断言：
  - 与旧版真实样本比对的端点：状态码相同、顶层键是旧键的超集
  - 空库端点：响应体必须逐字段相等（如 /api/subtitle/capabilities）
  - 语义检查：未迁移 501、未配置报价 409、健康位存在

用法：python tests/smoke/check_contract.py
退出码 0 = 全过。
"""

from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
SAMPLES = ROOT / "spec" / "api-samples"
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests" / "smoke"))

# (path, 样本文件, 是否要求响应体完全相等)
KEYS_SUPERSET = [
    ("/api/health", "api_health.json", False),
    ("/api/tasks", "api_tasks.json", False),
    ("/api/model-profiles", "api_model-profiles.json", False),
    # capabilities 的 pricingMode 已按 ADR-008 改成 free，故只校验旧键覆盖
    ("/api/subtitle/capabilities", "api_subtitle_capabilities.json", False),
    # 授权状态：旧键必须一个不少（login.js 直接读 licensed/featureStatus）
    ("/api/license/status", "api_license_status.json", False),
]
EXACT = [
    ("/api/subtitle/list", "api_subtitle_list.json"),
    ("/api/subtitle/projects", "api_subtitle_projects.json"),
]


def http(port: int, path: str, method: str = "GET", body: bytes | None = None) -> tuple[int, dict]:
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=body,
                                 method=method,
                                 headers={"Content-Type": "application/json"} if body else {})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8") or "{}")


def http_raw(port: int, path: str, headers: dict[str, str] | None = None
             ) -> tuple[int, dict[str, str], bytes]:
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers), exc.read()


def check_subtitle_chain(port: int, failures: list[str]) -> None:
    """上传 → 媒体读取（含 Range）→ 本地去字幕轨 → 结果再读取，全走 HTTP。"""
    from mp4_fixture import build_mp4          # noqa: PLC0415
    from urllib.parse import quote

    data = build_mp4()
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/subtitle/upload", data=data, method="POST",
        headers={"X-Filename": quote("契约检查.mp4"),
                 "Content-Type": "application/octet-stream"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            uploaded = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        failures.append(f"上传失败: {exc.code} {exc.read()[:200]!r}")
        return

    record = uploaded.get("record") or {}
    ok = record.get("metadata", {}).get("duration") == 12.0 and record.get("phase") == "ready"
    print(f"    {'PASS' if ok else 'FAIL'} 上传 -> phase={record.get('phase')} "
          f"duration={record.get('metadata', {}).get('duration')}")
    if not ok:
        failures.append(f"上传结果异常: {record}")
        return

    rid, source = record["id"], record["sourceFile"]
    area = {"x": 0, "y": 80, "width": 100, "height": 20}

    status, body = http(port, "/api/subtitle/quote", "POST",
                        json.dumps({"id": rid, "quality": "standard",
                                    "region": area}).encode())
    quote = (body.get("record") or {}).get("quote") or {}
    ok = status == 200 and quote.get("estimatedPoints") == 0.0 and quote.get("pricingMode") == "free"
    print(f"    {'PASS' if ok else 'FAIL'} 免费报价 -> {status} "
          f"estimatedPoints={quote.get('estimatedPoints')}")
    if not ok:
        failures.append(f"免费报价异常: {status} {body}")
        return

    status, body = http(port, "/api/subtitle/submit", "POST",
                        json.dumps({"id": rid, "quality": "standard", "region": area,
                                    "quoteId": quote.get("quoteId"),
                                    "confirmed": True}).encode())
    ok = status == 409 and body.get("error") == "cloud_unconfigured"
    print(f"    {'PASS' if ok else 'FAIL'} 未配置云端提交 -> {status} {body.get('error')}")
    if not ok:
        failures.append(f"云端未配置语义异常: {status} {body}")
    status, headers, body = http_raw(port, f"/api/subtitle/media?id={rid}&file={source}")
    ok = status == 200 and len(body) == len(data) and headers.get("Accept-Ranges") == "bytes"
    print(f"    {'PASS' if ok else 'FAIL'} 媒体读取 200 {len(body)}B")
    if not ok:
        failures.append(f"媒体读取异常: {status} {len(body)}")

    status, headers, body = http_raw(
        port, f"/api/subtitle/media?id={rid}&file={source}", {"Range": "bytes=0-99"})
    ok = status == 206 and len(body) == 100 and "Content-Range" in headers
    print(f"    {'PASS' if ok else 'FAIL'} Range 206 {len(body)}B {headers.get('Content-Range')}")
    if not ok:
        failures.append(f"Range 异常: {status} {len(body)} {headers.get('Content-Range')}")

    status, _, _ = http_raw(port, f"/api/subtitle/media?id={rid}&file=../subtitle.db")
    ok = status == 404
    print(f"    {'PASS' if ok else 'FAIL'} 目录穿越被拒 -> {status}")
    if not ok:
        failures.append(f"目录穿越未被拦住: {status}")

    payload = json.dumps({"id": rid, "mode": "strip", "confirmed": True}).encode()
    status, body = http(port, "/api/subtitle/local-start", "POST", payload)
    ok = status == 200 and body.get("record", {}).get("phase") in ("local_preparing",
                                                                  "local_processing", "done")
    print(f"    {'PASS' if ok else 'FAIL'} 本地处理启动 -> {status} "
          f"{body.get('record', {}).get('phase')}")
    if not ok:
        failures.append(f"本地处理未启动: {status} {body}")

    final: dict = {}
    for _ in range(40):
        _, body = http(port, f"/api/subtitle/record?id={rid}")
        final = body.get("record") or {}
        if final.get("phase") in ("done", "error", "canceled"):
            break
        time.sleep(0.25)

    ok = final.get("phase") == "done" and bool(final.get("resultFile"))
    print(f"    {'PASS' if ok else 'FAIL'} 本地处理完成 -> {final.get('phase')} "
          f"{final.get('resultFile')}")
    if not ok:
        failures.append(f"本地处理未完成: {final.get('phase')} {final.get('error')}")
        return

    status, _, body = http_raw(
        port, f"/api/subtitle/media?id={rid}&file={final['resultFile']}")
    from domain.subtitle import mp4     # noqa: PLC0415
    ok = status == 200 and not mp4.probe(body)["hasSubtitle"]
    print(f"    {'PASS' if ok else 'FAIL'} 结果文件已无字幕轨 ({len(body)}B)")
    if not ok:
        failures.append("结果文件仍含字幕轨或不可读")


def upload(port: int, data: bytes, filename: str) -> dict:
    from urllib.parse import quote
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/subtitle/upload", data=data, method="POST",
        headers={"X-Filename": quote(filename),
                 "Content-Type": "application/octet-stream"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8")).get("record") or {}


def check_repair_chain(port: int, failures: list[str]) -> None:
    """真实可解码的小视频 → 本地像素修补（B 档）。无 ffmpeg/numpy 时要求 501 且说明原因。"""
    import shutil

    from domain.subtitle.repair import _ensure_ffmpeg_on_path
    _ensure_ffmpeg_on_path()
    with tempfile.TemporaryDirectory() as tmp:
        clip = pathlib.Path(tmp) / "clip.mp4"
        if shutil.which("ffmpeg") is None:
            print("    SKIP 本地像素修补（未安装 ffmpeg）")
            return
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-f", "lavfi",
             "-i", "testsrc2=s=320x240:r=10:d=1",
             "-vf", "drawbox=x=20:y=200:w=280:h=30:color=white@1:t=fill",
             "-pix_fmt", "yuv420p", str(clip)], check=True)
        record = upload(port, clip.read_bytes(), "repair.mp4")

    area = {"x": 0, "y": 80, "width": 100, "height": 20}
    status, body = http(port, "/api/subtitle/local-start", "POST",
                        json.dumps({"id": record.get("id"), "mode": "repair",
                                    "region": area, "confirmed": True}).encode())
    if status == 501:
        message = str(body.get("message", ""))
        ok = "ffmpeg" in message or "numpy" in message
        print(f"    {'PASS' if ok else 'FAIL'} 修补依赖缺失 -> 501 {message[:40]}")
        if not ok:
            failures.append(f"修补不可用但未说明原因: {body}")
        return
    if status != 200:
        failures.append(f"修补启动失败: {status} {body}")
        print(f"    FAIL 修补启动 -> {status} {body}")
        return

    final: dict = {}
    for _ in range(200):
        _, body = http(port, f"/api/subtitle/record?id={record['id']}")
        final = body.get("record") or {}
        if final.get("phase") in ("done", "error", "canceled"):
            break
        time.sleep(0.25)
    ok = final.get("phase") == "done" and bool(final.get("resultFile"))
    print(f"    {'PASS' if ok else 'FAIL'} 本地像素修补 -> {final.get('phase')} "
          f"{final.get('resultFile')} ({final.get('error') or 'ok'})")
    if not ok:
        failures.append(f"像素修补未完成: {final.get('phase')} {final.get('error')}")


def wait_port(data_dir: pathlib.Path, proc: subprocess.Popen, timeout: float = 40.0) -> int:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            raise SystemExit("内核提前退出，检查 .local/dev.err")
        files = list(data_dir.glob("runtime-*.json"))
        if files:
            try:
                return int(json.loads(files[0].read_text(encoding="utf-8"))["port"])
            except (json.JSONDecodeError, KeyError):
                pass
        time.sleep(0.4)
    raise SystemExit("等待端口超时")


def main() -> int:
    failures: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        data_dir = pathlib.Path(tmp)
        proc = subprocess.Popen(
            [sys.executable, "-m", "app.main", "--no-gui", "--port", "0",
             "--data-dir", str(data_dir)],
            cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        try:
            port = wait_port(data_dir, proc)
            print(f"[*] 内核端口 {port}")

            for path, sample, _ in KEYS_SUPERSET:
                status, body = http(port, path)
                expected = json.loads((SAMPLES / sample).read_text(encoding="utf-8"))
                old_keys = set(expected["body"])
                new_keys = set(body)
                missing = old_keys - new_keys
                ok = status == expected["status"] and not missing
                print(f"    {'PASS' if ok else 'FAIL'} {path:<32} status={status} "
                      f"缺键={sorted(missing) or '无'}")
                if not ok:
                    failures.append(f"{path} 缺键 {sorted(missing)} 或状态 {status}")

            for path, sample in EXACT:
                status, body = http(port, path)
                expected = json.loads((SAMPLES / sample).read_text(encoding="utf-8"))
                ok = status == expected["status"] and body == expected["body"]
                print(f"    {'PASS' if ok else 'FAIL'} {path:<32} 逐字段相等={body == expected['body']}")
                if not ok:
                    failures.append(f"{path} 与旧样本不一致: {body} != {expected['body']}")

            _, caps = http(port, "/api/subtitle/capabilities")
            ok = (caps.get("pricingMode") == "free"
                  and caps.get("prices") == {"standard": 0.0, "fine": 0.0})
            print(f"    {'PASS' if ok else 'FAIL'} 计费归零 pricingMode={caps.get('pricingMode')} "
                  f"prices={caps.get('prices')}")
            if not ok:
                failures.append(f"计费口径异常: {caps.get('pricingMode')} {caps.get('prices')}")

            status, body = http(port, "/api/subtitle/existing", "POST", b"{}")
            ok = status == 501 and body.get("error") == "not_migrated"
            print(f"    {'PASS' if ok else 'FAIL'} 未迁移路由 -> {status} {body.get('error')}")
            if not ok:
                failures.append(f"未迁移语义异常: {status} {body}")

            check_subtitle_chain(port, failures)
            check_repair_chain(port, failures)

            _, health = http(port, "/api/health")
            ok = "components" in health and health.get("ok") is True
            print(f"    {'PASS' if ok else 'FAIL'} 健康位 {list((health.get('components') or {}).keys())}")
            if not ok:
                failures.append(f"健康位缺失: {health}")

            http(port, "/api/shutdown", "POST", b"{}")
            proc.wait(timeout=10)
        finally:
            if proc.poll() is None:
                proc.kill()

    if failures:
        print(f"[FAIL] {len(failures)} 项")
        for item in failures:
            print("   -", item)
        return 1
    print("[PASS] 契约检查全过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
