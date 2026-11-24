<#
.SYNOPSIS
    配置文本 / 视觉 / 封面三路 OpenAI 兼容接口（密钥只从环境变量读，不写入仓库）。

.EXAMPLE
    $env:NANBUDO_TEXT_BASE='https://new.api.edu.gr/v1'
    $env:NANBUDO_TEXT_KEY='mk-...'
    $env:NANBUDO_TEXT_MODEL='gpt-5-6-sol'
    $env:NANBUDO_VISION_BASE='http://127.0.0.1:18819/v1'
    $env:NANBUDO_VISION_KEY='eai-...'
    $env:NANBUDO_VISION_MODEL='gemini-3.1-pro'
    $env:NANBUDO_IMAGE_BASE='http://127.0.0.1:18807/v1'
    $env:NANBUDO_IMAGE_KEY='sk-...'
    $env:NANBUDO_IMAGE_MODEL='gpt_image_2'
    .\scripts\configure-ai.ps1
#>
param(
    [string]$TextBase = $env:NANBUDO_TEXT_BASE,
    [string]$TextKey = $env:NANBUDO_TEXT_KEY,
    [string]$TextModel = $env:NANBUDO_TEXT_MODEL,
    [string]$VisionBase = $env:NANBUDO_VISION_BASE,
    [string]$VisionKey = $env:NANBUDO_VISION_KEY,
    [string]$VisionModel = $env:NANBUDO_VISION_MODEL,
    [string]$ImageBase = $env:NANBUDO_IMAGE_BASE,
    [string]$ImageKey = $env:NANBUDO_IMAGE_KEY,
    [string]$ImageModel = $env:NANBUDO_IMAGE_MODEL
)

if (-not $TextKey -or -not $TextBase -or -not $TextModel) {
    throw 'Set NANBUDO_TEXT_BASE / NANBUDO_TEXT_KEY / NANBUDO_TEXT_MODEL first.'
}
if (-not $VisionKey -or -not $VisionBase -or -not $VisionModel) {
    throw 'Set NANBUDO_VISION_BASE / NANBUDO_VISION_KEY / NANBUDO_VISION_MODEL first.'
}
if (-not $ImageKey -or -not $ImageBase -or -not $ImageModel) {
    throw 'Set NANBUDO_IMAGE_BASE / NANBUDO_IMAGE_KEY / NANBUDO_IMAGE_MODEL first.'
}

$root = Split-Path -Parent $PSScriptRoot
$data = Join-Path $root 'data'

$llmPath = Join-Path $data 'llm-profiles.json'
$llm = Get-Content $llmPath -Raw | ConvertFrom-Json
if (-not $llm.custom) { $llm | Add-Member -NotePropertyName custom -NotePropertyValue @{} }
$llm.custom | Add-Member -NotePropertyName baseUrl -NotePropertyValue $TextBase -Force
$llm.custom | Add-Member -NotePropertyName apiKey -NotePropertyValue $TextKey -Force
$llm.custom | Add-Member -NotePropertyName model -NotePropertyValue $TextModel -Force
$llm.custom | Add-Member -NotePropertyName protocol -NotePropertyValue 'chat_completions' -Force
if (-not $llm.vision) { $llm | Add-Member -NotePropertyName vision -NotePropertyValue @{} }
$llm.vision | Add-Member -NotePropertyName baseUrl -NotePropertyValue $VisionBase -Force
$llm.vision | Add-Member -NotePropertyName apiKey -NotePropertyValue $VisionKey -Force
$llm.vision | Add-Member -NotePropertyName model -NotePropertyValue $VisionModel -Force
$llm | ConvertTo-Json -Depth 8 | Set-Content $llmPath -Encoding UTF8

$mcPath = Join-Path $data 'model-config.json'
$mc = Get-Content $mcPath -Raw | ConvertFrom-Json
if (-not $mc.images) { $mc | Add-Member -NotePropertyName images -NotePropertyValue @{} }
$mc.images | Add-Member -NotePropertyName protocol -NotePropertyValue 'openai' -Force
$mc.images | Add-Member -NotePropertyName baseUrl -NotePropertyValue $ImageBase -Force
$mc.images | Add-Member -NotePropertyName apiKey -NotePropertyValue $ImageKey -Force
$mc.images | Add-Member -NotePropertyName model -NotePropertyValue $ImageModel -Force
$mc.images | Add-Member -NotePropertyName size -NotePropertyValue '1024x1024' -Force
$mc.images | Add-Member -NotePropertyName timeout -NotePropertyValue 600 -Force
$mc | ConvertTo-Json -Depth 8 | Set-Content $mcPath -Encoding UTF8
Write-Host "[ok] text=$TextModel vision=$VisionModel image=$ImageModel" -ForegroundColor Green
