param(
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [Parameter(Mandatory = $true)]
    [ValidateSet("linux/amd64", "linux/arm64")]
    [string]$Platform
)

$ErrorActionPreference = "Stop"

# Proje kökü
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

$ReleaseRoot = Join-Path $Root "releases"

$PlatformName = $Platform.Replace("/", "-")

$ReleaseName = "ExportDeclaration-$Version-$PlatformName"
$ReleaseDir = Join-Path $ReleaseRoot $ReleaseName
$ImagesDir = Join-Path $ReleaseDir "images"
$DataDir = Join-Path $ReleaseDir "data"

$BackendImage = "export-declaration-backend:$Version"
$FrontendImage = "export-declaration-frontend:$Version"
$RedisImage = "redis:7-alpine"

Write-Host ""
Write-Host "Export Declaration release build" -ForegroundColor Cyan
Write-Host "Version : $Version"
Write-Host "Platform: $Platform"
Write-Host ""

# Eski release varsa temizle
if (Test-Path $ReleaseDir) {
    Write-Host "Eski release klasörü temizleniyor..."
    Remove-Item $ReleaseDir -Recurse -Force
}

New-Item -ItemType Directory -Force $ReleaseDir | Out-Null
New-Item -ItemType Directory -Force $ImagesDir | Out-Null
New-Item -ItemType Directory -Force $DataDir | Out-Null
New-Item -ItemType Directory -Force (Join-Path $DataDir "uploads") | Out-Null

Write-Host ""
Write-Host "Backend image build ediliyor..." -ForegroundColor Yellow

docker buildx build `
    --builder multiplatform `
    --platform $Platform `
    --load `
    -f "$Root\Dockerfile.backend" `
    -t $BackendImage `
    $Root

if ($LASTEXITCODE -ne 0) {
    throw "Backend Docker build başarısız."
}

Write-Host ""
Write-Host "Frontend image build ediliyor..." -ForegroundColor Yellow

docker buildx build `
    --builder multiplatform `
    --platform $Platform `
    --load `
    -f "$Root\Dockerfile.frontend" `
    --build-arg "VITE_API_BASE_URL=" `
    --build-arg "VITE_COMPANY_ID=$env:VITE_COMPANY_ID" `
    -t $FrontendImage `
    $Root

if ($LASTEXITCODE -ne 0) {
    throw "Frontend Docker build başarısız."
}

Write-Host ""
Write-Host "Mongo ARM image kontrol ediliyor..." -ForegroundColor Yellow

docker pull --platform $Platform mongo:8.0

if ($LASTEXITCODE -ne 0) {
    throw "Mongo image indirilemedi."
}

Write-Host "Redis image kontrol ediliyor..." -ForegroundColor Yellow

docker pull --platform $Platform $RedisImage

if ($LASTEXITCODE -ne 0) {
    throw "Redis image indirilemedi."
}

Write-Host ""
Write-Host "Docker image'ları export ediliyor..." -ForegroundColor Yellow

$ImageTar = Join-Path $ImagesDir "export-declaration-images.tar"

docker image save `
    --platform $Platform `
    -o $ImageTar `
    $BackendImage `
    $FrontendImage `
    mongo:8.0 `
    $RedisImage

if ($LASTEXITCODE -ne 0) {
    throw "Docker image export başarısız."
}

Write-Host ""
Write-Host "Release dosyaları hazırlanıyor..." -ForegroundColor Yellow

Copy-Item `
    "$Root\compose.release.yaml" `
    "$ReleaseDir\compose.yaml"

# Release, mevcut veritabanını taşımaz; ancak aynı admin ve aynı Spark/Ollama
# ayarlarıyla açılabilmesi için runtime config proje .env dosyasından alınır.
$ProjectEnvPath = Join-Path $Root ".env"
$ProjectEnv = @{}
if (Test-Path $ProjectEnvPath) {
    foreach ($rawLine in Get-Content $ProjectEnvPath) {
        $line = $rawLine.Trim()
        if (-not $line -or $line.StartsWith("#")) { continue }
        $separator = $line.IndexOf("=")
        if ($separator -lt 1) { continue }
        $ProjectEnv[$line.Substring(0, $separator).Trim()] = $line.Substring($separator + 1)
    }
}

