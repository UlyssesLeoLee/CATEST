#!/usr/bin/env pwsh
# CATEST Kubernetes Deploy Script (Docker Desktop K8s)
# Usage:
#   ./k8s-restart.ps1                          # Full deploy (skip build)
#   ./k8s-restart.ps1 -Build                   # Build images then deploy
#   ./k8s-restart.ps1 -Only gateway,web        # Deploy specific services only
#   ./k8s-restart.ps1 -SkipInfra               # Skip infrastructure layer

[CmdletBinding()]
param(
    [string]$Only = '',           # Comma-separated service names to deploy (empty = all)
    [string]$Namespace = 'catest',
    [switch]$Build,               # Build Docker images before deploy
    [switch]$SkipInfra,           # Skip infrastructure (PG/Kafka/Neo4j/Qdrant/Arroyo)
    [switch]$SkipWait             # Skip rollout wait
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$K8s = Join-Path $PSScriptRoot 'k8s'

# ── Service Registry ─────────────────────────────────────────────────────────
$Services = @{
    postgres  = @{ Deploy = $null;                   Image = 'ghcr.io/ulyssesleolee/catest-postgres:latest';      Module = 'infra'; Type = 'statefulset'; Dir = 'docker/postgres' }
    gateway   = @{ Deploy = 'catest-hub';            Image = 'ghcr.io/ulyssesleolee/catest-gateway:latest';       Module = 'rust' }
    parser    = @{ Deploy = 'catest-workspace';      Image = 'ghcr.io/ulyssesleolee/catest-parser:latest';        Module = 'rust' }
    embedding = @{ Deploy = 'catest-intelligence';   Image = 'ghcr.io/ulyssesleolee/catest-embedding:latest';     Module = 'rust' }
    review    = @{ Deploy = 'catest-review';         Image = 'ghcr.io/ulyssesleolee/catest-review:latest';        Module = 'rust' }
    ingestion = @{ Deploy = $null;                   Image = 'ghcr.io/ulyssesleolee/catest-ingestion:latest';     Module = 'rust';  Type = 'job' }
    web            = @{ Deploy = 'catest-web-base';       Image = 'ghcr.io/ulyssesleolee/catest-web:latest';           Module = 'web'; Dir = 'web/apps/web-base' }
    'web-workspace'= @{ Deploy = 'catest-web-workspace';  Image = 'ghcr.io/ulyssesleolee/catest-web-workspace:latest'; Module = 'web'; Dir = 'web/apps/web-workspace' }
    'web-rag'      = @{ Deploy = 'catest-web-rag';        Image = 'ghcr.io/ulyssesleolee/catest-web-rag:latest';       Module = 'web'; Dir = 'web/apps/web-rag' }
    'web-review'   = @{ Deploy = 'catest-web-review';     Image = 'ghcr.io/ulyssesleolee/catest-web-review:latest';    Module = 'web'; Dir = 'web/apps/web-review' }
    'web-team'     = @{ Deploy = 'catest-web-team';       Image = 'ghcr.io/ulyssesleolee/catest-web-team:latest';      Module = 'web'; Dir = 'web/apps/web-team' }
}

# ── Helpers ───────────────────────────────────────────────────────────────────
function Log   { param([string]$M, [string]$C = 'Green')  Write-Host $M -ForegroundColor $C }
function Warn  { param([string]$M) Write-Host "  WARN: $M" -ForegroundColor Yellow }
function Fatal { param([string]$M) Write-Host "  FATAL: $M" -ForegroundColor Red; exit 1 }

function kube {
    # Wrapper: run kubectl, throw on failure
    $output = & kubectl @args 2>&1
    if ($LASTEXITCODE -ne 0) {
        $output | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        throw "kubectl $($args -join ' ') failed"
    }
    $output
}

function Test-K8sReady {
    try { $null = kubectl api-versions 2>&1; return $LASTEXITCODE -eq 0 }
    catch { return $false }
}

function Get-ClusterType {
    $ctx = kubectl config current-context 2>&1
    if ($ctx -match 'docker-desktop' -or $ctx -match 'desktop') { return 'docker-desktop' }
    return 'unknown'
}

function Diagnose-Images {
    # Docker Desktop K8s shares the Docker daemon — local images are directly available.
    # Just verify that the required images exist locally.
    Write-Host ""
    Log "Image Status Diagnostic:" Cyan
    $missingCount = 0
    foreach ($name in $Services.Keys) {
        $spec = $Services[$name]
        $image = $spec.Image
        $shortImage = ($image -split '/')[-1]
        $localExists = docker images --quiet $image 2>$null
        if ($localExists) {
            Log "  OK $shortImage (available)" Green
        } else {
            Log "  XX $shortImage (not built)" Red
            $missingCount++
        }
    }
    Write-Host ""

    if ($missingCount -gt 0) {
        Log "  $missingCount image(s) missing. Use -Build to build them." Yellow
        Write-Host ""
    }
}

function Ensure-K8sReady {
    if (Test-K8sReady) { return }

    # Docker Desktop K8s may still be starting up — wait for it
    Log "  K8s API unreachable. Waiting for Docker Desktop Kubernetes..." Yellow
    $timeout = 180; $elapsed = 0
    while ($elapsed -lt $timeout) {
        Start-Sleep -Seconds 5; $elapsed += 5
        if (Test-K8sReady) { Log "  K8s API recovered after ${elapsed}s." Green; return }
        Write-Host "  Waiting... ($elapsed/${timeout}s)" -ForegroundColor DarkGray
    }
    Fatal "K8s API did not recover within ${timeout}s. Ensure Kubernetes is enabled in Docker Desktop settings."
}

# ── Determine which services to deploy ────────────────────────────────────────
$Selected = if ($Only -ne '') {
    $names = $Only -split ',' | ForEach-Object { $_.Trim().ToLower() }
    $names | ForEach-Object {
        if (-not $Services.ContainsKey($_)) { Fatal "Unknown service: $_. Valid: $($Services.Keys -join ', ')" }
        $_
    }
} else { $Services.Keys }

# ══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Log "======================================================"
Log "  CATEST K8s Deploy"
Log "======================================================"
Log "  Namespace : $Namespace"
Log "  Services  : $($Selected -join ', ')"
Log "  Build     : $Build"
Write-Host ""

# ── 0. Pre-flight ─────────────────────────────────────────────────────────────
Log "[0/7] Pre-flight check..."
foreach ($cmd in @('docker', 'kubectl')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Fatal "$cmd not found" }
}
Ensure-K8sReady

