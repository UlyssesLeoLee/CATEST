# 从 Kind 迁移到 Docker Desktop Kubernetes

**日期**: 2026-03-24

## 问题

Docker Desktop 界面显示 K8s 未启用，但服务通过 Kind 容器在跑。Kind 不符合设计要求，需要使用原生 Docker Desktop K8s。

## 根因

项目初始化时使用了 Kind 集群，所有脚本和部署配置都硬编码了 Kind 逻辑（desktop-control-plane 容器、crictl、ctr import、imagePullPolicy: Never 等）。

## 修复内容

- **k8s-restart.ps1**: 移除 Kind/k3d 检测逻辑、Repair-Kubeconfig、Ensure-ImageLoaded 函数；简化 Diagnose-Images 为本地 Docker 镜像检查；简化 Ensure-K8sReady；移除 -LoadImages/-PullFromRegistry 参数
- **hot-reload-web.ps1**: 移除 docker save/cp/ctr import 流程，Docker Desktop K8s 共享 Docker daemon 直接可用
- **load-images.ps1**: 改为纯镜像诊断工具
- **repair-k8s.ps1**: 移除 Kind 容器清理逻辑，改为 Docker Desktop K8s 恢复流程
- **k8s/deploy.ps1**: 移除 Kind 镜像加载逻辑
- **所有 k8s/*.yaml**: imagePullPolicy 从 Never 改为 IfNotPresent
- 安装 Envoy Gateway CRD（新集群需要）

## 注意事项

- Docker Desktop K8s 内部仍使用 Kind 实现，重启需要 `wsl --shutdown`
- 新集群创建后需要重新安装 Envoy Gateway:
  ```
  kubectl apply --server-side -f https://github.com/envoyproxy/gateway/releases/latest/download/install.yaml
  ```
- imagePullPolicy: IfNotPresent 允许 K8s 使用本地 Docker 镜像，无需手动加载

## 防止复发

- k8s-restart.ps1 中 Get-ClusterType 现在将所有含 'desktop' 的 context 识别为 docker-desktop
- 所有 Kind 特有代码（crictl、ctr、desktop-control-plane）已彻底删除
- DB 初始化和 KEDA 部分用 `$ErrorActionPreference = 'Continue'` 包裹，避免 psql NOTICE 导致脚本中断
