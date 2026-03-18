#!/usr/bin/env pwsh
# CATEST Docker Image Build Script
# Usage:
#   ./k8s-build.ps1                    # Build all images
#   ./k8s-build.ps1 -Only gateway,web  # Build specific images
#   ./k8s-build.ps1 -Rust              # Build only Rust services
#   ./k8s-build.ps1 -Web               # Build only Web apps

[CmdletBinding()]
param(
    [string]$Only = '',
    [switch]$Rust,
    [switch]$Web
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot

# ── Image registry ────────────────────────────────────────────────────────────
$Images = [ordered]@{
    # Rust services (built from rust.Dockerfile with SERVICE_NAME arg)
    gateway   = @{ Tag = 'ghcr.io/ulyssesleolee/catest-gateway:latest';       Type = 'rust'; Bin = 'catest-gateway' }
    parser    = @{ Tag = 'ghcr.io/ulyssesleolee/catest-parser:latest';        Type = 'rust'; Bin = 'catest-parser' }
    embedding = @{ Tag = 'ghcr.io/ulyssesleolee/catest-embedding:latest';     Type = 'rust'; Bin = 'catest-embedding' }
    review    = @{ Tag = 'ghcr.io/ulyssesleolee/catest-review:latest';        Type = 'rust'; Bin = 'catest-review' }
    ingestion = @{ Tag = 'ghcr.io/ulyssesleolee/catest-ingestion:latest';     Type = 'rust'; Bin = 'catest-ingestion' }
    # Web apps (each has its own Dockerfile under web/apps/<name>/)
    web            = @{ Tag = 'ghcr.io/ulyssesleolee/catest-web:latest';           Type = 'web'; Dir = 'web-base' }
    'web-workspace'= @{ Tag = 'ghcr.io/ulyssesleolee/catest-web-workspace:latest'; Type = 'web'; Dir = 'web-workspace' }
    'web-rag'      = @{ Tag = 'ghcr.io/ulyssesleolee/catest-web-rag:latest';       Type = 'web'; Dir = 'web-rag' }
    'web-review'   = @{ Tag = 'ghcr.io/ulyssesleolee/catest-web-review:latest';    Type = 'web'; Dir = 'web-review' }
    'web-team'     = @{ Tag = 'ghcr.io/ulyssesleolee/catest-web-team:latest';      Type = 'web'; Dir = 'web-team' }
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
} else {
    $Images.Keys
}

Write-Host ""
Write-Host "Building: $($targets -join ', ')" -ForegroundColor Cyan
Write-Host ""

# ── Build ─────────────────────────────────────────────────────────────────────
$failed = @()
$sw = [System.Diagnostics.Stopwatch]::StartNew()

foreach ($name in $targets) {
    $spec = $Images[$name]
    $tag = $spec.Tag
    Write-Host "[$name] Building -> $tag" -ForegroundColor Yellow

    $buildSw = [System.Diagnostics.Stopwatch]::StartNew()

    if ($spec.Type -eq 'rust') {
        docker build -t $tag `
            --build-arg "SERVICE_NAME=$($spec.Bin)" `
            -f "$Root/rust.Dockerfile" `
            $Root
    } else {
        docker build -t $tag `
            -f "$Root/web/apps/$($spec.Dir)/Dockerfile" `
            "$Root/web"
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
