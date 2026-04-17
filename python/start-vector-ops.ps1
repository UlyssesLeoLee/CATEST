# start-vector-ops.ps1
# Launch the ai-vector-ops service (port 34085) with correct environment.
# Requires $env:NVAPI to be set in your PowerShell session (or system env).
#
# Usage:
#   cd E:\CATEST\python
#   .\start-vector-ops.ps1

Set-StrictMode -Version Latest

$apiKey = $env:NVAPI
if (-not $apiKey) {
    Write-Error "NVAPI environment variable is not set. Set it first: `$env:NVAPI = 'nvapi-...'"
    exit 1
}

Write-Host "Starting ai-vector-ops on port 34085..." -ForegroundColor Cyan
Write-Host "  Model  : qwen/qwen3.5-122b-a10b" -ForegroundColor Gray
Write-Host "  Endpoint: https://integrate.api.nvidia.com/v1" -ForegroundColor Gray

$env:CATEST_AI_API_KEY  = $apiKey
$env:CATEST_AI_BASE_URL = "https://integrate.api.nvidia.com/v1"
$env:CATEST_AI_MODEL    = "qwen/qwen3.5-122b-a10b"

python -m uvicorn catest_ai.vector_ops.app:app --host 0.0.0.0 --port 34085 --reload
