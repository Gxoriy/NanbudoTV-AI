<#
.SYNOPSIS
    启动 NanbudoTV·AI 重建版内核（桌面窗口或纯 HTTP）。

.EXAMPLE
    .\scripts\start.ps1                 # 开桌面窗口
    .\scripts\start.ps1 -NoGui          # 只起内核，端口写进 data\runtime-<pid>.json
    .\scripts\start.ps1 -DataDir D:\tmp\demo -Port 8899
#>
param(
    [switch]$NoGui,
    [string]$DataDir = "",
    [int]$Port = 0
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$py = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Host "[!] 未找到 .venv，先创建：python -m venv .venv" -ForegroundColor Yellow
    $py = "python"
}

# 注意：$args 是 PowerShell 自动变量，不能赋值，这里用 $launch
$launch = @("-m", "app.main", "--port", "$Port")
if ($NoGui) { $launch += "--no-gui" }
if ($DataDir) { $launch += @("--data-dir", $DataDir) }

# ffmpeg 兜底：代码里也会找 E:\PublicWork\ffmpeg\bin，这里保证子进程能拿到
$ff = "E:\PublicWork\ffmpeg\bin"
if ((Test-Path $ff) -and ($env:Path -notlike "*$ff*")) {
    $env:Path = "$ff;$env:Path"
}

Write-Host "[*] $py $($launch -join ' ')" -ForegroundColor Cyan
Push-Location $root
try {
    & $py @launch
}
finally {
    Pop-Location
}
