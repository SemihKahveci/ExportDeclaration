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

Write-Host ""
Write-Host "Export Declaration release build" -ForegroundColor Cyan
Write-Host "Version : $Version"
Write-Host "Platform: $Platform"
Write-Host ""

if (-not $env:VITE_COMPANY_ID) {
    throw "VITE_COMPANY_ID tanımlı değil."
}

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
    --platform $Platform `
    --load `
    -f "$Root\Dockerfile.frontend" `
    --build-arg "VITE_API_BASE=" `
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

Write-Host ""
Write-Host "Docker image'ları export ediliyor..." -ForegroundColor Yellow

$ImageTar = Join-Path $ImagesDir "export-declaration-images.tar"

docker save `
    -o $ImageTar `
    $BackendImage `
    $FrontendImage `
    mongo:8.0

if ($LASTEXITCODE -ne 0) {
    throw "Docker image export başarısız."
}

Write-Host ""
Write-Host "Release dosyaları hazırlanıyor..." -ForegroundColor Yellow

Copy-Item `
    "$Root\compose.release.yaml" `
    "$ReleaseDir\compose.yaml"

"APP_VERSION=$Version" |
    Set-Content "$ReleaseDir\.env"

$Version |
    Set-Content "$ReleaseDir\VERSION"

$Platform |
    Set-Content "$ReleaseDir\PLATFORM"

Write-Host ""
Write-Host "ZIP oluşturuluyor..." -ForegroundColor Yellow

$ZipPath = Join-Path $ReleaseRoot "$ReleaseName.zip"

if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
}

Compress-Archive `
    -Path "$ReleaseDir\*" `
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