#!/usr/bin/env pwsh
# CATEST Kubernetes Deploy Script (Docker Desktop K8s)
# Usage:
#   ./k8s-restart.ps1                          # Full deploy (skip build)
#   ./k8s-restart.ps1 -Build                   # Build images then deploy
#   ./k8s-restart.ps1 -Only gateway,web        # Deploy specific services only
#   ./k8s-restart.ps1 -SkipInfra               # Skip infrastructure layer
#   ./k8s-restart.ps1 -Only mcp-facade         # Deploy single orchestration service

[CmdletBinding()]
param(
    [string]$Only = '',           # Comma-separated service names to deploy (empty = all)
    [string]$Namespace = 'catest',
    [switch]$Build,               # Build Docker images before deploy
    [switch]$SkipInfra,           # Skip infrastructure (PG/Kafka/Memgraph/Qdrant/Arroyo)
    [switch]$SkipWait             # Skip rollout wait
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$K8s = Join-Path $PSScriptRoot 'k8s'

# ── Load .env (single source of truth for ports) ────────────────────────────
$EnvFile = Join-Path $PSScriptRoot '.env'
$EnvVars = @{}
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$' -and $_ -notmatch '^\s*#') {
            $EnvVars[$Matches[1]] = $Matches[2].Trim('"').Trim("'")
        }
    }
}
$PostgresPort = if ($EnvVars.ContainsKey('POSTGRES_PORT')) { $EnvVars['POSTGRES_PORT'] } else { '34321' }

