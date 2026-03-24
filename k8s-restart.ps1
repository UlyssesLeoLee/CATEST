#!/usr/bin/env pwsh
# CATEST Kubernetes Deploy Script
# Usage:
#   ./k8s-restart.ps1                          # Full deploy (skip build)
#   ./k8s-restart.ps1 -Build                   # Build images then deploy
#   ./k8s-restart.ps1 -Build -LoadImages       # Build and load images into kind/k3d
#   ./k8s-restart.ps1 -Only gateway,web        # Deploy specific services only
#   ./k8s-restart.ps1 -SkipInfra               # Skip infrastructure layer
#   ./k8s-restart.ps1 -LoadImages              # Load existing images into cluster (kind/k3d)
#
# Troubleshooting ErrImageNeverPull:
#   1. If images exist locally: ./k8s-restart.ps1 -LoadImages
#   2. If need to rebuild: ./k8s-restart.ps1 -Build
#   3. For registry auth: ./k8s-restart.ps1 -PullFromRegistry

[CmdletBinding()]
param(
    [string]$Only = '',           # Comma-separated service names to deploy (empty = all)
    [string]$Namespace = 'catest',
    [switch]$Build,               # Build Docker images before deploy
    [switch]$SkipInfra,           # Skip infrastructure (PG/Kafka/Neo4j/Qdrant/Arroyo)
    [switch]$SkipWait,            # Skip rollout wait
    [switch]$LoadImages,          # Load existing images into local cluster (kind/k3d)
    [switch]$PullFromRegistry     # Use IfNotPresent instead of Never for imagePullPolicy
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
    # Docker Desktop uses kind internally — context is "kubernetes-admin@desktop"
    if ($ctx -match 'desktop' -or $ctx -match 'kind') { return 'kind' }
    if ($ctx -match 'k3d') { return 'k3d' }
    if ($ctx -match 'docker-desktop') { return 'docker-desktop' }
    return 'unknown'
}

function Repair-Kubeconfig {
    # Docker Desktop's kind cluster regenerates with a new port on each restart.
    # Extract the live kubeconfig from the control-plane container and install it.
    $cpContainer = docker ps --format '{{.Names}}' 2>$null | Select-String 'desktop-control-plane'
    if (-not $cpContainer) { return $false }

    Log "  Extracting kubeconfig from control-plane container..." Yellow
    $port = (docker port desktop-control-plane 6443 2>$null | Select-Object -First 1) -replace '.*:', ''
    if (-not $port) { Warn "Cannot determine K8s API port"; return $false }

    $env:MSYS_NO_PATHCONV = '1'
    $raw = docker exec desktop-control-plane cat /etc/kubernetes/admin.conf 2>&1
    $env:MSYS_NO_PATHCONV = $null
    if ($LASTEXITCODE -ne 0) { Warn "Cannot read admin.conf from container"; return $false }

    $kubeDir = Join-Path $env:USERPROFILE '.kube'
    $configPath = Join-Path $kubeDir 'config'

    # Back up existing config if it doesn't look like our generated one
    if (Test-Path $configPath) {
        $existing = Get-Content $configPath -Raw -ErrorAction SilentlyContinue
        if ($existing -and $existing -notmatch 'desktop-control-plane') {
            $backupPath = Join-Path $kubeDir 'config.bak'
            Copy-Item $configPath $backupPath -Force
            Log "  Backed up existing kubeconfig to config.bak" DarkGray
        }
    }

    # Write new config with corrected server address
    $fixed = $raw -replace 'server: https://desktop-control-plane:6443', "server: https://127.0.0.1:$port"
    $fixed | Out-File -FilePath $configPath -Encoding utf8 -Force
    Log "  Installed kubeconfig (API at 127.0.0.1:$port)" Green
    return $true
}

function Ensure-ImageLoaded {
    # Load a Docker image into the kind/k3d node's containerd runtime.
    # Docker Desktop's kind doesn't share the Docker daemon, so images must
    # be explicitly imported via "docker save | ctr import".
    param([string]$Image, [string]$ClusterType)

    if ($ClusterType -eq 'docker-desktop' -or $ClusterType -eq 'unknown') { return }

    $shortImage = ($Image -split '/')[-1]

    # Check if image exists in local Docker
    $localExists = docker images --quiet $Image 2>$null
    if (-not $localExists) {
        Warn "Image not found locally: $shortImage — build first with -Build"
        return
    }

    # Check if already loaded inside the kind node
    $env:MSYS_NO_PATHCONV = '1'
    $inNode = docker exec desktop-control-plane crictl images 2>$null | Select-String ([regex]::Escape($Image))
    $env:MSYS_NO_PATHCONV = $null
    if ($inNode) {
        Log "    $shortImage (already loaded)" DarkGray
        return
    }

    if ($ClusterType -eq 'kind') {
        Log "    Loading $shortImage ..." Cyan
        # Pipe image tar directly into the node's containerd (same as "kind load docker-image")
        $env:MSYS_NO_PATHCONV = '1'
        docker save $Image | docker exec -i desktop-control-plane ctr --namespace=k8s.io images import --all-platforms - 2>&1 | Out-Null
        $env:MSYS_NO_PATHCONV = $null
        if ($LASTEXITCODE -ne 0) { Warn "Failed to load $shortImage into kind node" }
    } elseif ($ClusterType -eq 'k3d') {
        Log "    Loading $shortImage into k3d..." DarkGray
        k3d image import $Image 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { Warn "Failed to load $shortImage into k3d" }
    }
}