# Detect cluster type
$ClusterType = Get-ClusterType
Log "  Cluster: $ClusterType" DarkGray

# Check local images are available
Diagnose-Images

Log "  OK" Green

# ── 1. Build images & load to cluster (optional) ──────────────────────────────
if ($Build) {
    Log "[1/7] Building Docker images..."
    $rustDockerfile = Join-Path $PSScriptRoot 'rust.Dockerfile'
    foreach ($name in $Selected) {
        $spec = $Services[$name]
        Log "  Building $name -> $($spec.Image)" Cyan
        if ($spec.Module -eq 'infra') {
            $infraDir = Join-Path $PSScriptRoot $spec.Dir
            docker build -t $spec.Image -f "$infraDir/Dockerfile" $infraDir
        } elseif ($spec.Module -eq 'rust') {
            docker build -t $spec.Image --build-arg "SERVICE_NAME=catest-$name" -f $rustDockerfile $PSScriptRoot
        } else {
            docker build -t $spec.Image -f "$($spec.Dir)/Dockerfile" (Join-Path $PSScriptRoot "web")
        }
        if ($LASTEXITCODE -ne 0) { Fatal "Docker build failed for $name" }
    }
} else {
    Log "[1/7] Skipping image build (use -Build to enable)"
}

# ── 2. Base resources ─────────────────────────────────────────────────────────
Log "[2/7] Applying base resources (namespace, secrets, RBAC)..."
try {
    kube apply -f "$K8s/base/namespace.yaml"
} catch {
    Warn "Namespace creation skipped (may already exist)"
}
try {
    kube apply -f "$K8s/base/app-secrets.yaml"
} catch {
    Warn "Secrets sync had issues (may already exist)"
}
$rbacPath = "$K8s/rbac/"
if (Test-Path $rbacPath) { kube apply -f $rbacPath }

