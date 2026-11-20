<#
.SYNOPSIS
    Build/verify entry for this project. There is no npm/Tauri toolchain:
    static/ is plain JS/CSS/HTML served directly by the Python kernel.

.EXAMPLE
    .\scripts\build.ps1                 # verify and write data/build-<commit>.json
    .\scripts\build.ps1 -Run            # verify, then start desktop kernel
    .\scripts\build.ps1 -Run -NoGui     # verify, then start headless HTTP kernel
    .\scripts\build.ps1 -NoTest         # only write the build stamp
#>
param(
    [switch]$Run,
    [switch]$NoGui,
    [switch]$NoTest,
    [int]$Port = 0
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$py = Join-Path $root '.venv\Scripts\python.exe'
if (-not (Test-Path $py)) {
    throw 'No .venv found. Run: python -m venv .venv; pip install -r requirements.txt'
}

Push-Location $root
try {
    Write-Host '[build] syntax check' -ForegroundColor Cyan
    & $py -m compileall -q app domain infra
    if ($LASTEXITCODE -ne 0) { throw 'compileall failed' }

    if (-not $NoTest) {
        Write-Host '[build] unit tests' -ForegroundColor Cyan
        & $py -m unittest discover -s tests
        if ($LASTEXITCODE -ne 0) { throw 'unit tests failed' }

        $checks = @('tools\check_rules.py', 'tools\front_contract_check.py')
        foreach ($check in $checks) {
            Write-Host ('[build] ' + $check) -ForegroundColor Cyan
            & $py $check
            if ($LASTEXITCODE -ne 0) { throw ($check + ' failed') }
        }
    }

    $code = "import json,time;from app import build_info;print(json.dumps({'commit':build_info.COMMIT,'codeHash':build_info.CODE_HASH,'builtAt':time.time()}))"
    $json = & $py -c $code
    $stamp = $json | ConvertFrom-Json
    $dataDir = Join-Path $root 'data'
    if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }
    $manifest = Join-Path $dataDir ('build-' + $stamp.commit + '.json')
    $stamp | ConvertTo-Json | Set-Content -Path $manifest -Encoding UTF8

    Write-Host ('[build] OK commit=' + $stamp.commit + ' codeHash=' + $stamp.codeHash) -ForegroundColor Green
    Write-Host ('[build] manifest: ' + $manifest) -ForegroundColor Green

    if ($Run) {
        $launch = @('-m', 'app.main', '--port', [string]$Port)
        if ($NoGui) { $launch += '--no-gui' }
        Write-Host ('[run] ' + $py + ' ' + ($launch -join ' ')) -ForegroundColor Cyan
        & $py @launch
    }
    else {
        Write-Host '[next] build.ps1 -Run -NoGui, then tools\which_code.py' -ForegroundColor DarkGray
    }
}
finally {
    Pop-Location
}
