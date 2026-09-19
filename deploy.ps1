$ErrorActionPreference = "Stop"

# Aeromagic Cloudflare deployment
# Run from the cloudflare folder:
#   powershell -ExecutionPolicy Bypass -File .\deploy.ps1

Write-Host "`n=== AEROMAGIC DEPLOY ===`n" -ForegroundColor Cyan

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  throw "Node.js/npm не найден."
}

npx wrangler whoami
if ($LASTEXITCODE -ne 0) {
  npx wrangler login
}

# Always validate that KV ID is not the placeholder.
$wrangler = Join-Path $PSScriptRoot "wrangler.toml"
$cfg = Get-Content $wrangler -Raw
if ($cfg -match 'ВСТАВТЕ_ID_NAMESPACE') {
  throw "KV namespace ещё не настроен. Сначала запустите .\setup-cloudflare.ps1"
}

Write-Host "Деплою Cloudflare Pages..." -ForegroundColor Yellow
Push-Location $PSScriptRoot
try {
  npx wrangler pages deploy . --project-name=aeromagic
  if ($LASTEXITCODE -ne 0) { throw "Cloudflare Pages deploy завершился с ошибкой." }
} finally {
  Pop-Location
}

Write-Host "`nДеплой завершён." -ForegroundColor Green