# ── 3. Infrastructure ─────────────────────────────────────────────────────────
if ($SkipInfra) {
    Log "[3/7] Skipping infrastructure (use without -SkipInfra to deploy)"
} else {
    Log "[3/7] Deploying infrastructure (PG/Kafka/Neo4j/Qdrant/Arroyo)..."
    foreach ($infra in @('postgres', 'kafka', 'neo4j', 'qdrant', 'arroyo')) {
        $p = "$K8s/infra/$infra/"
        if (Test-Path $p) {
            Log "  $infra" Cyan
            kube apply -f $p
        }
    }
    # If postgres was rebuilt, restart the statefulset to pick up the new image
    if ('postgres' -in $Selected -and $Build) {
        Log "  Restarting postgres statefulset (new image with pgvector + AGE)..." Yellow
        kubectl rollout restart statefulset/postgres -n $Namespace 2>&1 | Out-Null
        kubectl rollout status statefulset/postgres -n $Namespace --timeout=120s 2>&1 | Out-Null
    }

    # ConfigMap for DB init scripts
    Log "  postgres-init-scripts (configmap)" Cyan
    kubectl create configmap postgres-init-scripts `
        --from-file=scripts/initdb.d `
        --namespace $Namespace `
        --dry-run=client -o yaml | kubectl apply -f -
    if ($LASTEXITCODE -ne 0) { Warn "ConfigMap sync had issues" }

    # External services
    $extSvc = "$K8s/infra/ext-services.yaml"
    if (Test-Path $extSvc) { kube apply -f $extSvc }

    # Wait for PostgreSQL to be ready, then run DB init scripts
    Log "  Waiting for PostgreSQL readiness..." DarkGray
    $pgReady = $false
    for ($i = 0; $i -lt 30; $i++) {
        $env:MSYS_NO_PATHCONV = '1'
        $check = kubectl exec -n $Namespace postgres-0 -- pg_isready -U catest 2>&1
        $env:MSYS_NO_PATHCONV = $null
        if ($LASTEXITCODE -eq 0) { $pgReady = $true; break }
        Start-Sleep -Seconds 3
    }
    if ($pgReady) {
        Log "  Running database init scripts..." Cyan
        $initDir = Join-Path $PSScriptRoot 'scripts/initdb.d'
        if (Test-Path $initDir) {
            # Temporarily allow non-terminating errors from kubectl/psql (NOTICE, already-exists, etc.)
            $prevEAP = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            # Ensure all databases exist
            $env:MSYS_NO_PATHCONV = '1'
            foreach ($db in @('catest_hub', 'catest_gateway', 'catest_ingestion', 'catest_intelligence', 'catest_workspace', 'catest_review')) {
                kubectl exec -n $Namespace postgres-0 -- psql -U catest -c "CREATE DATABASE $db OWNER catest;" 2>&1 | Out-Null
            }
            # Enable pgvector + AGE extensions on all databases
            foreach ($db in @('catest_hub', 'catest_gateway', 'catest_ingestion', 'catest_intelligence', 'catest_workspace', 'catest_review')) {
                kubectl exec -n $Namespace postgres-0 -- psql -U catest -d $db -c "CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS age;" 2>&1 | Out-Null
            }
            Log "    pgcrypto + pgvector + AGE enabled on all databases" DarkGray
            # Create tenants table in catest_intelligence (needed by rag-modules FK references)
            kubectl exec -n $Namespace postgres-0 -- psql -U catest -d catest_intelligence -c "CREATE TABLE IF NOT EXISTS tenants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());" 2>&1 | Out-Null
            # Run all SQL init files in order
            foreach ($sql in (Get-ChildItem "$initDir/*.sql" | Sort-Object Name)) {
                Log "    $($sql.Name)" DarkGray
                kubectl exec -n $Namespace postgres-0 -- psql -U catest -f "/docker-entrypoint-initdb.d/$($sql.Name)" 2>&1 | Out-Null
            }
            # Fix constraints required by auth (ON CONFLICT needs UNIQUE)
            foreach ($db in @('catest_hub', 'catest_gateway')) {
                kubectl exec -n $Namespace postgres-0 -- psql -U catest -d $db -c "DROP INDEX IF EXISTS idx_verification_email; DO `$`$ BEGIN ALTER TABLE verification_codes ADD CONSTRAINT uq_verification_email UNIQUE (email); EXCEPTION WHEN duplicate_table THEN NULL; END `$`$;" 2>&1 | Out-Null
            }
            $env:MSYS_NO_PATHCONV = $null
            $ErrorActionPreference = $prevEAP
            Log "  Database initialization complete" Green
        }
    } else {
        Warn "PostgreSQL not ready — skipping DB init (you may need to run init scripts manually)"
    }
}

# ── 4. Application services ──────────────────────────────────────────────────
Log "[4/7] Deploying application services..."

# Fixed ordering: backend first, then frontend
$applyOrder = @('gateway', 'parser', 'embedding', 'review', 'ingestion',
                'web', 'web-workspace', 'web-rag', 'web-review', 'web-team')

foreach ($name in $applyOrder) {
    if ($name -notin $Selected) { continue }
    $svcDir = "$K8s/services/$name/"
    if (-not (Test-Path $svcDir)) { Warn "No manifests for $name at $svcDir"; continue }

    $spec = $Services[$name]

    if ($spec.ContainsKey('Type') -and $spec.Type -eq 'job') {
        # Jobs are immutable — must delete before re-creating
        Log "  $name (job: delete + create)" Cyan
        kubectl delete job "catest-$name" -n $Namespace --ignore-not-found 2>&1 | Out-Null
        kube apply -f $svcDir
    } else {
        Log "  $name" Cyan
        kube apply -f $svcDir
    }
}

# Standalone service files
$workspaceSvc = "$K8s/services/workspace-svc.yaml"
if (Test-Path $workspaceSvc) { kube apply -f $workspaceSvc }

# Envoy reverse proxy gateway (routes all apps under single origin)
$envoyDir = "$K8s/infra/envoy-gateway/"
if (Test-Path $envoyDir) {
    Log "  envoy-gateway (reverse proxy)" Cyan
    $prevEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $envoyOutput = kubectl apply -f $envoyDir 2>&1
    $ErrorActionPreference = $prevEAP
    if ($LASTEXITCODE -ne 0) {
        Warn "Envoy Gateway resources failed to apply. CRDs may not be installed."
        Warn "Run the following command to install Envoy Gateway CRDs, then retry:"
        Warn "  kubectl apply --server-side -f https://github.com/envoyproxy/gateway/releases/latest/download/install.yaml"
    }
}

# KEDA scaled objects (if present)
$kedaDir = "$K8s/keda/"
if (Test-Path $kedaDir) {
    Log "  keda scaled objects" Cyan
    $prevEAP2 = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    kubectl apply -f $kedaDir 2>&1 | Out-Null
    $ErrorActionPreference = $prevEAP2
    # KEDA may not be installed; don't fail on this
    if ($LASTEXITCODE -ne 0) { Warn "KEDA resources skipped (KEDA may not be installed)" }
}

# ── 5. Rollout verification ──────────────────────────────────────────────────
if ($SkipWait) {
    Log "[5/7] Skipping rollout check"
} else {
    Log "[5/7] Waiting for rollouts..."
    $deployments = @()
    foreach ($name in $Selected) {
        $spec = $Services[$name]
        if ($spec.Deploy) { $deployments += $spec.Deploy }
    }
    foreach ($dep in $deployments) {
        Log "  Waiting: $dep" Cyan
        kubectl rollout status deployment/$dep -n $Namespace --timeout=300s 2>&1
        if ($LASTEXITCODE -ne 0) { Warn "$dep rollout not ready (may still be pulling images)" }
    }
}

# ── 6. Port forwarding ───────────────────────────────────────────────────────
# Set up kubectl port-forward as a fallback if envoy gateway ports are not reachable.
$PortForwards = @{
    'catest-web-base'      = 33000
    'catest-web-workspace' = 33001
    'catest-web-rag'       = 33002
    'catest-web-review'    = 33003
    'catest-web-team'      = 33004
}

$needPortForward = $false
foreach ($svc in $PortForwards.Keys) {
    $port = $PortForwards[$svc]
    try {
        $test = New-Object System.Net.Sockets.TcpClient
        $test.Connect('127.0.0.1', $port)
        $test.Close()
    } catch {
        $needPortForward = $true
        break
    }
}

if ($needPortForward) {
    Log "[6/7] Setting up port forwarding for web services..."
    # Kill any stale port-forward processes
    Get-Process -Name 'kubectl' -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'port-forward' } |
        Stop-Process -Force -ErrorAction SilentlyContinue

    foreach ($svc in $PortForwards.Keys) {
        $port = $PortForwards[$svc]
        Log "  $svc -> localhost:$port" Cyan
        Start-Process -WindowStyle Hidden -FilePath 'kubectl' `
            -ArgumentList "port-forward -n $Namespace svc/$svc ${port}:${port} --address=0.0.0.0"
    }
    Start-Sleep -Seconds 2
} else {
    Log "[6/7] All web ports already reachable (skipping port-forward)"
}

