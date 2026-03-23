# CATEST Kubernetes Deployment Guide

## Quick Start

### Scenario 1: Fresh Deploy (with image build)
```powershell
./k8s-restart.ps1 -Build
```
Builds Docker images and deploys them. Best for first-time setup.

### Scenario 2: Deploy Existing Images
```powershell
./k8s-restart.ps1
```
Deploys using existing images (no rebuild). Faster if images already exist.

### Scenario 3: Local Cluster (kind/k3d) - Fix ErrImageNeverPull
```powershell
# If images are already built locally:
./k8s-restart.ps1 -LoadImages

# OR rebuild and load in one go:
./k8s-restart.ps1 -Build -LoadImages

# OR use the quick loader (loads images only):
./load-images.ps1
```

## Common Issues & Fixes

### ❌ ErrImageNeverPull Error
**Cause**: Images haven't been loaded into your local kind/k3d cluster.

**Fix**:
```powershell
# Check which images are missing
docker images | grep catest

# Build missing images
./k8s-restart.ps1 -Build

# Load them into the cluster
./k8s-restart.ps1 -Build -LoadImages
```

### ❌ ImagePullBackOff Error
**Cause**: Trying to pull from registry but authentication is missing.

**Fix**: Create a docker registry secret:
```bash
kubectl create secret docker-registry regcred \
  --docker-server=ghcr.io \
  --docker-username=<username> \
  --docker-password=<token> \
  -n catest
```

### ❌ CrashLoopBackOff Error
**Cause**: Container starts but crashes immediately.

**Fix**: Check application logs:
```bash
kubectl logs -n catest <pod-name>
kubectl describe pod -n catest <pod-name>
```

## Advanced Options

### Deploy Specific Services Only
```powershell
./k8s-restart.ps1 -Only gateway,web,web-rag
```

### Skip Infrastructure (DB/Kafka/Neo4j)
```powershell
./k8s-restart.ps1 -SkipInfra
```

### Deploy Without Waiting for Rollout
```powershell
./k8s-restart.ps1 -SkipWait
```

## Cluster Detection

The script automatically detects your cluster type:
- **kind** → Uses `kind load docker-image`
- **k3d** → Uses `k3d image import`
- **Docker Desktop** → Pulls from registry
- **Other** → Pulls from registry (requires auth)

## Troubleshooting Commands

```bash
# Check pod status
kubectl get pods -n catest

# Describe a failing pod
kubectl describe pod -n catest <pod-name>

# View pod logs
kubectl logs -n catest <pod-name>

# Check available images in cluster
docker images | grep catest

# Force delete stuck pods
kubectl delete pod -n catest <pod-name> --force

# Watch deployment status
kubectl rollout status deployment/<deployment-name> -n catest
```

## URLs After Deployment

- Dashboard (hub): http://localhost:33000
- Workspace: http://localhost:33001
- RAG: http://localhost:33002
- Review: http://localhost:33003
- Team: http://localhost:33004

## Getting Help

Check the script output for detailed error messages. The script provides automatic suggestions for common problems.
