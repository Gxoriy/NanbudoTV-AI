"""跑自带前置状态的 UI 场景：登录门控 → 字幕 → 视觉 → 电商 → 音色。

与点击审计的区别：这里**必须经过卡密登录页**，并且按真实顺序操作（导入文件、
填原稿、建项目），能暴露"接口都对但状态断链"的问题。
"""

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
CARD = "DW-PWMB-AXYU-ASP8-C8H8-5X4P-ZSZW-RQ7G-QGTJ"


def safe(text: str, limit: int = 110) -> str:
    return str(text).encode("ascii", "replace").decode("ascii")[:limit]


def make_clip(target: pathlib.Path) -> bool:
    ffmpeg = shutil.which("ffmpeg") or r"E:\PublicWork\ffmpeg\bin\ffmpeg.exe"
    if not pathlib.Path(ffmpeg).exists() and shutil.which("ffmpeg") is None:
        return False
    data = target.parent / "clip.wav"
    # 先生成一段带"字幕条"的视频：白底 + 底部白字，便于 detect 命中
    cmd = [ffmpeg, "-v", "error", "-y",
           "-f", "lavfi", "-i", "color=c=black:s=640x360:d=3",
           "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono",
           "-vf", "drawbox=x=60:y=300:w=520:h=36:color=white@1.0:t=fill",
           "-t", "3", "-pix_fmt", "yuv420p", str(target)]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=120)
    except Exception as exc:  # noqa: BLE001
        print("[!] 生成测试视频失败:", safe(str(exc), 160))
        return False
    finally:
        data.unlink(missing_ok=True)
    return target.is_file()


def main() -> int:
    data_dir = pathlib.Path(tempfile.mkdtemp(prefix="ui-scenario-"))
    for name in ("llm-profiles.json", "model-config.json"):
        source = ROOT / "data" / name
        if source.exists():
            shutil.copy2(source, data_dir / name)

    # 真实用户库里这张卡是已导入的（卡密由我们签发），所以先写进临时授权库；
    # 错误卡仍然会被拒，登录门控照样能验证。
    sys.path.insert(0, str(ROOT))
    from domain.license import LicenseService, LicenseStore  # noqa: PLC0415
    from domain.license.service import DEFAULT_FEATURES  # noqa: PLC0415

    license_store = LicenseStore(data_dir / "license.db")
    license_store.import_card(CARD, days=0, features=DEFAULT_FEATURES,
                              note="UI 场景测试卡")
    license_store.close()

    clip = data_dir / "clip.mp4"
    has_clip = make_clip(clip)
    print(f"[*] 测试视频: {'ok' if has_clip else '跳过（无 ffmpeg）'} 数据目录 {data_dir}")

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
        print(f"[*] 端口 {port}（授权库是空的，先验证错误卡被拒）")

        result = subprocess.run(
            ["node", str(ROOT / "tools" / "ui_scenario.js"),
             f"http://127.0.0.1:{port}", CARD, str(clip) if has_clip else ""],
            cwd=str(ROOT), capture_output=True, timeout=900,
            encoding="utf-8", errors="replace")
        if result.returncode != 0:
            print("场景脚本失败:", safe((result.stderr or "")[-500:], 500))
            return 2
        report = json.loads(result.stdout)

        for step in report["steps"]:
            mark = "OK " if step["ok"] else "FAIL"
            detail = {k: v for k, v in step.items() if k not in ("name", "ok")}
            print(f"[{mark}] {safe(step['name'], 26)} {safe(json.dumps(detail, ensure_ascii=False), 150)}")
        print(f"\n[*] 失败步骤 {len(report['failures'])}: {report['failures']}")
        if report.get("consoleErrors"):
            print("[!] 控制台错误:", [safe(e, 80) for e in report["consoleErrors"]])
        (ROOT / ".local" / "ui-scenario.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
        urllib.request.urlopen(urllib.request.Request(
            f"http://127.0.0.1:{port}/api/shutdown", data=b"{}", method="POST"), timeout=10)
        return 0 if not report["failures"] else 3
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