# ── 7. Verification ─────────────────────────────────────────────────────────
Log "[7/7] Verifying deployment..."
Write-Host ""

# 7a. Pod status check
$allPods = kubectl get pods -n $Namespace --no-headers 2>&1
$podLines = ($allPods -split "`n") | Where-Object { $_.Trim() -ne '' }
$runningCount = 0
$completedCount = 0
$failedPods = @()

foreach ($line in $podLines) {
    $cols = ($line.Trim() -split '\s+')
    if ($cols.Count -lt 3) { continue }
    $podName = $cols[0]
    $status = $cols[2]
    if ($status -eq 'Running') {
        $runningCount++
    } elseif ($status -eq 'Completed') {
        $completedCount++
    } else {
        $failedPods += @{ Name = $podName; Status = $status }
    }
}

$totalOk = $runningCount + $completedCount
Log "  Pod status: $runningCount Running, $completedCount Completed, $($failedPods.Count) Failed" $(if ($failedPods.Count -eq 0) { 'Green' } else { 'Yellow' })

if ($failedPods.Count -gt 0) {
    foreach ($fp in $failedPods) {
        Log "    $($fp.Name): $($fp.Status)" Red
    }
    Write-Host ""
    $errImagePods = @($failedPods | Where-Object { $_.Status -match 'ErrImageNeverPull|ImagePullBackOff' })
    $crashPods = @($failedPods | Where-Object { $_.Status -match 'CrashLoopBackOff|Error' })
    if ($errImagePods.Count -gt 0) {
        Warn "Image pull error: Ensure images are built locally with ./k8s-restart.ps1 -Build"
    }
    if ($crashPods.Count -gt 0) {
        Warn "CrashLoopBackOff: Check logs with: kubectl logs -n $Namespace <pod-name>"
    }
}

