$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$api = Join-Path $root 'services\api'
$web = Join-Path $root 'apps\web'
$python = Join-Path $api '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { $python = 'python' }

Push-Location $api
try { & $python -m pytest } finally { Pop-Location }

Push-Location $web
try {
  npm test -- --run
  npm run typecheck
  npm run build
} finally { Pop-Location }

Write-Host 'DevDocs AI checks passed.'
