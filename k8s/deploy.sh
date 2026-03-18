#!/bin/bash
set -e

echo "Deploying CATLLM to Kubernetes locally..."

# 1. Create the namespace
kubectl apply -f base/namespace.yaml

# 2. Apply Application Secrets
echo "Applying Application Secrets..."
kubectl apply -f base/app-secrets.yaml

# 2. Apply Security and RBAC
echo "Applying RBAC and Service Accounts..."
kubectl apply -f rbac/service-account.yaml

# 3. Create the configmap for PostgreSQL initialization scripts
echo "Creating postgres-init-scripts ConfigMap..."
kubectl create configmap postgres-init-scripts \
  --from-file=00-create_databases.sh=../scripts/create_databases.sh \
  --from-file=../scripts/initdb.d \
  --namespace catest \
  --dry-run=client -o yaml | kubectl apply -f -

# 4. Apply infrastructure components
echo "Applying Infrastructure Components..."
kubectl apply -f infra/postgres/
kubectl apply -f infra/kafka/
kubectl apply -f infra/neo4j/
kubectl apply -f infra/qdrant/
kubectl apply -f infra/arroyo/

# 5. Apply application microservices
echo "Applying Application Microservices..."
kubectl apply -f services/gateway/
kubectl apply -f services/parser/
kubectl apply -f services/embedding/
kubectl apply -f services/review/

# Web applications
kubectl apply -f services/web-base/
kubectl apply -f services/web-workspace/
kubectl apply -f services/web-rag/
kubectl apply -f services/web-review/

# 6. Apply Ingestion Job (Cleanup old job first to force re-run)
echo "Re-triggering Ingestion Job..."
kubectl delete job catest-ingestion -n catest --ignore-not-found=true
kubectl apply -f services/ingestion/job.yaml

# 7. Apply KEDA Autoscalers
echo "Applying KEDA ScaledObjects..."
kubectl apply -f keda/scaled-objects.yaml
kubectl apply -f keda/keda-service-ext.yaml
kubectl apply -f keda/keda-metrics-ext.yaml

# 8. Apply External LoadBalancers (mapped to 3XXXX ports)
echo "Applying External NodePorts/LoadBalancers..."
kubectl apply -f infra/ext-services.yaml

echo "Deployment complete! You can check the status using: kubectl get pods -n catest"
