#!/usr/bin/env pwsh
<#
.SYNOPSIS
  CATEST Port Configuration & Auto-Switch Script

.DESCRIPTION
  Central port management for CATEST. Detects whether Docker Desktop LoadBalancer
  ports are healthy or dead (vpnkit bug: port LISTENING but Empty reply).
  Automatically switches to alternate ports (+10000) and sets up kubectl port-forward.

  Three modes:
    1. Standalone  : ./port-config.ps1                  — detect, fix, print URLs
    2. Standalone  : ./port-config.ps1 -Fix             — detect, fix, start port-forwards
    3. Dot-sourced : . ./port-config.ps1 -Probe         — export $Ports hashtable for other scripts

.EXAMPLE
  # From k8s-restart.ps1 or smoke_test.ps1:
  . "$PSScriptRoot/port-config.ps1" -Probe
  # Now $Ports is available:
  #   $Ports['envoy-gateway']  → 33088 or 43088
  #   $Ports['postgres']       → 34321 or 44321
  #   $Ports['qdrant']         → 36333 or 46333
#>

[CmdletBinding()]
param(
    [switch]$Probe,      # Dot-source mode: only detect ports, export $Ports, no output
    [switch]$Fix,        # Fix mode: detect + start port-forwards for dead ports
    [switch]$Kill,       # Kill all existing port-forward processes
    [switch]$Status,     # Show current port status table
    [string]$Namespace = 'catest'
)

# ── Load .env ────────────────────────────────────────────────────────────────
# Single source of truth for all ports. Parse .env file at repo root.
$EnvFile = Join-Path $PSScriptRoot '.env'
$EnvVars = @{}
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$' -and $_ -notmatch '^\s*#') {
            $EnvVars[$Matches[1]] = $Matches[2].Trim('"').Trim("'")
        }
    }
}

function Get-EnvPort([string]$Key, [int]$Default) {
    if ($EnvVars.ContainsKey($Key)) { return [int]$EnvVars[$Key] }
    return $Default
}

# ── Port Registry (driven by .env) ──────────────────────────────────────────
# BasePort = from .env. AltPort = BasePort + 10000 (vpnkit fallback).
# Svc = kubectl service name. Target = same as BasePort (K8s Service port).
# After the LoadBalancer→ClusterIP migration, only Envoy Gateway (the single entry
# point) and infrastructure -ext services remain as LoadBalancer.  All web/API
# micro-services are now ClusterIP and accessed via Envoy routing.
$PortRegistry = @(
    # ── Single entry point ──────────────────────────────────────────────────
    # Envoy uses hostPort:33088 — no port-forward needed; still probed for health
    @{ Name = 'envoy-gateway';    BasePort = 33088;  Svc = 'svc/envoy-gateway';  Target = 33088; SkipForward = $true }
    # ── Infrastructure (LoadBalancer -ext services for host-side dev tools) ─
    @{ Name = 'postgres';         BasePort = Get-EnvPort 'POSTGRES_PORT' 34321;         Svc = 'svc/postgres-ext';     Target = Get-EnvPort 'POSTGRES_PORT' 34321 }
    @{ Name = 'kafka';            BasePort = Get-EnvPort 'KAFKA_PORT' 39092;            Svc = 'svc/kafka-ext';        Target = Get-EnvPort 'KAFKA_PORT' 39092 }
    @{ Name = 'qdrant';           BasePort = 36333;                                     Svc = 'svc/qdrant-ext';       Target = 36333 }
    @{ Name = 'memgraph';         BasePort = 37687;                                     Svc = 'svc/memgraph-ext';     Target = 37687 }
    @{ Name = 'arroyo';           BasePort = 35115;                                     Svc = 'svc/arroyo-ext';       Target = 35115 }
)
# Compute AltPort dynamically
foreach ($entry in $PortRegistry) {
    $entry.AltPort = $entry.BasePort + 10000
}

# ── Core: Test if a port is alive (TCP connect + HTTP response) ──────────────
function Test-PortAlive {
    param([int]$Port, [int]$TimeoutMs = 3000)

    # Step 1: TCP connect
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $ar = $tcp.BeginConnect('127.0.0.1', $Port, $null, $null)
        $ok = $ar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
        if (-not $ok) { $tcp.Close(); return 'closed' }
        $tcp.EndConnect($ar)
        $tcp.Close()
    } catch {
        return 'closed'
    }

    # Step 2: HTTP probe — distinguish "alive" from "dead listener" (Docker vpnkit bug)
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:$Port/" -UseBasicParsing `
            -MaximumRedirection 0 -TimeoutSec 3 -ErrorAction SilentlyContinue 2>&1
        return 'alive'
    } catch {
        if ($_.Exception.Response) {
            # Got an HTTP response (3xx, 4xx, 5xx) — port is alive
            return 'alive'
        }
        # TCP connected but no HTTP response → dead listener (vpnkit ghost)
        return 'dead'
    }
}

