<#
.SYNOPSIS
    Start the adapter-bridge service on the host machine.

.DESCRIPTION
    The adapter-bridge runs on the host (not in K8s) because it needs to
    spawn local CLI processes (claude, codex, antigravity).

    Envoy routes /api/bridge/* to host.docker.internal:34099.

.EXAMPLE
    .\scripts\start-bridge.ps1
    .\scripts\start-bridge.ps1 -Cwd "E:\CATEST"
#>

param(
    [string]$Cwd = (Get-Location).Path,
    [int]$Port = 34099
)

$env:BRIDGE_CWD = $Cwd
$env:CALLBACK_URL = "http://localhost:33088/api/orchestration"
$env:PYTHONPATH = "$PSScriptRoot\..\python\src"

Write-Host "=== Adapter Bridge ===" -ForegroundColor Cyan
Write-Host "  Port:     $Port"
Write-Host "  CWD:      $Cwd"
Write-Host "  Callback: $env:CALLBACK_URL"
Write-Host ""

python -m uvicorn catest_ai.adapter_bridge.main:app --host 0.0.0.0 --port $Port --reload
