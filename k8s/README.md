# Kubernetes manifests

These base manifests were built and validated against **Docker Desktop's built-in single-node Kubernetes cluster**, not Azure Kubernetes Service (AKS). They're ordinary Deployments/Services with no Docker-Desktop-specific fields — `k8s/azure-dev/` is a kustomize overlay of these same manifests, adapted for a real AKS cluster (managed images via ACR, Ingress + TLS instead of `LoadBalancer`, Key-Vault-backed secrets).

`sqlserver`, `rabbitmq`, and `mailpit` run as single-replica, no-backup pods purely so the stack is self-contained for a local demo. A production deployment would point at a managed Azure SQL Database and a managed message broker instead of running stateful infra in-cluster — see `docs/requirement/gap-analysis.md`.

**Full deploy instructions (prerequisites, the kind-vs-kubeadm image-loading gotcha, deploy/tear-down steps) are in [`docs/running-the-app.md`](../docs/running-the-app.md#track-2-local--kubernetes-docker-desktop).**

For the AKS trial deployment specifically, see `k8s/azure-dev/README.md`, `docs/azure-deployment.md`, and `docs/ci-cd-pipeline.md`.
