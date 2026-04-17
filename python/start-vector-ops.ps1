# start-vector-ops.ps1
# Launch the ai-vector-ops service (port 34085) with correct environment.
#
# Priority: Anthropic (Claude) → NVIDIA NIM (qwen) — whichever key is available.
#
# Usage (NIM):
#   $env:NVAPI = "nvapi-..."
#   cd E:\CATEST\python; .\start-vector-ops.ps1
#
# Usage (Claude):
#   $env:ANTHROPIC_API_KEY = "sk-ant-..."
#   cd E:\CATEST\python; .\start-vector-ops.ps1
#
# Usage (both):
#   $env:NVAPI = "nvapi-..."
#   $env:ANTHROPIC_API_KEY = "sk-ant-..."
#   cd E:\CATEST\python; .\start-vector-ops.ps1

Set-StrictMode -Version Latest

# ── Anthropic (Claude) key ─────────────────────────────────────────────────────
$anthropicKey = $env:ANTHROPIC_API_KEY
if ($anthropicKey) {
    $env:CATEST_AI_ANTHROPIC_API_KEY = $anthropicKey
    Write-Host "  Claude : configured (ANTHROPIC_API_KEY)" -ForegroundColor Green
} else {
    Write-Host "  Claude : not configured (ANTHROPIC_API_KEY not set)" -ForegroundColor Yellow
}

# ── NVIDIA NIM key ─────────────────────────────────────────────────────────────
$apiKey = $env:NVAPI
if ($apiKey) {
    $env:CATEST_AI_API_KEY  = $apiKey
    $env:CATEST_AI_BASE_URL = "https://integrate.api.nvidia.com/v1"
    $env:CATEST_AI_MODEL    = "qwen/qwen3.5-122b-a10b"
    Write-Host "  NIM    : configured (NVAPI -> qwen/qwen3.5-122b-a10b)" -ForegroundColor Green
} else {
    Write-Host "  NIM    : not configured (NVAPI not set)" -ForegroundColor Yellow
}

# Require at least one AI key
if (-not $anthropicKey -and -not $apiKey) {
    Write-Error "No AI API key found. Set ANTHROPIC_API_KEY or NVAPI before running."
    exit 1
}

# ── Memgraph ───────────────────────────────────────────────────────────────────
# Local dev: port-forward k8s Memgraph service to localhost:37687
# In k8s pods: bolt://memgraph:37687 resolves via cluster DNS (set by ConfigMap)
if (-not $env:CATEST_AI_MEMGRAPH_URI) {
    $env:CATEST_AI_MEMGRAPH_URI = "bolt://localhost:37687"

    # Ensure kubectl port-forward is running for Memgraph k8s service
    $pfRunning = Get-NetTCPConnection -LocalPort 37687 -State Listen -ErrorAction SilentlyContinue
    if (-not $pfRunning) {
        Write-Host "  Memgraph: starting kubectl port-forward :37687 → k8s memgraph:37687..." -ForegroundColor Yellow
        Start-Process kubectl -ArgumentList "port-forward","service/memgraph","37687:37687","-n","catest" `
            -WindowStyle Hidden -PassThru | Out-Null
        Start-Sleep -Seconds 3
    }
    Write-Host "  Memgraph: bolt://localhost:37687 (kubectl port-forward → k8s)" -ForegroundColor Green
} else {
    Write-Host "  Memgraph: $env:CATEST_AI_MEMGRAPH_URI" -ForegroundColor Green
}

Write-Host ""
Write-Host "Starting ai-vector-ops on port 34085..." -ForegroundColor Cyan

python -m uvicorn catest_ai.vector_ops.app:app --host 0.0.0.0 --port 34085 --reload
