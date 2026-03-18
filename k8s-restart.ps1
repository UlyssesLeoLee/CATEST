#!/usr/bin/env pwsh
# CATEST Kubernetes Deploy Script
# Usage:
#   ./k8s-restart.ps1                     # Full deploy (skip build)
#   ./k8s-restart.ps1 -Build              # Build images then deploy
#   ./k8s-restart.ps1 -Only gateway,web   # Deploy specific services only
#   ./k8s-restart.ps1 -SkipInfra          # Skip infrastructure layer

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
    # Use api-versions instead of cluster-info — much faster timeout
    try { $null = kubectl api-versions 2>&1; return $LASTEXITCODE -eq 0 }
    catch { return $false }
}

function Ensure-K8sReady {
    if (Test-K8sReady) { return }

    Log "  K8s API unreachable. Restarting WSL..." Yellow
    wsl --shutdown
    Start-Sleep -Seconds 8

    $timeout = 120; $elapsed = 0
    while ($elapsed -lt $timeout) {
        Start-Sleep -Seconds 5; $elapsed += 5
        if (Test-K8sReady) { Log "  K8s API recovered after ${elapsed}s."; return }
        Write-Host "  Waiting... ($elapsed/${timeout}s)" -ForegroundColor DarkGray
    }
    Fatal "K8s API did not recover within ${timeout}s. Check Docker Desktop -> Kubernetes settings."
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
Log "[0/5] Pre-flight check..."
foreach ($cmd in @('docker', 'kubectl')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Fatal "$cmd not found" }
}
Ensure-K8sReady
Log "  OK" Green

# ── 1. Build images (optional) ────────────────────────────────────────────────
if ($Build) {
    Log "[1/5] Building Docker images..."
    $rustDockerfile = Join-Path $PSScriptRoot 'rust.Dockerfile'
    foreach ($name in $Selected) {
        $spec = $Services[$name]
        Log "  Building $name -> $($spec.Image)" Cyan
        if ($spec.Module -eq 'rust') {
            docker build -t $spec.Image --build-arg "SERVICE_NAME=catest-$name" -f $rustDockerfile $PSScriptRoot
        } else {
            docker build -t $spec.Image -f "$($spec.Dir)/Dockerfile" (Join-Path $PSScriptRoot "web")
        }
        if ($LASTEXITCODE -ne 0) { Fatal "Docker build failed for $name" }
    }
} else {
    Log "[1/5] Skipping image build (use -Build to enable)"
}

# ── 2. Base resources ─────────────────────────────────────────────────────────
Log "[2/5] Applying base resources (namespace, secrets, RBAC)..."
kube apply -f "$K8s/base/namespace.yaml"
kube apply -f "$K8s/base/app-secrets.yaml"
$rbacPath = "$K8s/rbac/"
if (Test-Path $rbacPath) { kube apply -f $rbacPath }

# ── 3. Infrastructure ─────────────────────────────────────────────────────────
if ($SkipInfra) {
    Log "[3/5] Skipping infrastructure (use without -SkipInfra to deploy)"
} else {
    Log "[3/5] Deploying infrastructure (PG/Kafka/Neo4j/Qdrant/Arroyo)..."
    foreach ($infra in @('postgres', 'kafka', 'neo4j', 'qdrant', 'arroyo')) {
        $p = "$K8s/infra/$infra/"
        if (Test-Path $p) {
            Log "  $infra" Cyan
            kube apply -f $p
        }
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
}

# ── 4. Application services ──────────────────────────────────────────────────
Log "[4/5] Deploying application services..."

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

# Envoy gateway (optional — requires CRDs installed separately)
$envoyDir = "$K8s/infra/envoy-gateway/"
if (Test-Path $envoyDir) {
    Log "  envoy-gateway" Cyan
    kubectl apply -f $envoyDir 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Warn "Envoy Gateway skipped (CRDs not installed). Run: kubectl apply -f https://github.com/envoyproxy/gateway/releases/latest/download/install.yaml" }
}

# KEDA scaled objects (if present)
$kedaDir = "$K8s/keda/"
if (Test-Path $kedaDir) {
    Log "  keda scaled objects" Cyan
    kubectl apply -f $kedaDir 2>&1 | Out-Null
    # KEDA may not be installed; don't fail on this
    if ($LASTEXITCODE -ne 0) { Warn "KEDA resources skipped (KEDA may not be installed)" }
}

# ── 5. Rollout verification ──────────────────────────────────────────────────
if ($SkipWait) {
    Log "[5/5] Skipping rollout check"
} else {
    Log "[5/5] Waiting for rollouts..."
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

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Log "======================================================"
Log "  CATEST Deploy Complete!"
Log "======================================================"
Log "  Dashboard  : http://localhost:33000"
Log "  Workspace  : http://localhost:33001"
Log "  RAG        : http://localhost:33002"
Log "  Review     : http://localhost:33003"
Log "  Team       : http://localhost:33004"
Write-Host ""
Log "  kubectl get pods -n $Namespace" DarkGray
Write-Host ""
