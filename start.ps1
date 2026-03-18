# CATEST Rapid Launch Script (Development Mode)
# Shared Environment & Microservices Orchestrator

$ErrorActionPreference = "Stop"
$RootDir = Get-Location

# ─── Environment & Toolchain ──────────────────────────────────────────────────
$Env:PATH = "C:\Program Files\Git\usr\bin;$Env:PATH"
$Env:CMAKE_POLICY_VERSION_MINIMUM = "3.5"
$Env:OPENSSL_DIR = "C:\Program Files\OpenSSL-Win64"
$Env:OPENSSL_LIB_DIR = "C:\Program Files\OpenSSL-Win64\lib\VC\x64\MD"
$Env:OPENSSL_INCLUDE_DIR = "C:\Program Files\OpenSSL-Win64\include"
$Env:OPENSSL_LIBS = "libssl:libcrypto"
$Env:OPENSSL_NO_VENDOR = 1

# Load .env into session for local Rust processes
if (Test-Path ".env") {
    Get-Content .env | Where-Object { $_ -match "^[^#].+=.+" } | ForEach-Object {
        $name, $value = $_.Split('=', 2)
        Set-Item "Env:$name" $value.Trim()
    }
}

Write-Host "🚀 Initializing CATEST Distributed Platform..." -ForegroundColor Cyan

# 1. Infrastructure Boot
Write-Host "📦 [1/4] Booting Infrastructure (Docker Compose)..." -ForegroundColor Yellow
docker-compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker failed. Ensure Docker Desktop is healthy."
    exit $LASTEXITCODE
}

# 2. Database Readiness Check
Write-Host "⏳ [2/4] Waiting for PostgreSQL readiness..." -ForegroundColor Yellow
$Retries = 10
while ($Retries -gt 0) {
    # Test connection to the port we just mapped
    $Port = if ($Env:PORT_POSTGRES) { $Env:PORT_POSTGRES } else { "34321" }
    $Test = Test-NetConnection -Port $Port -ComputerName "localhost" -InformationLevel Quiet
    if ($Test) { break }
    $Retries--
    Start-Sleep -Seconds 2
}

# 3. Backend Cluster (Rust)
$Services = @("catest-gateway", "catest-review", "catest-ingestion", "catest-embedding", "catest-parser")
$LogDir = Join-Path $RootDir "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

Write-Host "🏗️ [3/4] Compiling and Launching Backend Cluster..." -ForegroundColor Yellow
cargo build --workspace --quiet
foreach ($Service in $Services) {
    Write-Host "   -> Starting node: $Service" -ForegroundColor Gray
    $LogFile = Join-Path $LogDir "$Service.log"
    Start-Process -FilePath "cmd" -ArgumentList "/c cargo run --bin $Service > `"$LogFile`" 2>&1" -WindowStyle Hidden
}

# 4. Frontend Ecosystem (Next.js)
Write-Host "🌐 [4/4] Launching Frontend Portals (pnpm/npm)..." -ForegroundColor Yellow
$WebDir = Join-Path $RootDir "web"
$WebLog = Join-Path $LogDir "web.log"

if (Test-Path $WebDir) {
    Push-Location $WebDir
    # We use the root dev script which handles filtering
    Start-Process -FilePath "cmd" -ArgumentList "/c npm run dev > `"$WebLog`" 2>&1" -WindowStyle Hidden
    Pop-Location
}

Write-Host ""
Write-Host "✅ CATEST Logic Synchronized & Running!" -ForegroundColor Green
Write-Host "📊 Monitoring logs at: $LogDir" -ForegroundColor Gray
Write-Host "🌍 Identity Portal: http://localhost:33000" -ForegroundColor Cyan
Write-Host ""
Start-Sleep -Seconds 3
Start-Process "http://localhost:33000"