function Diagnose-Images {
    # Check which images are available locally AND loaded into the kind node
    param([string]$ClusterType)

    if ($ClusterType -notin @('kind', 'k3d')) {
        Log "Image loading not needed for $ClusterType" DarkGray
        return
    }

    # Get list of images inside the kind node
    $env:MSYS_NO_PATHCONV = '1'
    $nodeImages = docker exec desktop-control-plane crictl images 2>$null
    $env:MSYS_NO_PATHCONV = $null

    Write-Host ""
    Log "Image Status Diagnostic:" Cyan
    $missingCount = 0
    foreach ($name in $Services.Keys) {
        $spec = $Services[$name]
        $image = $spec.Image
        $shortImage = ($image -split '/')[-1]
        $localExists = docker images --quiet $image 2>$null
        $inNode = $nodeImages | Select-String ([regex]::Escape($image))
        if ($inNode) {
            Log "  OK $shortImage (in cluster)" Green
        } elseif ($localExists) {
            Log "  !! $shortImage (local only — needs loading)" Yellow
            $missingCount++
        } else {
            Log "  XX $shortImage (not built)" Red
            $missingCount++
        }
    }
    Write-Host ""

    if ($missingCount -gt 0) {
        Log "  $missingCount image(s) need attention. Use -LoadImages or -Build -LoadImages" Yellow
        Write-Host ""
    }
}

function Ensure-K8sReady {
    if (Test-K8sReady) { return }

    # Step 1: Try to repair kubeconfig (Docker Desktop regenerates ports on restart)
    Log "  K8s API unreachable. Attempting kubeconfig repair..." Yellow
    $repaired = Repair-Kubeconfig
    if ($repaired -and (Test-K8sReady)) {
        Log "  K8s API recovered after kubeconfig repair." Green
        return
    }

    # Step 2: Check if control-plane container exists but K8s is still booting
    $cpExists = docker ps --format '{{.Names}}' 2>$null | Select-String 'desktop-control-plane'
    if ($cpExists) {
        Log "  Control-plane container found. Waiting for K8s API to start..." Yellow
        $timeout = 120; $elapsed = 0
        while ($elapsed -lt $timeout) {
            Start-Sleep -Seconds 5; $elapsed += 5
            if (Test-K8sReady) { Log "  K8s API recovered after ${elapsed}s."; return }
            Write-Host "  Waiting... ($elapsed/${timeout}s)" -ForegroundColor DarkGray
        }
    }

    # Step 3: No control-plane — restart Docker Desktop
    Log "  No K8s cluster found. Restarting Docker Desktop..." Yellow
    Stop-Process -Name 'Docker Desktop' -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 5
    Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"

    $timeout = 180; $elapsed = 0
    while ($elapsed -lt $timeout) {
        Start-Sleep -Seconds 10; $elapsed += 10
        # Wait for control-plane container to appear
        $cpUp = docker ps --format '{{.Names}}' 2>$null | Select-String 'desktop-control-plane'
        if ($cpUp) {
            Log "  Control-plane container detected. Extracting kubeconfig..." DarkGray
            Start-Sleep -Seconds 15
            Repair-Kubeconfig | Out-Null
            if (Test-K8sReady) { Log "  K8s API recovered after ${elapsed}s."; return }
        }
        Write-Host "  Waiting for Docker Desktop... ($elapsed/${timeout}s)" -ForegroundColor DarkGray
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
Log "[0/7] Pre-flight check..."
foreach ($cmd in @('docker', 'kubectl')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Fatal "$cmd not found" }
}
Ensure-K8sReady

# Detect cluster type for image loading
$ClusterType = Get-ClusterType
Log "  Cluster: $ClusterType" DarkGray

# Diagnostic if explicitly requested or if there's an image issue
if ($ClusterType -in @('kind', 'k3d')) {
    Diagnose-Images -ClusterType $ClusterType
}

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

# Load images to local K8s cluster if needed
if ($Build -or $LoadImages) {
    if ($ClusterType -in @('kind', 'k3d')) {
        Log "[1b/7] Loading images to cluster..."
        foreach ($name in $Selected) {
            $spec = $Services[$name]
            Ensure-ImageLoaded -Image $spec.Image -ClusterType $ClusterType
        }
    } elseif ($LoadImages) {
        Warn "LoadImages only works with kind/k3d clusters, not $ClusterType"
    }
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
    if ('postgres' -in $Selected -and ($Build -or $LoadImages)) {
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
    kube apply -f $envoyDir
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
# Docker Desktop's kind LoadBalancer (envoy) proxies can become stale after restarts.
# Set up kubectl port-forward as a reliable fallback for web services.
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
    $errImagePods = $failedPods | Where-Object { $_.Status -match 'ErrImageNeverPull|ImagePullBackOff' }
    $crashPods = $failedPods | Where-Object { $_.Status -match 'CrashLoopBackOff|Error' }
    if ($errImagePods.Count -gt 0) {
        Warn "ErrImageNeverPull: Images not loaded into cluster. Fix: ./k8s-restart.ps1 -LoadImages"
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
