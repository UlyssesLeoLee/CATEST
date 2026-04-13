<#
.SYNOPSIS
    Start the adapter-bridge service on the host machine.

.DESCRIPTION
    The adapter-bridge runs on the host (not in K8s) because it needs to
    spawn local CLI processes (claude, codex, antigravity).

    Envoy routes /api/bridge/* to host.docker.internal:34101.

.EXAMPLE
    .\scripts\start-bridge.ps1
    .\scripts\start-bridge.ps1 -Cwd "E:\CATEST"
#>

param(
    [string]$Cwd = (Get-Location).Path,
    [int]$Port = 34101
)

$env:BRIDGE_CWD = $Cwd
$env:CALLBACK_URL = "http://localhost:33088/api/orchestration"
$env:PYTHONPATH = "$PSScriptRoot\..\python\src"

# ── Postgres port-forward (for chat_store DB writes) ──────────────────────────
$pgLocalPort = 35432
$pgFwdJob = $null
$existing = Get-NetTCPConnection -LocalPort $pgLocalPort -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $existing) {
    Write-Host "  Starting postgres port-forward (localhost:$pgLocalPort -> postgres:5432)..." -ForegroundColor DarkCyan
    $pgFwdJob = Start-Job -ScriptBlock {
        param($p) kubectl port-forward -n catest pod/postgres-0 "${p}:5432" 2>&1
    } -ArgumentList $pgLocalPort
    Start-Sleep -Seconds 2
}
$env:CHAT_DB_URL = "postgresql://catest:password@localhost:${pgLocalPort}/catest_orchestration"

Write-Host "=== Adapter Bridge ===" -ForegroundColor Cyan
Write-Host "  Port:     $Port"
Write-Host "  CWD:      $Cwd"
Write-Host "  Callback: $env:CALLBACK_URL"
Write-Host "  DB:       $env:CHAT_DB_URL"
Write-Host "  MCP:      http://localhost:$Port/mcp"
Write-Host ""

# Register as MCP server in Antigravity (idempotent)
$mcpDef = "{`"name`":`"catest-bridge`",`"type`":`"http`",`"url`":`"http://localhost:$Port/mcp`"}"
antigravity --add-mcp $mcpDef 2>&1 | Out-Null
Write-Host "  Antigravity MCP registered" -ForegroundColor Green
Write-Host ""

python -m uvicorn catest_ai.adapter_bridge.main:app --host 0.0.0.0 --port $Port --reload
