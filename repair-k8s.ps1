#!/usr/bin/env pwsh
# Kubernetes Cluster Repair & Recovery Script (Docker Desktop K8s)

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       CATEST Kubernetes Cluster Recovery Tool             ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check Docker status
Write-Host "[1/4] Checking Docker Desktop..." -ForegroundColor Yellow
$docker = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Docker not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}
Write-Host "  Docker is running" -ForegroundColor Green

# Step 2: Verify Kubernetes is enabled
Write-Host "[2/4] Checking Kubernetes..." -ForegroundColor Yellow
$timeout = 120
$elapsed = 0
$k8sReady = $false
while ($elapsed -lt $timeout) {
    try {
        $null = kubectl cluster-info 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Kubernetes is ready" -ForegroundColor Green
            $k8sReady = $true
            break
        }
    } catch { }
    Start-Sleep -Seconds 3
    $elapsed += 3
    Write-Host "  Waiting... ($elapsed/$timeout s)" -ForegroundColor DarkGray
}

if (-not $k8sReady) {
    Write-Host "  Kubernetes not responding. Ensure K8s is enabled in Docker Desktop settings." -ForegroundColor Red
    exit 1
}

# Step 3: Switch context to docker-desktop if needed
Write-Host "[3/4] Verifying kubectl context..." -ForegroundColor Yellow
$ctx = kubectl config current-context 2>&1
if ($ctx -ne 'docker-desktop') {
    $contexts = kubectl config get-contexts -o name 2>&1
    if ($contexts -match 'docker-desktop') {
        kubectl config use-context docker-desktop 2>&1 | Out-Null
        Write-Host "  Switched to docker-desktop context" -ForegroundColor Green
    } else {
        Write-Host "  Current context: $ctx (docker-desktop context not found)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  Context: docker-desktop" -ForegroundColor Green
}

# Step 4: Create catest namespace and verify
Write-Host "[4/4] Setting up catest namespace..." -ForegroundColor Yellow
kubectl create namespace catest --dry-run=client -o yaml | kubectl apply -f - 2>&1 | Out-Null
Write-Host "  Namespace ready" -ForegroundColor Green

# Verify
Write-Host ""
$nodes = kubectl get nodes 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "Available nodes:" -ForegroundColor Cyan
    $nodes | ForEach-Object { Write-Host "    $_" }
} else {
    Write-Host "  Kubernetes not responding" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  Cluster Recovery Complete! Ready to deploy.              ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  ./k8s-restart.ps1                    # Deploy to Kubernetes" -ForegroundColor Gray
Write-Host "  ./k8s-restart.ps1 -Build             # Rebuild and deploy" -ForegroundColor Gray
Write-Host ""
