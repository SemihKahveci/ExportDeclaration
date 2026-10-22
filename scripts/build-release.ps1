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

# Paket veritabanı taşımaz. Müşterinin müşteri, GTİP, arşiv ve evrak kayıtları
# kurulum makinesindeki export-declaration volume'unda ve export-declaration-data
# klasöründe kalır. Admin ve Spark/Ollama ayarları build anındaki .env'den gelir.
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

$ReleaseEnvLines = @(
    "APP_VERSION=$Version",
    "SUPERADMIN_RESET_PASSWORD=false",
    "COMPOSE_PROJECT_NAME=export-declaration"
)
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
cd "$(dirname "$0")"
docker load -i ./images/export-declaration-images.tar

DATA_DIR="$(cd .. && pwd)/export-declaration-data"
mkdir -p "$DATA_DIR/uploads"
if grep -q '^EXPORT_DECLARATION_DATA_DIR=' .env 2>/dev/null; then
  grep -v '^EXPORT_DECLARATION_DATA_DIR=' .env > .env.tmp || true
  mv .env.tmp .env
fi
printf '\nEXPORT_DECLARATION_DATA_DIR=%s\n' "$DATA_DIR" >> .env

if ! find "$DATA_DIR/uploads" -type f -print -quit | grep -q .; then
  newest=""
  for candidate in ./data/uploads ../*/data/uploads; do
    [ -d "$candidate" ] || continue
    find "$candidate" -type f -print -quit | grep -q . || continue
    if [ -z "$newest" ] || [ "$candidate" -nt "$newest" ]; then
      newest="$candidate"
    fi
  done
  if [ -n "$newest" ]; then
    cp -a "$newest"/. "$DATA_DIR/uploads"/
    echo "Yüklenen dosyalar korundu: $newest"
  fi
fi

volume_empty() {
  if ! docker volume inspect "$1" >/dev/null 2>&1; then
    return 0
  fi
  if docker run --rm -v "$1:/data" mongo:8.0 bash -c 'find /data -mindepth 1 -print -quit' | grep -q .; then
    return 1
  fi
  return 0
}

restore_volume_if_empty() {
  target="$1"
  suffix="$2"
  if ! volume_empty "$target"; then
    return 0
  fi
  best=""
  best_time=""
  for name in $(docker volume ls --format '{{.Name}}'); do
    case "$name" in
      *"$suffix") ;;
      *) continue ;;
    esac
    if [ "$name" = "$target" ]; then
      continue
    fi
    if volume_empty "$name"; then
      continue
    fi
    created="$(docker volume inspect "$name" --format '{{.CreatedAt}}')"
    if [ -z "$best_time" ] || [ "$created" \> "$best_time" ]; then
      best="$name"
      best_time="$created"
    fi
  done
  if [ -n "$best" ]; then
    echo "Eski veritabanı aktarılıyor: $best -> $target"
    docker volume create "$target" >/dev/null
    docker run --rm -v "$best:/from" -v "$target:/to" mongo:8.0 bash -c 'cp -a /from/. /to/'
  fi
}

docker rm -f \
  export-declaration-frontend \
  export-declaration-idp-worker \
  export-declaration-backend \
  export-declaration-mongo \
  export-declaration-redis >/dev/null 2>&1 || true

restore_volume_if_empty export-declaration_mongo_data _mongo_data

docker compose up -d
docker compose ps
echo ""
echo "Müşteri verisi paket klasöründe değil, burada durur:"
echo "$DATA_DIR"
echo "docker compose down -v çalıştırmayın; bu komut veritabanını siler."
'@ | Set-Content "$ReleaseDir\\start.sh" -Encoding UTF8

@'
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
docker load -i .\images\export-declaration-images.tar
if ($LASTEXITCODE -ne 0) { throw "Docker image load başarısız." }

$DataDir = Join-Path (Split-Path $PSScriptRoot -Parent) "export-declaration-data"
New-Item -ItemType Directory -Force (Join-Path $DataDir "uploads") | Out-Null
$DataDirDocker = ($DataDir -replace '\\', '/')
$envPath = Join-Path $PSScriptRoot ".env"
$envLines = @(Get-Content $envPath | Where-Object { $_ -notmatch '^EXPORT_DECLARATION_DATA_DIR=' })
$envLines += "EXPORT_DECLARATION_DATA_DIR=$DataDirDocker"
Set-Content $envPath $envLines -Encoding UTF8

function Test-HasFile([string]$Path) {
  if (-not (Test-Path $Path)) { return $false }
  return $null -ne (Get-ChildItem $Path -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1)
}

$stableUploads = Join-Path $DataDir "uploads"
if (-not (Test-HasFile $stableUploads)) {
  $candidates = @()
  $localUploads = Join-Path $PSScriptRoot "data\uploads"
  if (Test-HasFile $localUploads) { $candidates += Get-Item $localUploads }
  Get-ChildItem (Split-Path $PSScriptRoot -Parent) -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $candidate = Join-Path $_.FullName "data\uploads"
    if (Test-HasFile $candidate) { $candidates += Get-Item $candidate }
  }
  $best = $candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($best) {
    Copy-Item (Join-Path $best.FullName "*") $stableUploads -Recurse -Force
    Write-Host "Yüklenen dosyalar korundu: $($best.FullName)"
  }
}

function Test-VolumeEmpty([string]$Name) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  docker volume inspect $Name *> $null
  if ($LASTEXITCODE -ne 0) {
    $ErrorActionPreference = $previous
    return $true
  }
  $found = docker run --rm -v "${Name}:/data" mongo:8.0 bash -c "find /data -mindepth 1 -print -quit"
  $ErrorActionPreference = $previous
  return [string]::IsNullOrWhiteSpace($found)
}

function Restore-VolumeIfEmpty([string]$Target, [string]$Suffix) {
  if (-not (Test-VolumeEmpty $Target)) { return }
  $best = $null
  $bestTime = ""
  foreach ($name in @(docker volume ls --format "{{.Name}}")) {
    if ($name -eq $Target -or -not $name.EndsWith($Suffix)) { continue }
    if (Test-VolumeEmpty $name) { continue }
    $created = docker volume inspect $name --format "{{.CreatedAt}}"
    if ($created -gt $bestTime) { $bestTime = $created; $best = $name }
  }
  if ($best) {
    Write-Host "Eski veritabanı aktarılıyor: $best -> $Target"
    docker volume create $Target | Out-Null
    docker run --rm -v "${best}:/from" -v "${Target}:/to" mongo:8.0 bash -c "cp -a /from/. /to/"
    if ($LASTEXITCODE -ne 0) { throw "Eski veritabanı aktarılamadı." }
  }
}

$previous = $ErrorActionPreference
$ErrorActionPreference = "Continue"
docker rm -f export-declaration-frontend export-declaration-idp-worker export-declaration-backend export-declaration-mongo export-declaration-redis *> $null
$ErrorActionPreference = $previous
Restore-VolumeIfEmpty "export-declaration_mongo_data" "_mongo_data"

docker compose up -d
if ($LASTEXITCODE -ne 0) { throw "Docker compose başlatılamadı." }
docker compose ps
Write-Host ""
Write-Host "Müşteri verisi paket klasöründe değil, burada durur:"
Write-Host $DataDir
Write-Host "docker compose down -v çalıştırmayın; bu komut veritabanını siler."
'@ | Set-Content "$ReleaseDir\\start.ps1" -Encoding UTF8

@"
ExportDeclaration $Version
Platform: $Platform

Bu paket boş bir kurulumla açılır. İçinde müşteri, GTİP, arşiv veya evrak yoktur.
Aynı makinede yeni paket açıldığında eski veriler korunur:

  - Veritabanı: Docker volume export-declaration_mongo_data
  - Yüklenen dosyalar: paketlerin bir üst klasöründeki export-declaration-data

İlk kurulum boştur. İkinci ve sonraki paketler aynı veriyi kullanır.
Eski sürüm klasöründeki veritabanı varsa açılış onu bir kez bu volume'a taşır.
docker compose down -v çalıştırmayın. Volume'u siler.

Superadmin ve Spark/Ollama ayarları build anındaki proje .env değerlerinden alınmıştır.

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
