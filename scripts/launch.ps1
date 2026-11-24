$ErrorActionPreference = 'Stop'
$avenfoldRoot = Split-Path $PSScriptRoot -Parent
$avenfoldNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (-not (Test-Path -LiteralPath $avenfoldNode)) { $avenfoldNode = (Get-Command node -ErrorAction Stop).Source }
try { $avenfoldReady = Invoke-RestMethod 'http://127.0.0.1:4317/api/health' -TimeoutSec 2 } catch { $avenfoldReady = $null }
if (-not $avenfoldReady.ok) {
    New-Item -ItemType Directory -Path (Join-Path $avenfoldRoot 'data') -Force | Out-Null
    Start-Process -FilePath $avenfoldNode -ArgumentList 'server.mjs' -WorkingDirectory $avenfoldRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $avenfoldRoot 'data\server.log') -RedirectStandardError (Join-Path $avenfoldRoot 'data\server-error.log')
    for ($avenfoldAttempt = 0; $avenfoldAttempt -lt 20; $avenfoldAttempt++) {
        Start-Sleep -Milliseconds 500
        try { $avenfoldReady = Invoke-RestMethod 'http://127.0.0.1:4317/api/health' -TimeoutSec 1; if ($avenfoldReady.ok) { break } } catch {}
    }
}
if (-not $avenfoldReady.ok) { throw 'Avenfold did not start. See data\server-error.log.' }
Start-Process 'msedge.exe' -ArgumentList 'http://127.0.0.1:4317'
