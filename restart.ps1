# CATEST Hard Reset Script (Development)
# Forcefully terminates all platform nodes and performs a clean sweep.

$ErrorActionPreference = "Continue"

Write-Host "🔄 Initiating CATEST Platform Reset..." -ForegroundColor Red

# 1. Terminate Logic Nodes
Write-Host "   -> Purging Rust Backend Nodes..." -ForegroundColor Gray
taskkill /F /IM "catest-*.exe" /T 2>$null

# 2. Terminate UI Nodes
Write-Host "   -> Purging Node.js/Next.js UI Nodes..." -ForegroundColor Gray
taskkill /F /IM "node.exe" /T 2>$null

# 3. Purge Build Artifact Locks
Write-Host "   -> Cleaning Toolchain Locks (Cargo/Rustc)..." -ForegroundColor Gray
taskkill /F /IM "cargo.exe" /T 2>$null
taskkill /F /IM "rustc.exe" /T 2>$null
taskkill /F /IM "rust-analyzer.exe" /T 2>$null

Write-Host "🧹 Cleanup successful. Resources released." -ForegroundColor Green
Write-Host ""

# 4. Re-orchestrate
$StartScript = Join-Path (Get-Location) "start.ps1"
if (Test-Path $StartScript) {
    Write-Host "🚀 Re-launching Environment..." -ForegroundColor Cyan
    & $StartScript
} else {
    Write-Host "❌ Error: start.ps1 not found in root directory." -ForegroundColor Red
}
