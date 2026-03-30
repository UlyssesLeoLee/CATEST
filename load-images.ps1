#!/usr/bin/env pwsh
# Image diagnostic tool for Docker Desktop Kubernetes
# Docker Desktop K8s shares the Docker daemon — local images are directly available.
# This script checks which images exist locally and are ready for deployment.
#
# Usage:
#   ./load-images.ps1              # Check all images
#   ./load-images.ps1 -Only web    # Check specific service images

[CmdletBinding()]
param(
    [string]$Only = ''  # Comma-separated service names
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Service registry (mirrored from k8s-restart.ps1)
$Services = @{
    # Infrastructure
    postgres  = @{ Image = 'ghcr.io/ulyssesleolee/catest-postgres:latest' }
    # Rust
    gateway   = @{ Image = 'ghcr.io/ulyssesleolee/catest-gateway:latest' }
    parser    = @{ Image = 'ghcr.io/ulyssesleolee/catest-parser:latest' }
    embedding = @{ Image = 'ghcr.io/ulyssesleolee/catest-embedding:latest' }
    review    = @{ Image = 'ghcr.io/ulyssesleolee/catest-review:latest' }
    ingestion = @{ Image = 'ghcr.io/ulyssesleolee/catest-ingestion:latest' }
    # Web
    web       = @{ Image = 'ghcr.io/ulyssesleolee/catest-web:latest' }
    'web-workspace' = @{ Image = 'ghcr.io/ulyssesleolee/catest-web-workspace:latest' }
    'web-rag'       = @{ Image = 'ghcr.io/ulyssesleolee/catest-web-rag:latest' }
    'web-review'    = @{ Image = 'ghcr.io/ulyssesleolee/catest-web-review:latest' }
    'web-team'      = @{ Image = 'ghcr.io/ulyssesleolee/catest-web-team:latest' }
    'web-tm'        = @{ Image = 'ghcr.io/ulyssesleolee/catest-web-tm:latest' }
    'web-tb'        = @{ Image = 'ghcr.io/ulyssesleolee/catest-web-tb:latest' }
    'web-orchestration' = @{ Image = 'ghcr.io/ulyssesleolee/catest-web-orchestration:latest' }
    # Python AI / Orchestration domain
    'intent-gateway'      = @{ Image = 'ghcr.io/ulyssesleolee/catest-intent-gateway:latest' }
    'orchestrator-svc'    = @{ Image = 'ghcr.io/ulyssesleolee/catest-orchestrator-svc:latest' }
    'memory-service'      = @{ Image = 'ghcr.io/ulyssesleolee/catest-memory-service:latest' }
    'dispatch-router'     = @{ Image = 'ghcr.io/ulyssesleolee/catest-dispatch-router:latest' }
    'mcp-facade'          = @{ Image = 'ghcr.io/ulyssesleolee/catest-mcp-facade:latest' }
    'trace-audit'         = @{ Image = 'ghcr.io/ulyssesleolee/catest-trace-audit:latest' }
    'adapter-codex'       = @{ Image = 'ghcr.io/ulyssesleolee/catest-adapter-codex:latest' }
    'adapter-claude-code' = @{ Image = 'ghcr.io/ulyssesleolee/catest-adapter-claude-code:latest' }
    'adapter-antigravity' = @{ Image = 'ghcr.io/ulyssesleolee/catest-adapter-antigravity:latest' }
}

# Helpers
function Log { param([string]$M, [string]$C = 'Green') Write-Host $M -ForegroundColor $C }
function Fatal { param([string]$M) Write-Host "  FATAL: $M" -ForegroundColor Red; exit 1 }

# Check prerequisites
if (-not (Get-Command 'docker' -ErrorAction SilentlyContinue)) { Fatal "docker not found" }

# Determine which services
$Selected = if ($Only -ne '') {
    $Only -split ',' | ForEach-Object { $_.Trim().ToLower() }
} else {
    $Services.Keys
}

Write-Host ""
Log "Checking local Docker images for Docker Desktop Kubernetes..."
Write-Host ""

$available = 0
$missing = 0

foreach ($name in $Selected) {
    if (-not $Services.ContainsKey($name)) {
        Write-Host "  WARN: Unknown service: $name" -ForegroundColor Yellow
        continue
    }

    $image = $Services[$name].Image
    $shortImage = $image -split '/' | Select-Object -Last 1

    $exists = docker images --quiet $image 2>$null
    if ($exists) {
        Log "  OK $shortImage" Green
        $available++
    } else {
        Log "  XX $shortImage (not built)" Red
        $missing++
    }
}

Write-Host ""
if ($missing -eq 0) {
    Log "All $available image(s) available. Docker Desktop K8s can use them directly." Green
} else {
    Log "$available available, $missing missing." Yellow
    Log "  Rust/Web/Infra: ./k8s-build.ps1 -Build" Yellow
    Log "  Python AI:      ./python/build-images.ps1" Yellow
}
Write-Host ""
