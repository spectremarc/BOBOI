param(
  [int]$Port = 5505,
  [string]$LogFile = "logs\boboi-tts.log"
)

$ErrorActionPreference = "Stop"

$env:BOBOI_TTS_PORT = [string]$Port
$env:BOBOI_TTS_LOG = (Join-Path (Get-Location) $LogFile)

New-Item -ItemType Directory -Force -Path (Split-Path $env:BOBOI_TTS_LOG) | Out-Null

Write-Host "Starting BOBOI TTS server..."
Write-Host "URL: http://127.0.0.1:$Port/tts"
Write-Host "Log: $env:BOBOI_TTS_LOG"

python tools\piper_tts_server.py
