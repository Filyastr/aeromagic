$ErrorActionPreference = "Stop"

# Aeromagic Cloudflare one-time setup
# Run from the cloudflare folder:
#   powershell -ExecutionPolicy Bypass -File .\setup-cloudflare.ps1

Write-Host "`n=== AEROMAGIC CLOUDFLARE SETUP ===`n" -ForegroundColor Cyan

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  throw "Node.js/npm не найден. Установите Node.js LTS и запустите скрипт снова."
}

Write-Host "1) Проверяю авторизацию Cloudflare..." -ForegroundColor Yellow
npx wrangler whoami
if ($LASTEXITCODE -ne 0) {
  Write-Host "Откроется браузер для Cloudflare Login." -ForegroundColor Yellow
  npx wrangler login
}

$project = "aeromagic"
$kvName = "aeromagic"
$wrangler = Join-Path $PSScriptRoot "wrangler.toml"

Write-Host "`n2) Проверяю KV namespace '$kvName'..." -ForegroundColor Yellow
$json = npx wrangler kv namespace list --remote 2>$null
if ($LASTEXITCODE -ne 0) {
  # Older Wrangler may not accept --remote for this command.
  $json = npx wrangler kv namespace list 2>$null
}
$kvId = $null
try {
  $items = $json | ConvertFrom-Json
  foreach ($item in $items) {
    if ($item.title -eq $kvName) { $kvId = $item.id; break }
  }
} catch {}

if (-not $kvId) {
  Write-Host "KV не найден. Создаю..." -ForegroundColor Yellow
  $create = npx wrangler kv namespace create $kvName --remote
  if ($LASTEXITCODE -ne 0) { throw "Не удалось создать KV namespace." }

  # Wrangler prints: id = "..."
  $m = [regex]::Match(($create -join "`n"), 'id\s*=\s*"([^"]+)"')
  if ($m.Success) { $kvId = $m.Groups[1].Value }
}

if (-not $kvId) {
  # Final attempt: list and resolve after creation.
  $json = npx wrangler kv namespace list 2>$null
  try {
    $items = $json | ConvertFrom-Json
    foreach ($item in $items) {
      if ($item.title -eq $kvName) { $kvId = $item.id; break }
    }
  } catch {}
}

if (-not $kvId) {
  throw "KV namespace создан/найден, но его ID не удалось получить автоматически. Выполните: npx wrangler kv namespace list"
}

Write-Host "KV ID: $kvId" -ForegroundColor Green

Write-Host "`n3) Обновляю wrangler.toml..." -ForegroundColor Yellow
$content = Get-Content $wrangler -Raw
$content = [regex]::Replace($content, 'id\s*=\s*"[^"]*"', "id = `"$kvId`"")
Set-Content -Path $wrangler -Value $content -Encoding UTF8
Write-Host "wrangler.toml обновлён." -ForegroundColor Green

Write-Host "`n4) Создаю Pages project, если его ещё нет..." -ForegroundColor Yellow
$projects = npx wrangler pages project list 2>$null | Out-String
if ($projects -notmatch [regex]::Escape($project)) {
  npx wrangler pages project create $project --production-branch main
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Pages project не удалось создать автоматически. Если он уже существует, это можно игнорировать."
  }
}

Write-Host "`n5) Деплой сайта..." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot "deploy.ps1")

Write-Host "`n=== ГОТОВО ===" -ForegroundColor Green
Write-Host "KV: $kvName ($kvId)"
Write-Host "Дальше секреты можно добавить один раз через Cloudflare Dashboard или через wrangler secret put."
Write-Host "Для следующих обновлений используйте: .\deploy.ps1`n"