# ── Core: Detect all ports ───────────────────────────────────────────────────
function Get-PortStatus {
    $results = @{}
    foreach ($entry in $PortRegistry) {
        $name = $entry.Name
        $base = $entry.BasePort
        $alt  = $entry.AltPort

        $baseStatus = Test-PortAlive -Port $base
        $altStatus  = Test-PortAlive -Port $alt

        if ($baseStatus -eq 'alive') {
            $results[$name] = @{ Port = $base; Status = 'native'; Source = 'LoadBalancer' }
        } elseif ($altStatus -eq 'alive') {
            $results[$name] = @{ Port = $alt;  Status = 'forwarded'; Source = 'port-forward' }
        } elseif ($baseStatus -eq 'dead') {
            $results[$name] = @{ Port = $base; Status = 'dead'; Source = 'vpnkit-ghost' }
        } else {
            $results[$name] = @{ Port = $base; Status = 'down'; Source = 'not-listening' }
        }
    }
    return $results
}

# ── Core: Start port-forwards for dead/down ports ───────────────────────────
function Start-PortForwards {
    param([hashtable]$PortStatus)

    $started = 0
    foreach ($entry in $PortRegistry) {
        $name = $entry.Name
        $info = $PortStatus[$name]
        if (-not $info) { continue }

        if ($info.Status -eq 'alive' -or $info.Status -eq 'native') { continue }
        if ($info.Status -eq 'forwarded') { continue }  # alt port already working

        # Check if K8s service exists
        $svcExists = kubectl get $entry.Svc -n $Namespace -o name 2>&1
        if ($LASTEXITCODE -ne 0) { continue }  # service not deployed

        $localPort = if ($info.Status -eq 'dead') { $entry.AltPort } else { $entry.BasePort }

        # Check alt port not already occupied
        $altOccupied = Test-PortAlive -Port $localPort
        if ($altOccupied -ne 'closed') {
            # Alt port also busy, skip
            continue
        }

        Start-Process -WindowStyle Hidden -FilePath 'kubectl' `
            -ArgumentList "port-forward -n $Namespace $($entry.Svc) ${localPort}:$($entry.Target) --address=0.0.0.0"
        $started++

        # Update status
        $PortStatus[$name] = @{ Port = $localPort; Status = 'forwarded'; Source = 'port-forward' }
    }

    if ($started -gt 0) {
        Start-Sleep -Seconds 3  # wait for port-forwards to bind
    }

    return $started
}

# ── Core: Kill all port-forward processes ────────────────────────────────────
function Stop-AllPortForwards {
    Get-Process -Name 'kubectl' -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'port-forward' } |
        Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# ── Core: Export simple $Ports hashtable (Name → Port number) ────────────────
function Export-PortMap {
    param([hashtable]$PortStatus)
    $map = @{}
    foreach ($key in $PortStatus.Keys) {
        $map[$key] = $PortStatus[$key].Port
    }
    return $map
}

# ══════════════════════════════════════════════════════════════════════════════
# ── Mode: -Kill ──────────────────────────────────────────────────────────────
if ($Kill) {
    Write-Host "Killing all kubectl port-forward processes..." -ForegroundColor Yellow
    Stop-AllPortForwards
    Write-Host "Done." -ForegroundColor Green
    return
}

# ── Mode: -Probe (dot-sourced by other scripts) ─────────────────────────────
if ($Probe) {
    $portStatus = Get-PortStatus
    $needsFix = @($portStatus.Values | Where-Object { $_.Status -eq 'dead' -or $_.Status -eq 'down' })
    if ($needsFix.Count -gt 0) {
        $null = Start-PortForwards -PortStatus $portStatus
        # Re-probe after fix
        Start-Sleep -Seconds 2
        $portStatus = Get-PortStatus
    }
    # Export $Ports into caller's scope
    $script:Ports = Export-PortMap -PortStatus $portStatus
    $script:PortStatus = $portStatus
    return
}

# ── Mode: -Status (display table) ───────────────────────────────────────────
# Also default mode when no switches given.

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  CATEST Port Configuration" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Detect
Write-Host "[1/3] Detecting port status..." -ForegroundColor Yellow
$portStatus = Get-PortStatus

$alive     = @($portStatus.Values | Where-Object { $_.Status -eq 'native' -or $_.Status -eq 'alive' })
$forwarded = @($portStatus.Values | Where-Object { $_.Status -eq 'forwarded' })
$dead      = @($portStatus.Values | Where-Object { $_.Status -eq 'dead' })
$down      = @($portStatus.Values | Where-Object { $_.Status -eq 'down' })

Write-Host "  Native : $($alive.Count)  |  Forwarded: $($forwarded.Count)  |  Dead: $($dead.Count)  |  Down: $($down.Count)" -ForegroundColor $(
    if ($dead.Count -eq 0 -and $down.Count -eq 0) { 'Green' } else { 'Yellow' }
)

# Fix
if ($dead.Count -gt 0 -or $down.Count -gt 0) {
    if ($Fix -or (-not $Status)) {
        Write-Host ""
        Write-Host "[2/3] Starting port-forwards for $($dead.Count + $down.Count) broken port(s)..." -ForegroundColor Yellow
        $fixCount = Start-PortForwards -PortStatus $portStatus
        Write-Host "  Started $fixCount port-forward(s)" -ForegroundColor Green

        # Re-detect
        Start-Sleep -Seconds 2
        $portStatus = Get-PortStatus
    } else {
        Write-Host ""
        Write-Host "[2/3] Skipped fix (use -Fix to start port-forwards)" -ForegroundColor DarkGray
    }
} else {
    Write-Host ""
    Write-Host "[2/3] All ports healthy, no fix needed" -ForegroundColor Green
}

# Display
Write-Host ""
Write-Host "[3/3] Port status:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Service               Port    Status         Source" -ForegroundColor DarkGray
Write-Host "  ────────────────────  ─────   ────────────   ─────────────" -ForegroundColor DarkGray

foreach ($entry in $PortRegistry) {
    $name = $entry.Name
    $info = $portStatus[$name]
    if (-not $info) { continue }

    $port = $info.Port
    $svcStatus = $info.Status
    $source = $info.Source

    $statusColor = switch ($svcStatus) {
        'native'    { 'Green' }
        'forwarded' { 'Cyan' }
        'dead'      { 'Red' }
        'down'      { 'DarkGray' }
        default     { 'White' }
    }
    $statusIcon = switch ($svcStatus) {
        'native'    { 'OK' }
        'forwarded' { 'FWD' }
        'dead'      { 'DEAD' }
        'down'      { 'DOWN' }
        default     { '??' }
    }

    $paddedName = $name.PadRight(22)
    $paddedPort = "$port".PadRight(7)
    $paddedStatus = "[$statusIcon]".PadRight(14)
    Write-Host "  $paddedName $paddedPort $paddedStatus $source" -ForegroundColor $statusColor
}

# Access URLs
Write-Host ""
Write-Host "  Access URLs:" -ForegroundColor Cyan
$urlMap = @{
    'envoy-gateway'     = @{ Label = 'Gateway (all-in-one)'; Path = '/' }
    'postgres'          = @{ Label = 'PostgreSQL';            Path = $null }
    'kafka'             = @{ Label = 'Kafka';                 Path = $null }
    'qdrant'            = @{ Label = 'Qdrant';                Path = '/dashboard' }
    'memgraph'          = @{ Label = 'Memgraph';              Path = $null }
    'arroyo'            = @{ Label = 'Arroyo';                Path = '/' }
}
# Also show Envoy-routed app URLs (these go through the gateway, not direct)
Write-Host ""
Write-Host "  App URLs (via Envoy Gateway):" -ForegroundColor Cyan
$gwInfo = $portStatus['envoy-gateway']
if ($gwInfo -and $gwInfo.Status -ne 'down' -and $gwInfo.Status -ne 'dead') {
    $gp = $gwInfo.Port
    @(
        @('Dashboard',      "/"),
        @('Workspace',      "/workspace"),
        @('RAG',            "/rag"),
        @('Review',         "/review"),
        @('Team',           "/team"),
        @('TM',             "/tm"),
        @('TB',             "/tb"),
        @('Orchestration',  "/orchestration")
    ) | ForEach-Object {
        $label = $_[0].PadRight(20)
        Write-Host "    $label http://localhost:$gp$($_[1])" -ForegroundColor Green
    }
} else {
    Write-Host "    (Envoy Gateway is down — apps inaccessible)" -ForegroundColor Red
}

Write-Host ""
Write-Host "  Infrastructure URLs:" -ForegroundColor Cyan
foreach ($key in @('envoy-gateway','postgres','kafka','qdrant','memgraph','arroyo')) {
    $info = $portStatus[$key]
    if (-not $info -or $info.Status -eq 'down') { continue }
    $meta = $urlMap[$key]
    if (-not $meta) { continue }
    $port = $info.Port
    $label = $meta.Label.PadRight(20)
    $color = if ($info.Status -eq 'dead') { 'Red' } else { 'Green' }
    if ($meta.Path) {
        Write-Host "    $label http://localhost:$port$($meta.Path)" -ForegroundColor $color
    } else {
        Write-Host "    $label localhost:$port" -ForegroundColor $color
    }
}

Write-Host ""
if ($dead.Count -gt 0) {
    $stillDead = @($portStatus.Values | Where-Object { $_.Status -eq 'dead' })
    if ($stillDead.Count -gt 0) {
        Write-Host "  NOTE: Some ports still dead. Run: ./port-config.ps1 -Fix" -ForegroundColor Yellow
        Write-Host "  Permanent fix: Docker Desktop Settings > Kubernetes > Reset Kubernetes Cluster" -ForegroundColor DarkGray
    }
}
Write-Host ""
