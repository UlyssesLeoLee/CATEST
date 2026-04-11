#!/usr/bin/env pwsh
# Smoke Test for CATEST (Docker Desktop Kubernetes)
$ErrorActionPreference = "Continue"

Write-Host "Starting Smoke Test..." -ForegroundColor Cyan
Write-Host ""

$allPassed = $true
$Namespace = 'catest'

# ── 1. Infrastructure pod health checks ──────────────────────────────
Write-Host "=== Infrastructure Health ===" -ForegroundColor Yellow

# Postgres: use pg_isready
Write-Host "  Postgres... " -NoNewline
$env:MSYS_NO_PATHCONV = '1'
$pgCheck = kubectl exec -n $Namespace postgres-0 -- pg_isready -U catest 2>&1
$env:MSYS_NO_PATHCONV = $null
if ($LASTEXITCODE -eq 0) {
    Write-Host "OK" -ForegroundColor Green
} else {
    Write-Host "FAILED" -ForegroundColor Red
    $allPassed = $false
}

# Kafka: use kafka-broker-api-versions
Write-Host "  Kafka... " -NoNewline
$env:MSYS_NO_PATHCONV = '1'
$kafkaCheck = kubectl exec -n $Namespace kafka-0 -- bash -c "echo > /dev/tcp/localhost/9092" 2>&1
$env:MSYS_NO_PATHCONV = $null
if ($LASTEXITCODE -eq 0) {
    Write-Host "OK" -ForegroundColor Green
} else {
    Write-Host "FAILED" -ForegroundColor Red
    $allPassed = $false
}

# Qdrant: check if port is listening via /proc/net
Write-Host "  Qdrant... " -NoNewline
$env:MSYS_NO_PATHCONV = '1'
$qdrantCheck = kubectl get pod qdrant-0 -n $Namespace -o jsonpath='{.status.containerStatuses[0].ready}' 2>&1
$env:MSYS_NO_PATHCONV = $null
if ($qdrantCheck -eq 'true') {
    Write-Host "OK" -ForegroundColor Green
} else {
    Write-Host "FAILED" -ForegroundColor Red
    $allPassed = $false
}

# Memgraph: check Bolt port
Write-Host "  Memgraph... " -NoNewline
$env:MSYS_NO_PATHCONV = '1'
$memgraphCheck = kubectl exec -n $Namespace memgraph-0 -- bash -c "echo > /dev/tcp/localhost/7687" 2>&1
$env:MSYS_NO_PATHCONV = $null
if ($LASTEXITCODE -eq 0) {
    Write-Host "OK" -ForegroundColor Green
} else {
    Write-Host "FAILED" -ForegroundColor Red
    $allPassed = $false
}

# ── 2. Internal service DNS resolution ───────────────────────────────
Write-Host ""
Write-Host "=== Service DNS Resolution ===" -ForegroundColor Yellow

$internalServices = @(
    'catest-hub', 'catest-review', 'catest-workspace', 'catest-intelligence',
    'catest-web-base', 'catest-web-workspace', 'catest-web-rag', 'catest-web-review', 'catest-web-team',
    'catest-web-tm', 'catest-web-tb', 'catest-web-orchestration'
)

foreach ($svc in $internalServices) {
    Write-Host "  $svc... " -NoNewline
    $env:MSYS_NO_PATHCONV = '1'
    $dnsCheck = kubectl exec -n $Namespace postgres-0 -- sh -c "getent hosts $svc.$Namespace.svc.cluster.local" 2>&1
    $env:MSYS_NO_PATHCONV = $null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK" -ForegroundColor Green
    } else {
        Write-Host "FAILED" -ForegroundColor Red
        $allPassed = $false
    }
}

# ── 3. Envoy Gateway & route accessibility ──────────────────────────
Write-Host ""
Write-Host "=== Envoy Gateway (single entry point) ===" -ForegroundColor Yellow

# Dot-source port-config.ps1 to detect working ports (native or forwarded)
$portConfigScript = Join-Path $PSScriptRoot '..' 'port-config.ps1'
if (Test-Path $portConfigScript) {
    . $portConfigScript -Probe
    Write-Host "  (port-config.ps1 detected ports)" -ForegroundColor DarkGray
} else {
    Write-Host "  (port-config.ps1 not found, using defaults)" -ForegroundColor Yellow
    $Ports = @{ 'envoy-gateway' = 33088 }
}

$gwPort = if ($Ports['envoy-gateway']) { $Ports['envoy-gateway'] } else { 33088 }

# 3a. TCP check on gateway port
Write-Host "  envoy-gateway (localhost:$gwPort)... " -NoNewline
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $connect = $tcp.BeginConnect('127.0.0.1', $gwPort, $null, $null)
    $wait = $connect.AsyncWaitHandle.WaitOne(3000, $false)
    if ($wait) {
        $tcp.EndConnect($connect)
        Write-Host "OK" -ForegroundColor Green
    } else {
        Write-Host "FAILED (Timeout)" -ForegroundColor Red
        $allPassed = $false
    }
    $tcp.Close()
} catch {
    Write-Host "FAILED" -ForegroundColor Red
    $allPassed = $false
}

