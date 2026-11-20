<#
.SYNOPSIS
    把文本/图像/视频上游统一到 api.lk888.ai（密钥从环境变量读，不入库）。

.EXAMPLE
    $env:NANBUDO_UPSTREAM_KEY='sk-...'
    .\scripts\configure-upstream.ps1
#>
param([string]$Key = $env:NANBUDO_UPSTREAM_KEY)

if (-not $Key) { throw 'Set $env:NANBUDO_UPSTREAM_KEY first.' }
$root = Split-Path -Parent $PSScriptRoot
$data = Join-Path $root 'data'
$base = 'https://api.lk888.ai'

$llmPath = Join-Path $data 'llm-profiles.json'
$llm = Get-Content $llmPath -Raw | ConvertFrom-Json
if (-not $llm.custom) { $llm | Add-Member -NotePropertyName custom -NotePropertyValue @{} }
$llm.custom | Add-Member -NotePropertyName baseUrl -NotePropertyValue ($base + '/v1') -Force
$llm.custom | Add-Member -NotePropertyName apiKey -NotePropertyValue $Key -Force
$llm.custom | Add-Member -NotePropertyName model -NotePropertyValue 'qwen4-max' -Force
$llm.custom | Add-Member -NotePropertyName protocol -NotePropertyValue 'chat_completions' -Force
$llm | ConvertTo-Json -Depth 8 | Set-Content $llmPath -Encoding UTF8

$mcPath = Join-Path $data 'model-config.json'
$mc = Get-Content $mcPath -Raw | ConvertFrom-Json
$mc.images | Add-Member -NotePropertyName protocol -NotePropertyValue 'aihub' -Force
$mc.images | Add-Member -NotePropertyName baseUrl -NotePropertyValue $base -Force
$mc.images | Add-Member -NotePropertyName apiKey -NotePropertyValue $Key -Force
$mc.images | Add-Member -NotePropertyName model -NotePropertyValue 'banana-pro' -Force
$mc.images | Add-Member -NotePropertyName resolution -NotePropertyValue '1K' -Force
$mc.images.PSObject.Properties.Remove('fallback')
$mc.videos | Add-Member -NotePropertyName baseUrl -NotePropertyValue $base -Force
$mc.videos | Add-Member -NotePropertyName apiKey -NotePropertyValue $Key -Force
$mc.videos | Add-Member -NotePropertyName model -NotePropertyValue 'seedance-2.0-anci' -Force
$mc | ConvertTo-Json -Depth 8 | Set-Content $mcPath -Encoding UTF8
Write-Host '[ok] text=qwen4-max image=banana-pro video=seedance-2.0-anci @ api.lk888.ai' -ForegroundColor Green
