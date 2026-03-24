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

# Neo4j: use cypher-shell
Write-Host "  Neo4j... " -NoNewline
$env:MSYS_NO_PATHCONV = '1'
$neo4jCheck = kubectl exec -n $Namespace neo4j-0 -- bash -c "echo > /dev/tcp/localhost/7474" 2>&1
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
    'catest-web-base', 'catest-web-workspace', 'catest-web-rag', 'catest-web-review', 'catest-web-team'
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

# ── 3. External port accessibility ───────────────────────────────────
Write-Host ""
Write-Host "=== External Ports ===" -ForegroundColor Yellow

$externalPorts = @{
    'web-base'      = 33000
    'web-workspace' = 33001
    'web-rag'       = 33002
    'web-review'    = 33003
    'web-team'      = 33004
    'gateway'       = 33088
}

foreach ($svc in $externalPorts.Keys) {
    $port = $externalPorts[$svc]
    Write-Host "  $svc (localhost:$port)... " -NoNewline
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $connect = $tcp.BeginConnect('127.0.0.1', $port, $null, $null)
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
}

# ── 4. Pod status ────────────────────────────────────────────────────
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

# ── Result ───────────────────────────────────────────────────────────
Write-Host ""
if ($allPassed) {
    Write-Host "Smoke Test PASSED" -ForegroundColor Green
    exit 0
} else {
    Write-Host "Smoke Test FAILED" -ForegroundColor Red
    exit 1
}
