#!/usr/bin/env pwsh
# Quick image loader for kind/k3d clusters
# Usage:
#   ./load-images.ps1              # Load all built images
#   ./load-images.ps1 -Only web    # Load specific service images

[CmdletBinding()]
param(
    [string]$Only = ''  # Comma-separated service names
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Service registry (mirrored from k8s-restart.ps1)
$Services = @{
    gateway   = @{ Image = 'ghcr.io/ulyssesleolee/catest-gateway:latest' }
    parser    = @{ Image = 'ghcr.io/ulyssesleolee/catest-parser:latest' }
    embedding = @{ Image = 'ghcr.io/ulyssesleolee/catest-embedding:latest' }
    review    = @{ Image = 'ghcr.io/ulyssesleolee/catest-review:latest' }
    ingestion = @{ Image = 'ghcr.io/ulyssesleolee/catest-ingestion:latest' }
    web       = @{ Image = 'ghcr.io/ulyssesleolee/catest-web:latest' }
    'web-workspace' = @{ Image = 'ghcr.io/ulyssesleolee/catest-web-workspace:latest' }
    'web-rag'       = @{ Image = 'ghcr.io/ulyssesleolee/catest-web-rag:latest' }
    'web-review'    = @{ Image = 'ghcr.io/ulyssesleolee/catest-web-review:latest' }
    'web-team'      = @{ Image = 'ghcr.io/ulyssesleolee/catest-web-team:latest' }
}

# Helpers
function Log { param([string]$M, [string]$C = 'Green') Write-Host $M -ForegroundColor $C }
function Warn { param([string]$M) Write-Host "  WARN: $M" -ForegroundColor Yellow }
function Fatal { param([string]$M) Write-Host "  FATAL: $M" -ForegroundColor Red; exit 1 }

# Check prerequisites
foreach ($cmd in @('docker', 'kubectl')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Fatal "$cmd not found" }
}

# Detect cluster type
$ctx = kubectl config current-context 2>&1
if ($ctx -match 'kind') {
    $ClusterType = 'kind'
    $LoadCmd = { param($img) kind load docker-image $img }
} elseif ($ctx -match 'k3d') {
    $ClusterType = 'k3d'
    $LoadCmd = { param($img) k3d image import $img }
} else {
    Fatal "Cluster type not detected. Only kind and k3d are supported by this script."
}

Write-Host ""
Log "Loading images into $ClusterType cluster..."
Write-Host ""

# Determine which services
$Selected = if ($Only -ne '') {
    $Only -split ',' | ForEach-Object { $_.Trim().ToLower() }
} else {
    $Services.Keys
}

$loaded = 0
$failed = 0

foreach ($name in $Selected) {
    if (-not $Services.ContainsKey($name)) {
        Warn "Unknown service: $name"
        continue
    }

    $image = $Services[$name].Image
    $shortImage = $image -split '/' | Select-Object -Last 1

    # Check if image exists locally
    $exists = docker images --quiet $image 2>$null
    if (-not $exists) {
        Warn "Skipping $shortImage (not found locally — build first with: ./k8s-restart.ps1 -Build)"
        continue
    }

    Log "  Loading $shortImage..." Cyan
    & $LoadCmd $image 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Log "    ✓ Loaded" Green
        $loaded++
    } else {
        Log "    ✗ Failed" Red
        $failed++
    }
}

Write-Host ""
if ($failed -eq 0) {
    Log "✓ Successfully loaded $loaded image(s)" Green
} else {
    Log "✓ Loaded $loaded image(s), $failed failed" Yellow
}

Log ""
Log "Next step: ./k8s-restart.ps1 -SkipInfra" DarkGray
Write-Host ""
