#!/usr/bin/env pwsh
# CATEST Web Hot Reload Script
# Rebuilds web app Docker images and restarts K8s deployments.
# Docker Desktop K8s shares the Docker daemon, so rebuilt images are immediately available.
#
# Usage:
#   ./hot-reload-web.ps1                    # Rebuild & reload ALL 5 web apps
#   ./hot-reload-web.ps1 -App web-review    # Rebuild & reload a single app
#   ./hot-reload-web.ps1 -HMR              # Just touch UI package to trigger HMR (no K8s)

[CmdletBinding()]
param(
    [string]$App = '',       # Specific app (e.g., web-review). Empty = all apps.
    [switch]$HMR,            # HMR-only mode: touch UI index.ts, skip K8s rebuild
    [string]$Namespace = 'catest'
)

$ErrorActionPreference = 'Continue'
$Root = $PSScriptRoot
$WebDir = Join-Path $Root 'web'

function Log { param([string]$M, [string]$C = 'Green') Write-Host $M -ForegroundColor $C }

# ── Image tag mapping ────────────────────────────────────────────────
$ImageTags = @{
    'web-base'      = 'ghcr.io/ulyssesleolee/catest-web:latest'
    'web-workspace' = 'ghcr.io/ulyssesleolee/catest-web-workspace:latest'
    'web-rag'       = 'ghcr.io/ulyssesleolee/catest-web-rag:latest'
    'web-review'    = 'ghcr.io/ulyssesleolee/catest-web-review:latest'
    'web-team'      = 'ghcr.io/ulyssesleolee/catest-web-team:latest'
}

# ── HMR-only mode ────────────────────────────────────────────────────
if ($HMR) {
    $uiIndex = Join-Path $WebDir 'packages/ui/src/index.ts'
    if (Test-Path $uiIndex) {
        (Get-Item $uiIndex).LastWriteTime = Get-Date
        Log "Touched @catest/ui/src/index.ts — HMR will refresh dev servers" Cyan
    }
    exit 0
}

# ── Determine which apps to rebuild ──────────────────────────────────
$Apps = if ($App -ne '') {
    if (-not $ImageTags.ContainsKey($App)) {
        Write-Host "Unknown app: $App. Valid: $($ImageTags.Keys -join ', ')" -ForegroundColor Red
        exit 1
    }
    @($App)
} else {
    @('web-base', 'web-workspace', 'web-rag', 'web-review', 'web-team')
}

$totalSw = [System.Diagnostics.Stopwatch]::StartNew()
$total = $Apps.Count
$current = 0

Write-Host ""
Log "══════════════════════════════════════════════" Cyan
Log "  CATEST Web Image Rebuild ($total app(s))" Cyan
Log "══════════════════════════════════════════════" Cyan
Write-Host ""

foreach ($appName in $Apps) {
    $current++
    $tag = $ImageTags[$appName]
    $deploy = "catest-$appName"
    $dockerfile = Join-Path $WebDir "apps/$appName/Dockerfile"
    $appSw = [System.Diagnostics.Stopwatch]::StartNew()

    Log "[$current/$total] $appName" Yellow

    # 1. Build image (no cache to ensure latest source)
    if (-not (Test-Path $dockerfile)) {
        Write-Host "  Dockerfile not found: $dockerfile" -ForegroundColor Red
        continue
    }
    Log "  Building $tag ..." Cyan
    docker build --no-cache -t $tag -f $dockerfile $WebDir 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Build FAILED for $appName" -ForegroundColor Red
        continue
    }

    # 2. Restart deployment (Docker Desktop K8s picks up rebuilt images automatically)
    Log "  Restarting deployment/$deploy ..." Cyan
    kubectl rollout restart deployment/$deploy -n $Namespace 2>&1 | Out-Null
    kubectl rollout status deployment/$deploy -n $Namespace --timeout=120s 2>&1 | Out-Null

    $appSw.Stop()
    Log "  $appName done ($([math]::Round($appSw.Elapsed.TotalSeconds))s)" Green
    Write-Host ""
}

$totalSw.Stop()

# ── Summary ──────────────────────────────────────────────────────────
Write-Host ""
Log "══════════════════════════════════════════════" Green
Log "  All done! ($([math]::Round($totalSw.Elapsed.TotalMinutes, 1)) min)" Green
Log "══════════════════════════════════════════════" Green
Log "  Gateway: http://localhost:33088" Cyan
Write-Host ""
