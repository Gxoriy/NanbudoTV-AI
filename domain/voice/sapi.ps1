param([string]$Voice, [string]$TextFile, [string]$OutFile)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$text = [IO.File]::ReadAllText($TextFile, [Text.Encoding]::UTF8)
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ($Voice) {
    try { $synth.SelectVoice($Voice) } catch { }
}
$synth.SetOutputToWaveFile($OutFile)
$synth.Speak($text)
$synth.Dispose()
