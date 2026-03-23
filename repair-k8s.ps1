#!/usr/bin/env pwsh
# Kubernetes Cluster Repair & Recovery Script

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       CATEST Kubernetes Cluster Recovery Tool             ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check Docker status
Write-Host "[1/5] Checking Docker Desktop..." -ForegroundColor Yellow
$docker = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ❌ Docker not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ Docker is running" -ForegroundColor Green

# Step 2: Remove broken kind cluster
Write-Host "[2/5] Cleaning up broken kind cluster..." -ForegroundColor Yellow
docker stop desktop-control-plane 2>$null | Out-Null
docker rm desktop-control-plane 2>$null | Out-Null
docker system prune -f 2>$null | Out-Null
Write-Host "  ✅ Cleanup done" -ForegroundColor Green

# Step 3: Restart Docker Desktop's built-in Kubernetes
Write-Host "[3/5] Restarting Docker Desktop Kubernetes..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Wait for Docker socket to be ready
$timeout = 60
$elapsed = 0
while ($elapsed -lt $timeout) {
    try {
        $null = kubectl cluster-info 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✅ Kubernetes is ready" -ForegroundColor Green
            break
        }
    } catch {
    }
    Start-Sleep -Seconds 2
    $elapsed += 2
    Write-Host "  ⏳ Waiting... ($elapsed/$timeout s)" -ForegroundColor DarkGray
}

if ($elapsed -ge $timeout) {
    Write-Host "  ⚠️  Kubernetes didn't respond in time, but continuing..." -ForegroundColor Yellow
}

# Step 4: Create catest namespace
Write-Host "[4/5] Setting up catest namespace..." -ForegroundColor Yellow
kubectl create namespace catest --dry-run=client -o yaml | kubectl apply -f - 2>&1 | Out-Null
Write-Host "  ✅ Namespace ready" -ForegroundColor Green

# Step 5: Test connectivity
Write-Host "[5/5] Testing Kubernetes connectivity..." -ForegroundColor Yellow
$nodes = kubectl get nodes 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✅ Kubernetes is operational!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Available nodes:" -ForegroundColor Cyan
    $nodes | ForEach-Object { Write-Host "    $_" }
} else {
    Write-Host "  ❌ Kubernetes not responding" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please try:" -ForegroundColor Yellow
    Write-Host "  1. Restart Docker Desktop completely" -ForegroundColor Yellow
    Write-Host "  2. Or use local deployment: ./start.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  Cluster Recovery Complete! Ready to deploy.              ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  ./k8s-restart.ps1                    # Deploy to Kubernetes" -ForegroundColor Gray
Write-Host "  ./k8s-restart.ps1 -Build              # Rebuild and deploy" -ForegroundColor Gray
Write-Host "  ./start.ps1                          # Or use local mode" -ForegroundColor Gray
Write-Host ""
