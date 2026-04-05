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
  #   $Ports['web-base']       → 33000 or 43000
  #   $Ports['envoy-gateway']  → 33088 or 43088
  #   $Ports['web-tm']         → 33005 (always works)
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
$PortRegistry = @(
    @{ Name = 'envoy-gateway';    BasePort = Get-EnvPort 'ENVOY_GATEWAY_PORT' 33088;                 Svc = 'svc/envoy-gateway';              Target = Get-EnvPort 'ENVOY_GATEWAY_PORT' 33088 }
    @{ Name = 'web-base';         BasePort = Get-EnvPort 'NEXT_PUBLIC_PORT_WEB_BASE' 33000;           Svc = 'svc/catest-web-base';             Target = Get-EnvPort 'NEXT_PUBLIC_PORT_WEB_BASE' 33000 }
    @{ Name = 'web-workspace';    BasePort = Get-EnvPort 'NEXT_PUBLIC_PORT_WEB_WORKSPACE' 33001;      Svc = 'svc/catest-web-workspace';        Target = Get-EnvPort 'NEXT_PUBLIC_PORT_WEB_WORKSPACE' 33001 }
    @{ Name = 'web-rag';          BasePort = Get-EnvPort 'NEXT_PUBLIC_PORT_WEB_RAG' 33002;            Svc = 'svc/catest-web-rag';              Target = Get-EnvPort 'NEXT_PUBLIC_PORT_WEB_RAG' 33002 }
    @{ Name = 'web-review';       BasePort = Get-EnvPort 'NEXT_PUBLIC_PORT_WEB_REVIEW' 33003;         Svc = 'svc/catest-web-review';           Target = Get-EnvPort 'NEXT_PUBLIC_PORT_WEB_REVIEW' 33003 }
    @{ Name = 'web-team';         BasePort = Get-EnvPort 'NEXT_PUBLIC_PORT_WEB_TEAM' 33004;           Svc = 'svc/catest-web-team';             Target = Get-EnvPort 'NEXT_PUBLIC_PORT_WEB_TEAM' 33004 }
    @{ Name = 'web-tm';           BasePort = Get-EnvPort 'NEXT_PUBLIC_PORT_WEB_TM' 33005;             Svc = 'svc/catest-web-tm';               Target = Get-EnvPort 'NEXT_PUBLIC_PORT_WEB_TM' 33005 }
    @{ Name = 'web-tb';           BasePort = Get-EnvPort 'NEXT_PUBLIC_PORT_WEB_TB' 33006;             Svc = 'svc/catest-web-tb';               Target = Get-EnvPort 'NEXT_PUBLIC_PORT_WEB_TB' 33006 }
    @{ Name = 'web-orchestration';BasePort = Get-EnvPort 'NEXT_PUBLIC_PORT_WEB_ORCHESTRATION' 33007;  Svc = 'svc/catest-web-orchestration';    Target = Get-EnvPort 'NEXT_PUBLIC_PORT_WEB_ORCHESTRATION' 33007 }
    @{ Name = 'hub';              BasePort = Get-EnvPort 'NEXT_PUBLIC_PORT_GATEWAY' 33080;            Svc = 'svc/catest-hub';                  Target = Get-EnvPort 'NEXT_PUBLIC_PORT_GATEWAY' 33080 }
    @{ Name = 'intent-gateway';   BasePort = Get-EnvPort 'INTENT_GATEWAY_PORT' 34090;                Svc = 'svc/catest-intent-gateway';       Target = Get-EnvPort 'INTENT_GATEWAY_PORT' 34090 }
    @{ Name = 'mcp-facade';       BasePort = Get-EnvPort 'MCP_FACADE_PORT' 34098;                    Svc = 'svc/catest-mcp-facade';           Target = Get-EnvPort 'MCP_FACADE_PORT' 34098 }
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
    'envoy-gateway'     = @{ Label = 'Gateway (unified)'; Path = '/' }
    'web-base'          = @{ Label = 'Dashboard';          Path = '/' }
    'web-workspace'     = @{ Label = 'Workspace';          Path = '/' }
    'web-rag'           = @{ Label = 'RAG';                Path = '/' }
    'web-review'        = @{ Label = 'Review';             Path = '/' }
    'web-team'          = @{ Label = 'Team';               Path = '/' }
    'web-tm'            = @{ Label = 'TM';                 Path = '/' }
    'web-tb'            = @{ Label = 'TB';                 Path = '/' }
    'web-orchestration' = @{ Label = 'Orchestration';      Path = '/' }
    'mcp-facade'        = @{ Label = 'MCP Facade';         Path = '/healthz' }
}
foreach ($key in @('envoy-gateway','web-base','web-workspace','web-rag','web-review','web-team','web-tm','web-tb','web-orchestration','mcp-facade')) {
    $info = $portStatus[$key]
    if (-not $info -or $info.Status -eq 'down') { continue }
    $meta = $urlMap[$key]
    if (-not $meta) { continue }
    $port = $info.Port
    $label = $meta.Label.PadRight(20)
    $url = "http://localhost:$port$($meta.Path)"
    $color = if ($info.Status -eq 'dead') { 'Red' } else { 'Green' }
    Write-Host "    $label $url" -ForegroundColor $color
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