function ReleaseValue([string]$Name, [string]$Default = "") {
    $processValue = [Environment]::GetEnvironmentVariable($Name)
    if ($null -ne $processValue -and $processValue -ne "") { return $processValue }
    if ($ProjectEnv.ContainsKey($Name)) { return [string]$ProjectEnv[$Name] }
    return $Default
}

$RequiredReleaseKeys = @(
    "AUTH_JWT_SECRET",
    "SUPERADMIN_EMAIL",
    "SUPERADMIN_PASSWORD",
    "SUPERADMIN_NAME",
    "INSTALLATION_COMPANY_ID"
)
foreach ($key in $RequiredReleaseKeys) {
    if ([string]::IsNullOrWhiteSpace((ReleaseValue $key))) {
        throw "Release için gerekli '$key' proje .env veya process environment içinde tanımlı değil."
    }
}

$ReleaseEnvKeys = @(
    "AUTH_JWT_SECRET", "SUPERADMIN_EMAIL", "SUPERADMIN_PASSWORD", "SUPERADMIN_NAME",
    "INSTALLATION_COMPANY_ID",
    "LLM_ENABLED", "LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL",
    "LLM_VISION_ENABLED", "LLM_VISION_MODEL", "LLM_VISION_MAX_PAGES",
    "LLM_VISION_MAX_IMAGE_BYTES", "LLM_TIMEOUT_MS",
    "MAIL_ENABLED", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER",
    "SMTP_PASS", "MAIL_FROM", "MAIL_FROM_NAME", "NEW_USER_NOTIFY_EMAIL"
)

$ReleaseEnvLines = @("APP_VERSION=$Version", "SUPERADMIN_RESET_PASSWORD=false")
foreach ($key in $ReleaseEnvKeys) {
    $value = (ReleaseValue $key) -replace "`r", "" -replace "`n", ""
    $ReleaseEnvLines += "$key=$value"
}
$ReleaseEnvLines | Set-Content "$ReleaseDir\\.env" -Encoding UTF8

$Version |
    Set-Content "$ReleaseDir\VERSION"

$Platform |
    Set-Content "$ReleaseDir\PLATFORM"

@'
#!/usr/bin/env sh
set -eu
docker load -i ./images/export-declaration-images.tar
docker compose up -d
docker compose ps
'@ | Set-Content "$ReleaseDir\\start.sh" -Encoding UTF8

@'
$ErrorActionPreference = "Stop"
docker load -i .\\images\\export-declaration-images.tar
if ($LASTEXITCODE -ne 0) { throw "Docker image load başarısız." }
docker compose up -d
if ($LASTEXITCODE -ne 0) { throw "Docker compose başlatılamadı." }
docker compose ps
'@ | Set-Content "$ReleaseDir\\start.ps1" -Encoding UTF8

@"
ExportDeclaration $Version
Platform: $Platform

Bu paket yeni/boş Mongo ve Redis volume'ları ile açılır; mevcut uygulama verileri taşınmaz.
Superadmin ve Spark/Ollama ayarları build anındaki proje .env/process environment değerlerinden alınmıştır.

macOS / Linux:
  chmod +x ./start.sh
  ./start.sh

Windows PowerShell:
  .\\start.ps1
"@ | Set-Content "$ReleaseDir\\START-HERE.txt" -Encoding UTF8

Write-Host ""
Write-Host "ZIP oluşturuluyor..." -ForegroundColor Yellow

$ZipPath = Join-Path $ReleaseRoot "$ReleaseName.zip"

if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
}

Compress-Archive `
    -Path "$ReleaseDir" `
    -DestinationPath $ZipPath `
    -CompressionLevel Optimal

Write-Host ""
Write-Host "Release başarıyla oluşturuldu." -ForegroundColor Green
Write-Host ""
Write-Host "Klasör:"
Write-Host $ReleaseDir
Write-Host ""
Write-Host "ZIP:"
Write-Host $ZipPath
Write-Host "NOT: Release .env admin/LLM/mail sırlarını içerir; paketi yalnız güvenilir alıcıyla paylaşın." -ForegroundColor Yellow
