# Deploy CATEST to Docker Desktop Kubernetes
$ErrorActionPreference = "Stop"

Write-Host "Deploying CATEST to Kubernetes..." -ForegroundColor Cyan

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $scriptPath

# 1. Create the namespace
Write-Host "Creating namespace..."
kubectl apply -f base/namespace.yaml

# 2. Apply Application Secrets
Write-Host "Applying Application Secrets..."
kubectl apply -f base/app-secrets.yaml

# 3. Apply Security and RBAC
Write-Host "Applying RBAC and Service Accounts..."
kubectl apply -f rbac/service-account.yaml

# 4. Create the configmap for PostgreSQL initialization scripts
Write-Host "Creating postgres-init-scripts ConfigMap..."
kubectl create configmap postgres-init-scripts `
  --from-file=00-create_databases.sh=../scripts/create_databases.sh `
  --from-file=../scripts/initdb.d `
  --namespace catest `
  --dry-run=client -o yaml | kubectl apply -f -

# 4b. Build custom PostgreSQL image if not already present
$pgImage = 'ghcr.io/ulyssesleolee/catest-postgres:latest'
$pgExists = docker images --quiet $pgImage 2>$null
if (-not $pgExists) {
    Write-Host "Building custom PostgreSQL image (pgvector + AGE)..." -ForegroundColor Yellow
    docker build -t $pgImage -f ../docker/postgres/Dockerfile ../docker/postgres
    if ($LASTEXITCODE -ne 0) { Write-Error "PostgreSQL image build failed"; exit 1 }
}

# 5. Apply infrastructure components
Write-Host "Applying Infrastructure Components..."
kubectl apply -f infra/postgres/
kubectl apply -f infra/kafka/
kubectl apply -f infra/neo4j/
kubectl apply -f infra/qdrant/
kubectl apply -f infra/arroyo/

# 6. Apply application microservices
Write-Host "Applying Application Microservices..."
kubectl apply -f services/gateway/
kubectl apply -f services/parser/
kubectl apply -f services/embedding/
kubectl apply -f services/review/

# Web applications
Write-Host "Applying Web Micro-frontends..."
kubectl apply -f services/web/
kubectl apply -f services/web-workspace/
kubectl apply -f services/web-rag/
kubectl apply -f services/web-review/

# 7. Apply Ingestion Job
Write-Host "Re-triggering Ingestion Job..."
kubectl delete job catest-ingestion -n catest --ignore-not-found=true
kubectl apply -f services/ingestion/job.yaml

# 8. Apply KEDA Autoscalers
Write-Host "Applying KEDA ScaledObjects..."
kubectl apply -f keda/scaled-objects.yaml
kubectl apply -f keda/keda-service-ext.yaml
kubectl apply -f keda/keda-metrics-ext.yaml

# 9. Apply External LoadBalancers
Write-Host "Applying External NodePorts/LoadBalancers..."
kubectl apply -f infra/ext-services.yaml

Write-Host "`nDeployment complete! Check status: kubectl get pods -n catest" -ForegroundColor Green
