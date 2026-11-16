"""TTS provider 抽象 + Windows SAPI 本地实现（P3-01）。

旧实现的配音走云端厂商（196 个音色），本机复现先用 SAPI：
  - 完全离线、零成本，够验证"分段合成 → 时间轴对齐 → 拼接"的整条链路
  - provider 是协议，后续接自建云端只需再加一个实现，pipeline 不用改

SAPI 通过 PowerShell 调用：Python 没有 System.Speech 绑定，而 PowerShell 自带。
文本走临时文件而不是命令行参数，避免中文/引号转义踩坑。
"""

from __future__ import annotations

import pathlib
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from typing import Protocol

SCRIPT = pathlib.Path(__file__).with_name("sapi.ps1")


class TTSError(RuntimeError):
    pass


@dataclass(frozen=True)
class VoiceInfo:
    id: str
    name: str
    culture: str
    gender: str

    def public(self) -> dict[str, object]:
        return {
            "id": self.id,
            "displayName": self.name,
            "source": "system",
            "languages": "中文（普通话）" if self.culture.lower().startswith("zh") else self.culture,
            "style": "本地合成",
            "age": "未知",
            "family": "SAPI 本地引擎",
            "sampleUrl": "",
            "synthesisReady": True,
        }


class TTSProvider(Protocol):
    def voices(self) -> list[VoiceInfo]: ...
    def synthesize(self, text: str, out_path: pathlib.Path, voice: str = "") -> pathlib.Path: ...


class SapiProvider:
    """Windows 内置语音合成。缺 PowerShell/语音包时抛 TTSError，由上层降级为 501。"""

    def __init__(self, powershell: str | None = None) -> None:
        self.powershell = powershell or shutil.which("powershell") or shutil.which("pwsh")
        self._cache: list[VoiceInfo] | None = None

    def available(self) -> bool:
        if not self.powershell or not SCRIPT.exists():
            return False
        try:
            return bool(self.voices())
        except TTSError:
            return False

    def voices(self) -> list[VoiceInfo]:
        if self._cache is not None:
            return self._cache
        if not self.powershell:
            raise TTSError("未找到 PowerShell，无法调用本地语音引擎。")
        script = (
            "Add-Type -AssemblyName System.Speech;"
            "(New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices()"
            " | ForEach-Object { $i=$_.VoiceInfo; "
            "\"$($i.Name)|$($i.Culture)|$($i.Gender)\" }"
        )
        proc = subprocess.run([self.powershell, "-NoProfile", "-Command", script],
                              capture_output=True, text=True, timeout=60)
        if proc.returncode != 0:
            raise TTSError(f"列举语音失败: {proc.stderr.strip()[:200]}")
        voices: list[VoiceInfo] = []
        for line in proc.stdout.splitlines():
            parts = [p.strip() for p in line.split("|")]
            if len(parts) >= 3 and parts[0]:
                voices.append(VoiceInfo(id=f"sapi:{parts[0]}", name=parts[0],
                                        culture=parts[1], gender=parts[2]))
        self._cache = voices
        return voices

    def synthesize(self, text: str, out_path: pathlib.Path, voice: str = "") -> pathlib.Path:
        if not text.strip():
            raise TTSError("待合成文本为空。")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False,
                                         encoding="utf-8") as handle:
            handle.write(text)
            text_file = handle.name
        name = voice.split(":", 1)[-1] if voice.startswith("sapi:") else voice
        try:
            proc = subprocess.run(
                [self.powershell or "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
                 "-File", str(SCRIPT), "-Voice", name, "-TextFile", text_file,
                 "-OutFile", str(out_path)],
                capture_output=True, text=True, timeout=180)
        finally:
            pathlib.Path(text_file).unlink(missing_ok=True)
        if proc.returncode != 0 or not out_path.exists() or out_path.stat().st_size < 1024:
            raise TTSError(f"合成失败: {(proc.stderr or '').strip()[:200]}")
        return out_path