# 3b. Route checks via Envoy Gateway (all web apps are ClusterIP, only accessible through gateway)
Write-Host ""
Write-Host "=== App Routes (via Gateway :$gwPort) ===" -ForegroundColor Yellow
$routes = @(
    @{ Name = 'Dashboard';     Path = '/' },
    @{ Name = 'Workspace';     Path = '/workspace' },
    @{ Name = 'RAG';           Path = '/rag' },
    @{ Name = 'Review';        Path = '/review' },
    @{ Name = 'Team';          Path = '/team' },
    @{ Name = 'TM';            Path = '/tm' },
    @{ Name = 'TB';            Path = '/tb' },
    @{ Name = 'Orchestration'; Path = '/orchestration' }
)
foreach ($route in $routes) {
    Write-Host "  $($route.Name) ($($route.Path))... " -NoNewline
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:$gwPort$($route.Path)" -UseBasicParsing `
            -MaximumRedirection 0 -TimeoutSec 5 -ErrorAction SilentlyContinue 2>&1
        Write-Host "OK (HTTP $($resp.StatusCode))" -ForegroundColor Green
    } catch {
        if ($_.Exception.Response) {
            $code = [int]$_.Exception.Response.StatusCode
            Write-Host "OK (HTTP $code)" -ForegroundColor Green
        } else {
            Write-Host "FAILED" -ForegroundColor Red
            $allPassed = $false
        }
    }
}

# ── 4. Orchestration Domain ──────────────────────────────────────────
Write-Host ""
Write-Host "=== Orchestration Domain ===" -ForegroundColor Yellow

# Check orchestration service pods
$orchServices = @(
    'catest-intent-gateway',
    'catest-orchestrator-svc',
    'catest-memory-service',
    'catest-dispatch-router',
    'catest-mcp-facade',
    'catest-trace-audit'
)

foreach ($svc in $orchServices) {
    $shortName = $svc -replace 'catest-', ''
    Write-Host "  $shortName... " -NoNewline
    $env:MSYS_NO_PATHCONV = '1'
    $podReady = kubectl get pod -n $Namespace -l "app=$svc" -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>&1
    $env:MSYS_NO_PATHCONV = $null
    if ($podReady -eq 'true') {
        Write-Host "OK" -ForegroundColor Green
    } else {
        Write-Host "NOT READY" -ForegroundColor Yellow
        # Don't fail overall test — orchestration services may not be deployed yet
    }
}

# MCP Facade healthz check
Write-Host "  mcp-facade /healthz... " -NoNewline
$env:MSYS_NO_PATHCONV = '1'
$mcpPod = kubectl get pod -n $Namespace -l app=catest-mcp-facade -o jsonpath='{.items[0].metadata.name}' 2>&1
$env:MSYS_NO_PATHCONV = $null
if ($mcpPod -and $LASTEXITCODE -eq 0) {
    $env:MSYS_NO_PATHCONV = '1'
    $healthz = kubectl exec -n $Namespace $mcpPod -- curl -sf http://localhost:34098/healthz 2>&1
    $env:MSYS_NO_PATHCONV = $null
    if ($healthz -match 'mcp_endpoint') {
        Write-Host "OK (MCP at /mcp)" -ForegroundColor Green
    } else {
        Write-Host "FAILED" -ForegroundColor Red
        $allPassed = $false
    }
} else {
    Write-Host "NOT DEPLOYED" -ForegroundColor Yellow
}

# ── 5. Pod status ────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== Pod Status ===" -ForegroundColor Yellow

$pods = kubectl get pods -n $Namespace --no-headers 2>&1
$failedPods = $pods | Where-Object { $_ -notmatch "Running" -and $_ -notmatch "Completed" -and $_.Trim() -ne '' }

if ($failedPods) {
    Write-Host "  Warning: Some pods are not healthy:" -ForegroundColor Yellow
    $failedPods | ForEach-Object { Write-Host "    $_" -ForegroundColor Yellow }
    $allPassed = $false
} else {
    Write-Host "  All pods healthy" -ForegroundColor Green
}

# ── 6. Database schemas ──────────────────────────────────────────────
Write-Host ""
Write-Host "=== Database Schema Check ===" -ForegroundColor Yellow

$dbChecks = @{
    'catest_ingestion'     = 'snapshots'
    'catest_hub'           = 'repositories'
    'catest_review'        = 'review_sessions'
    'catest_orchestration' = 'pg_tables'  # just check DB exists
}

foreach ($db in $dbChecks.Keys) {
    $table = $dbChecks[$db]
    Write-Host "  $db... " -NoNewline
    $env:MSYS_NO_PATHCONV = '1'
    if ($table -eq 'pg_tables') {
        # Just check the database is accessible
        $check = kubectl exec -n $Namespace postgres-0 -- psql -U catest -d $db -tAc "SELECT 1;" 2>&1
    } else {
        $check = kubectl exec -n $Namespace postgres-0 -- psql -U catest -d $db -tAc "SELECT 1 FROM $table LIMIT 0;" 2>&1
    }
    $env:MSYS_NO_PATHCONV = $null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK" -ForegroundColor Green
    } else {
        Write-Host "FAILED (missing tables?)" -ForegroundColor Red
        $allPassed = $false
    }
}

# ── Result ───────────────────────────────────────────────────────────
Write-Host ""
if ($allPassed) {
    Write-Host "Smoke Test PASSED" -ForegroundColor Green
    exit 0
} else {
    Write-Host "Smoke Test FAILED" -ForegroundColor Red
    exit 1
}
