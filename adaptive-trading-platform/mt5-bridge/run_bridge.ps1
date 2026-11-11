# Starts the MT5 bridge. Run from this folder in PowerShell on the Windows machine that runs MetaTrader 5.
$ErrorActionPreference = "Stop"
if (-not (Test-Path ".venv")) { py -3.12 -m venv .venv; .\.venv\Scripts\pip install -r requirements.txt }
if (-not (Test-Path ".env")) { throw "Copy .env.example to .env and set BRIDGE_SECRET first." }
Get-Content .env | Where-Object { $_ -match "^\s*[^#].*=" } | ForEach-Object {
  $k, $v = $_ -split "=", 2
  if ($v) { [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim(), "Process") }
}
.\.venv\Scripts\python bridge.py