# 7b. Web port accessibility check
Write-Host ""
Log "  Web service accessibility:" Cyan
$allPortsOk = $true
foreach ($svc in $PortForwards.Keys) {
    $port = $PortForwards[$svc]
    $shortName = $svc -replace 'catest-', ''
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:$port/" -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 5 -ErrorAction SilentlyContinue 2>&1
        $code = $resp.StatusCode
    } catch {
        # Invoke-WebRequest throws on 3xx/4xx with -MaximumRedirection 0
        if ($_.Exception.Response) {
            $code = [int]$_.Exception.Response.StatusCode
        } else {
            $code = 0
        }
    }
    if ($code -gt 0) {
        Log "    http://localhost:$port ($shortName) -> HTTP $code" Green
    } else {
        Log "    http://localhost:$port ($shortName) -> UNREACHABLE" Red
        $allPortsOk = $false
    }
}

# 7c. Infrastructure service check
Write-Host ""
Log "  Infrastructure pods:" Cyan
foreach ($infra in @('postgres-0', 'kafka-0', 'neo4j-0', 'qdrant-0')) {
    $env:MSYS_NO_PATHCONV = '1'
    $podStatus = kubectl get pod $infra -n $Namespace -o jsonpath='{.status.phase}' 2>&1
    $env:MSYS_NO_PATHCONV = $null
    if ($podStatus -eq 'Running') {
        Log "    $infra -> Running" Green
    } else {
        Log "    $infra -> $podStatus" Red
    }
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
if ($failedPods.Count -eq 0 -and $allPortsOk) {
    Log "======================================================"
    Log "  CATEST Deploy Complete! All checks passed."
    Log "======================================================"
} else {
    Log "======================================================" Yellow
    Log "  CATEST Deploy Complete (with warnings)" Yellow
    Log "======================================================" Yellow
}
Log "  Gateway    : http://localhost:33088  (unified entry point)"
Log "  Dashboard  : http://localhost:33088/"
Log "  Workspace  : http://localhost:33088/workspace/"
Log "  RAG        : http://localhost:33088/rag/"
Log "  Review     : http://localhost:33088/review/"
Log "  Team       : http://localhost:33088/team/"
Write-Host ""
