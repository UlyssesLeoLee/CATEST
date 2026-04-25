#!/usr/bin/env pwsh
# CATEST Docker Image Build Script
# Usage:
#   ./k8s-build.ps1                    # Build all images
#   ./k8s-build.ps1 -Only gateway,web  # Build specific images
#   ./k8s-build.ps1 -Rust              # Build only Rust services
#   ./k8s-build.ps1 -Web               # Build only Web apps
#   ./k8s-build.ps1 -Python            # Build only Python AI services (orchestration)
#   ./k8s-build.ps1 -Infra             # Build only infra images (postgres w/ pgvector+AGE)
#   ./k8s-build.ps1 -Only postgres     # Rebuild just PostgreSQL

[CmdletBinding()]
param(
    [string]$Only = '',
    [switch]$Rust,
    [switch]$Web,
    [switch]$Python,
    [switch]$Infra
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot

# ── Image registry ────────────────────────────────────────────────────────────
$Images = [ordered]@{
    # Infrastructure (custom images with extensions)
    postgres  = @{ Tag = 'ghcr.io/ulyssesleolee/catest-postgres:latest';    Type = 'infra'; Dir = 'docker/postgres' }
    # Rust services (built from rust.Dockerfile with SERVICE_NAME arg)
    gateway   = @{ Tag = 'ghcr.io/ulyssesleolee/catest-gateway:latest';       Type = 'rust'; Bin = 'catest-gateway' }
    parser    = @{ Tag = 'ghcr.io/ulyssesleolee/catest-parser:latest';        Type = 'rust'; Bin = 'catest-parser' }
    embedding = @{ Tag = 'ghcr.io/ulyssesleolee/catest-embedding:latest';     Type = 'rust'; Bin = 'catest-embedding' }
    review    = @{ Tag = 'ghcr.io/ulyssesleolee/catest-review:latest';        Type = 'rust'; Bin = 'catest-review' }
    ingestion = @{ Tag = 'ghcr.io/ulyssesleolee/catest-ingestion:latest';     Type = 'rust'; Bin = 'catest-ingestion' }
    batch     = @{ Tag = 'ghcr.io/ulyssesleolee/catest-batch:latest';         Type = 'rust'; Bin = 'catest-batch' }
    # Web apps (each has its own Dockerfile under web/apps/<name>/)
    web            = @{ Tag = 'ghcr.io/ulyssesleolee/catest-web:latest';              Type = 'web'; Dir = 'web-base' }
    'web-workspace'= @{ Tag = 'ghcr.io/ulyssesleolee/catest-web-workspace:latest';    Type = 'web'; Dir = 'web-workspace' }
    'web-rag'      = @{ Tag = 'ghcr.io/ulyssesleolee/catest-web-rag:latest';          Type = 'web'; Dir = 'web-rag' }
    'web-review'   = @{ Tag = 'ghcr.io/ulyssesleolee/catest-web-review:latest';       Type = 'web'; Dir = 'web-review' }
    'web-team'     = @{ Tag = 'ghcr.io/ulyssesleolee/catest-web-team:latest';         Type = 'web'; Dir = 'web-team' }
    'web-tm'       = @{ Tag = 'ghcr.io/ulyssesleolee/catest-web-tm:latest';           Type = 'web'; Dir = 'web-tm' }
    'web-tb'       = @{ Tag = 'ghcr.io/ulyssesleolee/catest-web-tb:latest';           Type = 'web'; Dir = 'web-tb' }
    'web-orchestration' = @{ Tag = 'ghcr.io/ulyssesleolee/catest-web-orchestration:latest'; Type = 'web'; Dir = 'web-orchestration' }
    # Python AI services (orchestration domain — built from python/docker/Dockerfile.<name>)
    'intent-gateway'      = @{ Tag = 'ghcr.io/ulyssesleolee/catest-intent-gateway:latest';      Type = 'python'; Svc = 'intent-gateway' }
    'orchestrator-svc'    = @{ Tag = 'ghcr.io/ulyssesleolee/catest-orchestrator-svc:latest';    Type = 'python'; Svc = 'orchestrator-svc' }
    'memory-service'      = @{ Tag = 'ghcr.io/ulyssesleolee/catest-memory-service:latest';      Type = 'python'; Svc = 'memory-service' }
    'dispatch-router'     = @{ Tag = 'ghcr.io/ulyssesleolee/catest-dispatch-router:latest';     Type = 'python'; Svc = 'dispatch-router' }
    'mcp-facade'          = @{ Tag = 'ghcr.io/ulyssesleolee/catest-mcp-facade:latest';          Type = 'python'; Svc = 'mcp-facade' }
    'trace-audit'         = @{ Tag = 'ghcr.io/ulyssesleolee/catest-trace-audit:latest';         Type = 'python'; Svc = 'trace-audit' }
    'adapter-codex'       = @{ Tag = 'ghcr.io/ulyssesleolee/catest-adapter-codex:latest';       Type = 'python'; Svc = 'adapter-codex' }
    'adapter-claude-code' = @{ Tag = 'ghcr.io/ulyssesleolee/catest-adapter-claude-code:latest'; Type = 'python'; Svc = 'adapter-claude-code' }
    'adapter-antigravity' = @{ Tag = 'ghcr.io/ulyssesleolee/catest-adapter-antigravity:latest'; Type = 'python'; Svc = 'adapter-antigravity' }
    # Vector-ops (graph + Qdrant bridge, port 34085)
    'vector-ops'          = @{ Tag = 'ghcr.io/ulyssesleolee/catest-ai-vector-ops:latest';      Type = 'python'; Svc = 'vector-ops' }
}

# ── Select targets ────────────────────────────────────────────────────────────
$targets = if ($Only -ne '') {
    $names = $Only -split ',' | ForEach-Object { $_.Trim().ToLower() }
    foreach ($n in $names) {
        if (-not $Images.Contains($n)) {
            Write-Host "Unknown image: $n. Valid: $($Images.Keys -join ', ')" -ForegroundColor Red
            exit 1
        }
    }
    $names
} elseif ($Rust) {
    $Images.Keys | Where-Object { $Images[$_].Type -eq 'rust' }
} elseif ($Web) {
    $Images.Keys | Where-Object { $Images[$_].Type -eq 'web' }
} elseif ($Python) {
    $Images.Keys | Where-Object { $Images[$_].Type -eq 'python' }
} elseif ($Infra) {
    $Images.Keys | Where-Object { $Images[$_].Type -eq 'infra' }
} else {
    $Images.Keys
}

Write-Host ""
Write-Host "Building: $($targets -join ', ')" -ForegroundColor Cyan
Write-Host ""

# ── Ensure Python AI base image exists (for Python builds) ───────────────────
$pythonTargets = @($targets | Where-Object { $Images[$_].Type -eq 'python' })
if ($pythonTargets.Count -gt 0) {
    $baseImage = 'ghcr.io/ulyssesleolee/catest-ai-base:latest'
    $baseExists = docker images --quiet $baseImage 2>$null
    if (-not $baseExists) {
        Write-Host "[pre] Building Python AI base image..." -ForegroundColor Yellow
        docker build -t $baseImage -f "$Root/python/docker/Dockerfile.base" "$Root/python"
        if ($LASTEXITCODE -ne 0) { Write-Host "FATAL: AI base image build failed" -ForegroundColor Red; exit 1 }
        Write-Host "[pre] AI base image ready" -ForegroundColor Green
    }
}

# ── Build ─────────────────────────────────────────────────────────────────────
$failed = @()
$sw = [System.Diagnostics.Stopwatch]::StartNew()

foreach ($name in $targets) {
    $spec = $Images[$name]
    $tag = $spec.Tag
    Write-Host "[$name] Building -> $tag" -ForegroundColor Yellow

    $buildSw = [System.Diagnostics.Stopwatch]::StartNew()

    if ($spec.Type -eq 'infra') {
        docker build -t $tag `
            -f "$Root/$($spec.Dir)/Dockerfile" `
            "$Root/$($spec.Dir)"
    } elseif ($spec.Type -eq 'rust') {
        docker build -t $tag `
            --build-arg "SERVICE_NAME=$($spec.Bin)" `
            -f "$Root/rust.Dockerfile" `
            $Root
    } elseif ($spec.Type -eq 'web') {
        docker build -t $tag `
            -f "$Root/web/apps/$($spec.Dir)/Dockerfile" `
            "$Root/web"
    } elseif ($spec.Type -eq 'python') {
        docker build -t $tag `
            -f "$Root/python/docker/Dockerfile.$($spec.Svc)" `
            "$Root/python"
    }

    $buildSw.Stop()

    if ($LASTEXITCODE -ne 0) {
        Write-Host "[$name] FAILED ($([math]::Round($buildSw.Elapsed.TotalSeconds))s)" -ForegroundColor Red
        $failed += $name
    } else {
        Write-Host "[$name] OK ($([math]::Round($buildSw.Elapsed.TotalSeconds))s)" -ForegroundColor Green
    }
}

$sw.Stop()

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "==============================" -ForegroundColor Cyan
$built = $targets | Where-Object { $_ -notin $failed }
Write-Host "  Built : $($built.Count)/$($targets.Count) ($([math]::Round($sw.Elapsed.TotalMinutes, 1)) min)" -ForegroundColor Green
if ($failed.Count -gt 0) {
    Write-Host "  Failed: $($failed -join ', ')" -ForegroundColor Red
}
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

if ($failed.Count -gt 0) { exit 1 }