# ── Service Registry ─────────────────────────────────────────────────────────
$Services = @{
    # --- Infrastructure ---
    postgres  = @{ Deploy = $null;                   Image = 'ghcr.io/ulyssesleolee/catest-postgres:latest';      Module = 'infra'; Type = 'statefulset'; Dir = 'docker/postgres' }
    # --- Rust services ---
    gateway   = @{ Deploy = 'catest-hub';            Image = 'ghcr.io/ulyssesleolee/catest-gateway:latest';       Module = 'rust' }
    parser    = @{ Deploy = 'catest-workspace';      Image = 'ghcr.io/ulyssesleolee/catest-parser:latest';        Module = 'rust' }
    embedding = @{ Deploy = 'catest-intelligence';   Image = 'ghcr.io/ulyssesleolee/catest-embedding:latest';     Module = 'rust' }
    review    = @{ Deploy = 'catest-review';         Image = 'ghcr.io/ulyssesleolee/catest-review:latest';        Module = 'rust' }
    ingestion = @{ Deploy = $null;                   Image = 'ghcr.io/ulyssesleolee/catest-ingestion:latest';     Module = 'rust';  Type = 'job' }
    batch     = @{ Deploy = $null;                   Image = 'ghcr.io/ulyssesleolee/catest-batch:latest';         Module = 'rust';  Type = 'job' }
    # --- Web apps ---
    web              = @{ Deploy = 'catest-web-base';         Image = 'ghcr.io/ulyssesleolee/catest-web:latest';              Module = 'web'; Dir = 'web/apps/web-base' }
    'web-workspace'  = @{ Deploy = 'catest-web-workspace';    Image = 'ghcr.io/ulyssesleolee/catest-web-workspace:latest';    Module = 'web'; Dir = 'web/apps/web-workspace' }
    'web-rag'        = @{ Deploy = 'catest-web-rag';          Image = 'ghcr.io/ulyssesleolee/catest-web-rag:latest';          Module = 'web'; Dir = 'web/apps/web-rag' }
    'web-review'     = @{ Deploy = 'catest-web-review';       Image = 'ghcr.io/ulyssesleolee/catest-web-review:latest';       Module = 'web'; Dir = 'web/apps/web-review' }
    'web-team'       = @{ Deploy = 'catest-web-team';         Image = 'ghcr.io/ulyssesleolee/catest-web-team:latest';         Module = 'web'; Dir = 'web/apps/web-team' }
    'web-tm'         = @{ Deploy = 'catest-web-tm';           Image = 'ghcr.io/ulyssesleolee/catest-web-tm:latest';           Module = 'web'; Dir = 'web/apps/web-tm' }
    'web-tb'         = @{ Deploy = 'catest-web-tb';           Image = 'ghcr.io/ulyssesleolee/catest-web-tb:latest';           Module = 'web'; Dir = 'web/apps/web-tb' }
    'web-orchestration' = @{ Deploy = 'catest-web-orchestration'; Image = 'ghcr.io/ulyssesleolee/catest-web-orchestration:latest'; Module = 'web'; Dir = 'web/apps/web-orchestration' }
    # --- Orchestration Domain (Python AI services) ---
    'intent-gateway'      = @{ Deploy = 'catest-intent-gateway';      Image = 'ghcr.io/ulyssesleolee/catest-intent-gateway:latest';      Module = 'python' }
    'orchestrator-svc'    = @{ Deploy = 'catest-orchestrator-svc';    Image = 'ghcr.io/ulyssesleolee/catest-orchestrator-svc:latest';    Module = 'python' }
    'memory-service'      = @{ Deploy = 'catest-memory-service';      Image = 'ghcr.io/ulyssesleolee/catest-memory-service:latest';      Module = 'python' }
    'dispatch-router'     = @{ Deploy = 'catest-dispatch-router';     Image = 'ghcr.io/ulyssesleolee/catest-dispatch-router:latest';     Module = 'python' }
    'mcp-facade'          = @{ Deploy = 'catest-mcp-facade';          Image = 'ghcr.io/ulyssesleolee/catest-mcp-facade:latest';          Module = 'python' }
    'trace-audit'         = @{ Deploy = 'catest-trace-audit';         Image = 'ghcr.io/ulyssesleolee/catest-trace-audit:latest';         Module = 'python' }
    'adapter-codex'       = @{ Deploy = 'catest-adapter-codex';       Image = 'ghcr.io/ulyssesleolee/catest-adapter-codex:latest';       Module = 'python' }
    'adapter-claude-code' = @{ Deploy = 'catest-adapter-claude-code'; Image = 'ghcr.io/ulyssesleolee/catest-adapter-claude-code:latest'; Module = 'python' }
    'adapter-antigravity' = @{ Deploy = 'catest-adapter-antigravity'; Image = 'ghcr.io/ulyssesleolee/catest-adapter-antigravity:latest'; Module = 'python' }
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
Log "[0/8] Pre-flight check..."
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

# ── 1. Build images (optional) ───────────────────────────────────────────────
if ($Build) {
    Log "[1/8] Building Docker images..."
    $rustDockerfile = Join-Path $PSScriptRoot 'rust.Dockerfile'
    $pythonDir = Join-Path $PSScriptRoot 'python'
    foreach ($name in $Selected) {
        $spec = $Services[$name]
        Log "  Building $name -> $($spec.Image)" Cyan
        if ($spec.Module -eq 'infra') {
            $infraDir = Join-Path $PSScriptRoot $spec.Dir
            docker build -t $spec.Image -f "$infraDir/Dockerfile" $infraDir
        } elseif ($spec.Module -eq 'rust') {
            docker build -t $spec.Image --build-arg "SERVICE_NAME=catest-$name" -f $rustDockerfile $PSScriptRoot
        } elseif ($spec.Module -eq 'web') {
            $webDir = Join-Path $PSScriptRoot 'web'
            $appDirName = ($spec.Dir -split '/')[-1]
            docker build -t $spec.Image -f "$webDir/apps/$appDirName/Dockerfile" $webDir
        } elseif ($spec.Module -eq 'python') {
            # Python services use Dockerfile.<service-name> from python/docker/
            $dockerfileName = "Dockerfile.$($name)"
            docker build -t $spec.Image -f "$pythonDir/docker/$dockerfileName" $pythonDir
        }
        if ($LASTEXITCODE -ne 0) { Fatal "Docker build failed for $name" }
    }
} else {
    Log "[1/8] Skipping image build (use -Build to enable)"
}

# ── 2. Base resources ─────────────────────────────────────────────────────────
Log "[2/8] Applying base resources (namespace, secrets, RBAC)..."
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
    Log "[3/8] Skipping infrastructure (use without -SkipInfra to deploy)"
} else {
    Log "[3/8] Deploying infrastructure (PG/Kafka/Memgraph/Qdrant/Arroyo)..."

    # ── 3a. Update ConfigMap BEFORE deploying postgres ────────────────────
    # Critical: if postgres PVC is fresh (Docker restart / K8s reset), the initdb
    # scripts from this ConfigMap run on first boot. Must be up-to-date FIRST.
    Log "  postgres-init-scripts (configmap, updated before PG deploy)" Cyan
    kubectl create configmap postgres-init-scripts `
        --from-file=scripts/initdb.d `
        --namespace $Namespace `
        --dry-run=client -o yaml | kubectl apply -f -
    if ($LASTEXITCODE -ne 0) { Warn "ConfigMap sync had issues" }

    # ── 3b. Deploy all infra StatefulSets/Deployments ────────────────────
    foreach ($infra in @('postgres', 'kafka', 'memgraph', 'qdrant', 'arroyo')) {
        $p = "$K8s/infra/$infra/"
        if (Test-Path $p) {
            Log "  $infra" Cyan
            kube apply -f $p
        }
    }

    # FIX: Ensure postgres uses IfNotPresent (local images, no GHCR push needed)
    Log "  Ensuring postgres imagePullPolicy=IfNotPresent..." DarkGray
    $prevEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    kubectl patch statefulset postgres -n $Namespace --type='json' `
        -p='[{"op":"replace","path":"/spec/template/spec/containers/0/imagePullPolicy","value":"IfNotPresent"}]' 2>&1 | Out-Null
    $ErrorActionPreference = $prevEAP

    # If postgres was rebuilt, restart the statefulset to pick up the new image
    if ('postgres' -in $Selected -and $Build) {
        Log "  Restarting postgres statefulset (new image with pgvector + AGE)..." Yellow
        kubectl rollout restart statefulset/postgres -n $Namespace 2>&1 | Out-Null
        kubectl rollout status statefulset/postgres -n $Namespace --timeout=120s 2>&1 | Out-Null
    }

    # External services
    $extSvc = "$K8s/infra/ext-services.yaml"
    if (Test-Path $extSvc) { kube apply -f $extSvc }

    # Cloudflare Tunnel (orchestration domain)
    $cfDir = "$K8s/infra/cloudflare/"
    if (Test-Path $cfDir) {
        Log "  cloudflare tunnel" Cyan
        kube apply -f $cfDir
    }

    # ── 3c. Wait for PostgreSQL, then ensure databases + schemas ─────────
    # This section is IDEMPOTENT — safe to run every time, even if initdb
    # already ran on fresh PVC. Covers the case where PVC survived but
    # databases were somehow lost, or new databases were added to the list.
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
        Log "  Ensuring all databases exist (idempotent)..." Cyan
        $initDir = Join-Path $PSScriptRoot 'scripts/initdb.d'
        if (Test-Path $initDir) {
            $prevEAP = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            $env:MSYS_NO_PATHCONV = '1'

            # All CATEST databases — single source of truth
            $AllDatabases = @(
                'catest_hub', 'catest_gateway', 'catest_ingestion', 'catest_intelligence',
                'catest_workspace', 'catest_review', 'catest_tm', 'catest_tb',
                'catest_orchestration'
            )
            $pgUser = if ($EnvVars.ContainsKey('POSTGRES_USER')) { $EnvVars['POSTGRES_USER'] } else { 'catest' }

            # Create databases (IF NOT EXISTS via error suppression)
            foreach ($db in $AllDatabases) {
                kubectl exec -n $Namespace postgres-0 -- psql -U $pgUser -c "CREATE DATABASE $db OWNER $pgUser;" 2>&1 | Out-Null
            }
            Log "    9 databases ensured" DarkGray

            # Enable extensions on all databases
            foreach ($db in $AllDatabases) {
                kubectl exec -n $Namespace postgres-0 -- psql -U $pgUser -d $db -c "CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS age;" 2>&1 | Out-Null
            }
            Log "    pgcrypto + pgvector + AGE enabled on all databases" DarkGray

            # Create tenants table in catest_intelligence (needed by rag-modules FK references)
            kubectl exec -n $Namespace postgres-0 -- psql -U $pgUser -d catest_intelligence -c "CREATE TABLE IF NOT EXISTS tenants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());" 2>&1 | Out-Null

            # Run all SQL init files in order (all use IF NOT EXISTS / ON CONFLICT, safe to re-run)
            foreach ($sql in (Get-ChildItem "$initDir/*.sql" | Sort-Object Name)) {
                Log "    $($sql.Name)" DarkGray
                kubectl exec -n $Namespace postgres-0 -- psql -U $pgUser -f "/docker-entrypoint-initdb.d/$($sql.Name)" 2>&1 | Out-Null
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

# ── 3.5. Manifest pre-flight (catch common mistakes before apply) ────────────
Log "  Manifest pre-flight check..." Cyan
$manifestIssues = @()
$webManifestDirs = @(
    @{ Name = 'web';                Dir = "$K8s/services/web/" }
    @{ Name = 'web-workspace';      Dir = "$K8s/services/web-workspace/" }
    @{ Name = 'web-rag';            Dir = "$K8s/services/web-rag/" }
    @{ Name = 'web-review';         Dir = "$K8s/services/web-review/" }
    @{ Name = 'web-team';           Dir = "$K8s/services/web-team/" }
    @{ Name = 'web-tm';             Dir = "$K8s/services/web-tm/" }
    @{ Name = 'web-tb';             Dir = "$K8s/services/web-tb/" }
    @{ Name = 'web-orchestration';  Dir = "$K8s/services/web-orchestration/" }
)
foreach ($wm in $webManifestDirs) {
    if (-not (Test-Path $wm.Dir)) { continue }
    $allYaml = Get-Content (Get-ChildItem "$($wm.Dir)*.yaml" | Select-Object -First 3) -Raw -ErrorAction SilentlyContinue
    if (-not $allYaml) { continue }
    # Check: secret name must be catest-app-secrets, not app-secrets
    if ($allYaml -match 'name:\s+app-secrets\b' -and $allYaml -notmatch 'name:\s+catest-app-secrets') {
        $manifestIssues += "$($wm.Name): wrong secret name (should be catest-app-secrets)"
    }
    # Check: SAAS_MODE must be true for K8s gateway routing
    if ($allYaml -match 'NEXT_PUBLIC_SAAS_MODE' -and $allYaml -match 'value:\s*"false"') {
        $manifestIssues += "$($wm.Name): NEXT_PUBLIC_SAAS_MODE=false (must be true for gateway routing)"
    }
    # Check: imagePullPolicy should be IfNotPresent for local images
    if ($allYaml -match 'imagePullPolicy:\s*Always') {
        $manifestIssues += "$($wm.Name): imagePullPolicy=Always (should be IfNotPresent for local images)"
    }
    # Check: postgres port must match .env POSTGRES_PORT (Service port), not 5432 (container port)
    if ($allYaml -match 'postgres://.*:5432/') {
        $manifestIssues += "$($wm.Name): postgres port=5432 (should be $PostgresPort — from .env POSTGRES_PORT)"
    }
}
if ($manifestIssues.Count -gt 0) {
    foreach ($issue in $manifestIssues) { Warn "Manifest: $issue" }
    Warn "Fix these issues before deploying to avoid runtime failures."
} else {
    Log "    All web manifests passed pre-flight checks" DarkGray
}

# ── 4. Application services ──────────────────────────────────────────────────
Log "[4/8] Deploying application services..."

# Fixed ordering: backend first, then frontend, then orchestration
$applyOrder = @(
    # Core backend
    'gateway', 'parser', 'embedding', 'review', 'ingestion',
    # Web frontends
    'web', 'web-workspace', 'web-rag', 'web-review', 'web-team', 'web-tm', 'web-tb',
    'web-orchestration',
    # Orchestration domain
    'intent-gateway', 'orchestrator-svc', 'memory-service', 'dispatch-router',
    'mcp-facade', 'trace-audit',
    'adapter-codex', 'adapter-claude-code', 'adapter-antigravity'
)

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
    Log "[5/8] Skipping rollout check"
} else {
    Log "[5/8] Waiting for rollouts..."
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

# ── 6. Port forwarding (via port-config.ps1) ────────────────────────────────
Log "[6/8] Detecting and fixing port accessibility..."
$portConfigScript = Join-Path $PSScriptRoot 'port-config.ps1'
if (Test-Path $portConfigScript) {
    # Kill stale port-forwards that may have died during rollout restarts
    Get-Process -Name 'kubectl' -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'port-forward' } |
        Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    # Probe detects dead/down ports and auto-starts port-forwards for them
    . $portConfigScript -Probe
    # $Ports and $PortStatus are now available (dead ports auto-forwarded to alt ports)
    $nativeCount = @($PortStatus.Values | Where-Object { $_.Status -eq 'native' }).Count
    $fwdCount    = @($PortStatus.Values | Where-Object { $_.Status -eq 'forwarded' }).Count
    $deadCount   = @($PortStatus.Values | Where-Object { $_.Status -eq 'dead' }).Count
    $downCount   = @($PortStatus.Values | Where-Object { $_.Status -eq 'down' }).Count
    Log "  Native: $nativeCount | Forwarded: $fwdCount | Dead: $deadCount | Down: $downCount" $(
        if ($deadCount -eq 0 -and $downCount -eq 0) { 'Green' } else { 'Yellow' }
    )
} else {
    Warn "port-config.ps1 not found — falling back to basic port check"
    $Ports = @{}
}

# ── 7. Orchestration service health check ────────────────────────────────────
Log "[7/8] Checking orchestration services..."
$orchServices = @{
    'intent-gateway' = 34090
    'mcp-facade'     = 34098
}
$prevEAP3 = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
foreach ($svc in $orchServices.Keys) {
    $port = $orchServices[$svc]
    $podName = "catest-$svc"
    $env:MSYS_NO_PATHCONV = '1'
    $podReady = kubectl get pod -n $Namespace -l "app=$podName" -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>&1
    $env:MSYS_NO_PATHCONV = $null
    if ($podReady -eq 'true') {
        Log "  $svc (:$port) -> Ready" Green
    } else {
        Warn "$svc (:$port) -> Not ready yet"
    }
}
# MCP endpoint check (if mcp-facade is deployed)
$env:MSYS_NO_PATHCONV = '1'
$mcpPod = kubectl get pod -n $Namespace -l app=catest-mcp-facade -o jsonpath='{.items[0].metadata.name}' 2>&1
$env:MSYS_NO_PATHCONV = $null
if ($mcpPod -and $LASTEXITCODE -eq 0) {
    $env:MSYS_NO_PATHCONV = '1'
    $healthz = kubectl exec -n $Namespace $mcpPod -- curl -s http://localhost:34098/healthz 2>&1
    $env:MSYS_NO_PATHCONV = $null
    if ($healthz -match 'mcp_endpoint') {
        Log "  MCP Server (/mcp) -> Healthy" Green
    } else {
        Warn "MCP Server healthz returned unexpected response"
    }
}
$ErrorActionPreference = $prevEAP3

# ── 8. Verification ─────────────────────────────────────────────────────────
Log "[8/8] Verifying deployment..."
Write-Host ""

# 8a. Pod status check
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
        Warn "For Python AI services: ./python/build-images.ps1"
    }
    if ($crashPods.Count -gt 0) {
        Warn "CrashLoopBackOff: Check logs with: kubectl logs -n $Namespace <pod-name>"
    }
}

