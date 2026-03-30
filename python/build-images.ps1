#!/usr/bin/env pwsh
# Build all Python AI service Docker images
# Usage:
#   ./python/build-images.ps1                  # Build all Python AI images
#   ./python/build-images.ps1 -Only mcp-facade # Build specific service

[CmdletBinding()]
param(
    [string]$Only = ''  # Comma-separated service names
)

$ErrorActionPreference = "Stop"
$REGISTRY = "ghcr.io/ulyssesleolee"
$PYTHON_DIR = "$PSScriptRoot"

# All Python AI services with their Dockerfile names and ports
$services = @(
    # Existing AI services
    @{ name = "orchestrator"; dockerfile = "Dockerfile.orchestrator"; port = 34080 },
    @{ name = "note";         dockerfile = "Dockerfile.note";         port = 34083 },
    @{ name = "tm";           dockerfile = "Dockerfile.tm";           port = 34081 },
    @{ name = "tb";           dockerfile = "Dockerfile.tb";           port = 34082 },
    @{ name = "qe";           dockerfile = "Dockerfile.qe";           port = 34084 },
    @{ name = "consumer";     dockerfile = "Dockerfile.consumer";     port = 0     },
    @{ name = "vector-ops";   dockerfile = "Dockerfile.vector-ops";   port = 34085 },
    # Orchestration domain services
    @{ name = "intent-gateway";      dockerfile = "Dockerfile.intent-gateway";      port = 34090 },
    @{ name = "orchestrator-svc";    dockerfile = "Dockerfile.orchestrator-svc";    port = 34091 },
    @{ name = "memory-service";      dockerfile = "Dockerfile.memory-service";      port = 34092 },
    @{ name = "dispatch-router";     dockerfile = "Dockerfile.dispatch-router";     port = 34093 },
    @{ name = "mcp-facade";          dockerfile = "Dockerfile.mcp-facade";          port = 34098 },
    @{ name = "trace-audit";         dockerfile = "Dockerfile.trace-audit";         port = 34097 },
    @{ name = "adapter-codex";       dockerfile = "Dockerfile.adapter-codex";       port = 34094 },
    @{ name = "adapter-claude-code"; dockerfile = "Dockerfile.adapter-claude-code"; port = 34095 },
    @{ name = "adapter-antigravity"; dockerfile = "Dockerfile.adapter-antigravity"; port = 34096 },
    @{ name = "mcp-relay";           dockerfile = "Dockerfile.mcp-relay";           port = 8090  },
)

# Filter if -Only specified
if ($Only -ne '') {
    $names = $Only -split ',' | ForEach-Object { $_.Trim().ToLower() }
    $services = $services | Where-Object { $_.name -in $names }
    if ($services.Count -eq 0) {
        Write-Host "No matching services found. Available:" -ForegroundColor Red
        Write-Host "  orchestrator, note, tm, tb, qe, consumer, vector-ops" -ForegroundColor Gray
        Write-Host "  intent-gateway, orchestrator-svc, memory-service, dispatch-router" -ForegroundColor Gray
        Write-Host "  mcp-facade, trace-audit, adapter-codex, adapter-claude-code, adapter-antigravity, mcp-relay" -ForegroundColor Gray
        exit 1
    }
}

Write-Host "=== Building Python AI base image ===" -ForegroundColor Cyan
docker build -t "${REGISTRY}/catest-ai-base:latest" -f "$PYTHON_DIR/docker/Dockerfile.base" "$PYTHON_DIR"
if ($LASTEXITCODE -ne 0) { Write-Error "Base image build failed"; exit 1 }

$failed = @()
foreach ($svc in $services) {
    $name = $svc.name
    $image = "${REGISTRY}/catest-ai-${name}:latest"
    $dockerfile = "$PYTHON_DIR/docker/$($svc.dockerfile)"
    if (-not (Test-Path $dockerfile)) {
        Write-Host "=== SKIP $name (no $($svc.dockerfile)) ===" -ForegroundColor Yellow
        continue
    }
    Write-Host "=== Building $image ===" -ForegroundColor Cyan
    docker build -t $image -f $dockerfile "$PYTHON_DIR"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  FAILED: $name" -ForegroundColor Red
        $failed += $name
    }
}

Write-Host ""
if ($failed.Count -gt 0) {
    Write-Host "=== Build completed with failures: $($failed -join ', ') ===" -ForegroundColor Red
    exit 1
} else {
    Write-Host "=== All AI images built ===" -ForegroundColor Green
}
docker images | Select-String "catest-ai"
