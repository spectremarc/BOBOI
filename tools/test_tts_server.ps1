param(
  [string]$ServerUrl = "http://127.0.0.1:5505",
  [string]$Voice = "",
  [string]$Text = "Hello boboi. Piper text to speech test.",
  [string]$OutFile = "tts-test.wav"
)

$ErrorActionPreference = "Stop"

$baseUrl = $ServerUrl.TrimEnd("/")
if ($baseUrl.EndsWith("/tts")) {
  $baseUrl = $baseUrl.Substring(0, $baseUrl.Length - 4)
}

Write-Host "Checking TTS server at $baseUrl"

try {
  $status = Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/" -Method Get -TimeoutSec 5
  Write-Host "Status endpoint OK:" $status.StatusCode
  Write-Host $status.Content
} catch {
  Write-Error "Could not reach TTS server. Start it with: python tools\piper_tts_server.py"
}

try {
  $voices = Invoke-RestMethod -Uri "$baseUrl/voices" -Method Get -TimeoutSec 5
  if ($voices.voices) {
    Write-Host "Voices found:"
    $voices.voices | ForEach-Object { Write-Host "- $($_.id)" }
    if (-not $Voice) {
      $Voice = $voices.voices[0].id
      Write-Host "Using first voice:" $Voice
    }
  } else {
    Write-Warning "No voices returned by /voices."
  }
} catch {
  Write-Warning "/voices failed. You may be running an older TTS server. Stop it and restart: python tools\piper_tts_server.py"
}

$body = @{
  text = $Text
  voice = $Voice
} | ConvertTo-Json

Write-Host "Requesting audio..."
Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/tts" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 60 -OutFile $OutFile

$file = Get-Item $OutFile

Write-Host "Audio saved:" $file.FullName
Write-Host "Bytes:" $file.Length

if ($file.Length -lt 1000) {
  Write-Warning "Audio file is very small. TTS may not have generated correctly."
}
