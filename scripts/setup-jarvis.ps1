# One-time Jarvis setup: pulls the latest code, deploys the functions, asks for your three values, stores them as Supabase secrets and applies the database changes.
# Run it by double-clicking scripts\setup-jarvis.cmd. Your ElevenLabs key is typed hidden and is never written anywhere except Supabase's secret store (a temporary file is deleted at once).
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
function Step($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Run($exe, $argList) { & $exe @argList; if ($LASTEXITCODE -ne 0) { throw "$exe $($argList -join ' ') failed (exit $LASTEXITCODE)" } }

Step '1/6 Get the latest code'
Run 'git' @('pull', 'origin', 'claude/topmop-operations-app-fas1zc')

Step '2/6 Deploy the Telegram bot (so it can tell you your Telegram id)'
Run 'supabase.cmd' @('functions', 'deploy', 'telegram-webhook', '--no-verify-jwt')

Write-Host "`nNow open your PRIVATE chat with the company Telegram bot and send:  /myid" -ForegroundColor Yellow
$tg = Read-Host 'Type the number the bot answers with'
if ($tg -notmatch '^\d{5,}$') { throw 'That does not look like a Telegram id (digits only).' }
$voice = Read-Host 'ElevenLabs Voice ID (elevenlabs.io > Voices > your voice > copy ID)'
if ([string]::IsNullOrWhiteSpace($voice)) { throw 'The Voice ID is required.' }
$secure = Read-Host 'ElevenLabs API key (hidden)' -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if ([string]::IsNullOrWhiteSpace($key)) { throw 'The API key is required.' }
$addr = Read-Host 'How should Jarvis address you? (optional, press Enter to skip)'

Step '3/6 Save the secrets in Supabase'
$tmp = Join-Path $env:TEMP ("jarvis-" + [guid]::NewGuid().ToString('N') + '.env')
try {
  $lines = @("ELEVENLABS_API_KEY=$key", "ELEVENLABS_VOICE_ID=$voice", "JARVIS_OWNER_TELEGRAM_ID=$tg")
  if (-not [string]::IsNullOrWhiteSpace($addr)) { $lines += "JARVIS_ADDRESS=$addr" }
  Set-Content -Path $tmp -Value $lines -Encoding ascii
  Run 'supabase.cmd' @('secrets', 'set', '--env-file', $tmp)
} finally { if (Test-Path $tmp) { Remove-Item $tmp -Force }; $key = $null }

Step '4/6 Check the secrets Jarvis also needs'
$have = (& supabase.cmd secrets list) -join "`n"
foreach ($n in 'WEBHOOK_SECRET', 'TELEGRAM_BOT_TOKEN', 'ANTHROPIC_API_KEY') {
  if ($have -match $n) { Write-Host "  ok  $n" -ForegroundColor Green } else { Write-Host "  MISSING  $n  (set it with: supabase.cmd secrets set $n=...)" -ForegroundColor Red }
}

Step '5/6 Apply the database changes (answer Y when asked)'
Run 'supabase.cmd' @('db', 'push')

Step '6/6 Deploy Jarvis'
Run 'supabase.cmd' @('functions', 'deploy', 'jarvis', '--no-verify-jwt')

Write-Host "`nDone. In your private chat with the bot send:  /jarvis   -> it should answer 'Jarvis online. All systems nominal.'" -ForegroundColor Green
Write-Host "If a line above says MISSING, set that secret and run this script again." -ForegroundColor Yellow