# 8b. Web port accessibility check (using $Ports from port-config.ps1)
Write-Host ""
Log "  Web service accessibility:" Cyan
$allPortsOk = $true
$webServices = @('web-base', 'web-workspace', 'web-rag', 'web-review', 'web-team', 'web-tm', 'web-tb', 'web-orchestration', 'envoy-gateway')
foreach ($svcName in $webServices) {
    $port = if ($Ports -and $Ports[$svcName]) { $Ports[$svcName] } else { $null }
    if (-not $port) { continue }
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:$port/" -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 5 -ErrorAction SilentlyContinue 2>&1
        $code = $resp.StatusCode
    } catch {
        if ($_.Exception.Response) {
            $code = [int]$_.Exception.Response.StatusCode
        } else {
            $code = 0
        }
    }
    if ($code -gt 0) {
        Log "    http://localhost:$port ($svcName) -> HTTP $code" Green
    } else {
        Log "    http://localhost:$port ($svcName) -> UNREACHABLE" Red
        $allPortsOk = $false
    }
}

# 8c. Infrastructure service check
Write-Host ""
Log "  Infrastructure pods:" Cyan
foreach ($infra in @('postgres-0', 'kafka-0', 'memgraph-0', 'qdrant-0')) {
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
# Use detected ports from port-config.ps1 (falls back to defaults if unavailable)
$pGateway = if ($Ports -and $Ports['envoy-gateway']) { $Ports['envoy-gateway'] } else { 33088 }
$pMCP     = if ($Ports -and $Ports['mcp-facade'])    { $Ports['mcp-facade'] }    else { 34098 }
Log "  Gateway       : http://localhost:$pGateway  (unified entry point — use this!)"
Log "  Dashboard     : http://localhost:$pGateway/"
Log "  Workspace     : http://localhost:$pGateway/workspace/"
Log "  RAG           : http://localhost:$pGateway/rag/"
Log "  Review        : http://localhost:$pGateway/review/"
Log "  Team          : http://localhost:$pGateway/team/"
Log "  TM            : http://localhost:$pGateway/tm/"
Log "  TB            : http://localhost:$pGateway/tb/"
Log "  Orchestration : http://localhost:$pGateway/orchestration/ (steampunk chat UI)"
Log "  MCP Facade    : http://localhost:$pMCP/healthz (MCP at /mcp)"
Write-Host ""

# ── 8d. Navigation smoke test ───────────────────────────────────────────────
# Verify that envoy gateway correctly routes to all apps (SaaS mode navigation)
Log "  Navigation routing check (via gateway :$pGateway):" Cyan
$navRoutes = @(
    @{ Path = '/';               Name = 'Dashboard' }
    @{ Path = '/workspace';      Name = 'Workspace' }
    @{ Path = '/rag';            Name = 'RAG' }
    @{ Path = '/review';         Name = 'Review' }
    @{ Path = '/team';           Name = 'Team' }
    @{ Path = '/tm';             Name = 'TM' }
    @{ Path = '/tb';             Name = 'TB' }
    @{ Path = '/orchestration';  Name = 'Orchestration' }
)
$navOk = $true
foreach ($route in $navRoutes) {
    $url = "http://localhost:$pGateway$($route.Path)"
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 5 -ErrorAction SilentlyContinue 2>&1
        $code = $resp.StatusCode
    } catch {
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode } else { $code = 0 }
    }
    if ($code -gt 0) {
        Log "    $($route.Name.PadRight(16)) $($route.Path.PadRight(20)) -> HTTP $code" Green
    } else {
        Log "    $($route.Name.PadRight(16)) $($route.Path.PadRight(20)) -> UNREACHABLE" Red
        $navOk = $false
    }
}
if ($navOk) {
    Log "  All navigation routes reachable via gateway" Green
} else {
    Warn "Some routes unreachable — sidebar navigation may be broken"
    Warn "Ensure envoy-gateway routes.yaml includes all app paths"
}
Write-Host ""
