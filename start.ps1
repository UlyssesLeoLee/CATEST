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

Write-Host "Initializing CATEST Distributed Platform..." -ForegroundColor Cyan

# 1. Infrastructure Boot (build custom postgres with pgvector + AGE, then start all)
Write-Host "[1/5] Booting Infrastructure (Docker Compose)..." -ForegroundColor Yellow
docker-compose build postgres
docker-compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker failed. Ensure Docker Desktop is healthy."
    exit $LASTEXITCODE
}

# 2. Database Readiness Check + Ensure Databases Exist
Write-Host "[2/5] Waiting for PostgreSQL readiness..." -ForegroundColor Yellow
$Port = if ($Env:POSTGRES_PORT) { $Env:POSTGRES_PORT } elseif ($Env:PORT_POSTGRES) { $Env:PORT_POSTGRES } else { "34321" }
$Retries = 15
while ($Retries -gt 0) {
    $Test = Test-NetConnection -Port $Port -ComputerName "localhost" -InformationLevel Quiet
    if ($Test) { break }
    $Retries--
    Start-Sleep -Seconds 2
}

# Ensure all databases exist (idempotent — safe after Docker restart)
Write-Host "  Ensuring all CATEST databases exist..." -ForegroundColor DarkGray
$PgHost = "localhost"; $PgPort = $Port; $PgUser = "catest"
$AllDatabases = @(
    'catest_hub', 'catest_gateway', 'catest_ingestion', 'catest_intelligence',
    'catest_workspace', 'catest_review', 'catest_tm', 'catest_tb',
    'catest_orchestration'
)
$prevEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
foreach ($db in $AllDatabases) {
    docker exec catest-postgres-1 psql -U $PgUser -c "CREATE DATABASE $db OWNER $PgUser;" 2>&1 | Out-Null
    docker exec catest-postgres-1 psql -U $PgUser -d $db -c "CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS age;" 2>&1 | Out-Null
}
# Run init SQL scripts
$initDir = Join-Path $RootDir 'scripts/initdb.d'
if (Test-Path $initDir) {
    docker exec catest-postgres-1 psql -U $PgUser -d catest_intelligence -c "CREATE TABLE IF NOT EXISTS tenants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());" 2>&1 | Out-Null
    foreach ($sql in (Get-ChildItem "$initDir/*.sql" | Sort-Object Name)) {
        Write-Host "    $($sql.Name)" -ForegroundColor DarkGray
        docker exec catest-postgres-1 psql -U $PgUser -f "/docker-entrypoint-initdb.d/$($sql.Name)" 2>&1 | Out-Null
    }
}
$ErrorActionPreference = $prevEAP
Write-Host "  Database init complete" -ForegroundColor Green

# 3. Backend Cluster (Rust)
$Services = @("catest-gateway", "catest-review", "catest-ingestion", "catest-embedding", "catest-parser")
$LogDir = Join-Path $RootDir "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

Write-Host "[3/5] Compiling and Launching Backend Cluster..." -ForegroundColor Yellow
cargo build --workspace --quiet
foreach ($Service in $Services) {
    Write-Host "   -> Starting node: $Service" -ForegroundColor Gray
    $LogFile = Join-Path $LogDir "$Service.log"
    Start-Process -FilePath "cmd" -ArgumentList "/c cargo run --bin $Service > `"$LogFile`" 2>&1" -WindowStyle Hidden
}

# 4. Frontend Ecosystem (Next.js)
Write-Host "[4/5] Launching Frontend Portals (pnpm/npm)..." -ForegroundColor Yellow
$WebDir = Join-Path $RootDir "web"
$WebLog = Join-Path $LogDir "web.log"

if (Test-Path $WebDir) {
    Push-Location $WebDir
    # We use the root dev script which handles filtering
    Start-Process -FilePath "cmd" -ArgumentList "/c npm run dev > `"$WebLog`" 2>&1" -WindowStyle Hidden
    Pop-Location
}

# 5. Orchestration Domain (Python AI services — local dev mode)
Write-Host "[5/5] Launching Orchestration Services (Python)..." -ForegroundColor Yellow
$PythonDir = Join-Path $RootDir "python"
$PythonExe = "python"

# Find Python executable
if (Test-Path "C:\Users\$env:USERNAME\AppData\Local\Programs\Python\Python313\python.exe") {
    $PythonExe = "C:\Users\$env:USERNAME\AppData\Local\Programs\Python\Python313\python.exe"
}

$OrchServices = @(
    @{ Name = "memory-service";  Module = "catest_ai.memory_service.main";  Port = 34092 },
    @{ Name = "mcp-facade";      Module = "catest_ai.mcp_facade.main";      Port = 34098 },
    @{ Name = "intent-gateway";  Module = "catest_ai.intent_gateway.main";  Port = 34090 },
    @{ Name = "orchestrator-svc"; Module = "catest_ai.orchestrator_svc.main"; Port = 34091 },
    @{ Name = "adapter-bridge";  Module = "catest_ai.adapter_bridge.main";  Port = 34099 }
)

# Set env vars for local Python services
$Env:MEMORY_SERVICE_URL = "http://127.0.0.1:34092"
$Env:INTENT_GATEWAY_URL = "http://127.0.0.1:34090"

foreach ($svc in $OrchServices) {
    $svcLog = Join-Path $LogDir "$($svc.Name).log"
    Write-Host "   -> Starting: $($svc.Name) (:$($svc.Port))" -ForegroundColor Gray
    Start-Process -FilePath "cmd" `
        -ArgumentList "/c cd /d `"$PythonDir`" && set PYTHONPATH=src && `"$PythonExe`" -m $($svc.Module) > `"$svcLog`" 2>&1" `
        -WindowStyle Hidden
}

Write-Host ""
Write-Host "CATEST Platform Running!" -ForegroundColor Green
Write-Host "  Logs: $LogDir" -ForegroundColor Gray

# Detect live ports (handles Docker Desktop vpnkit ghost listeners)
# After ClusterIP migration, all web apps are accessed via Envoy Gateway.
$portConfigScript = Join-Path $RootDir 'port-config.ps1'
if (Test-Path $portConfigScript) {
    . $portConfigScript -Probe
    $pGateway = if ($Ports['envoy-gateway']) { $Ports['envoy-gateway'] } else { 33088 }
} else {
    $pGateway = 33088
}
Write-Host "  Gateway       : http://localhost:$pGateway  (unified entry point)" -ForegroundColor Cyan
Write-Host "  Dashboard     : http://localhost:$pGateway/" -ForegroundColor Cyan
Write-Host "  Orchestration : http://localhost:$pGateway/orchestration/" -ForegroundColor Cyan
Write-Host "  MCP Facade    : http://localhost:$pGateway/api/mcp-facade/healthz" -ForegroundColor Cyan
Write-Host ""
Start-Sleep -Seconds 3
Start-Process "http://localhost:$pGateway"
