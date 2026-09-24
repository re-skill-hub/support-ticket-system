# Kubernetes manifests

These were built and validated against **Docker Desktop's built-in single-node Kubernetes cluster**, not Azure Kubernetes Service (AKS) — the same scope decision the root `README.md`'s "Scope notes" section already makes for Azure generally. The manifests are ordinary Deployments/Services with no Docker-Desktop-specific fields, so they apply to a real AKS cluster too once images are pushed to a registry the cluster can pull from (see "Moving to AKS" below).

`sqlserver` and `rabbitmq` are included as single-replica, no-backup pods purely so the stack is self-contained for a local demo. A real deployment would point the services at a managed Azure SQL Database and a managed message broker instead of running stateful infra in-cluster.

## Prerequisites

- Docker Desktop with Kubernetes enabled (Settings → Kubernetes → Enable Kubernetes), context `docker-desktop` selected (`kubectl config use-context docker-desktop`).
- The three `.NET` service images and the client image built locally with the same tags the manifests reference:

  ```sh
  docker build -t ticket-service:local -f services/TicketService/Dockerfile .
  docker build -t response-service:local -f services/ResponseService/Dockerfile .
  docker build -t notification-service:local -f services/NotificationService/Dockerfile .
  docker build -t client:local -f client/Dockerfile .
  ```

### A note on Docker Desktop's two Kubernetes provisioners

Docker Desktop can provision its Kubernetes cluster with either **kubeadm** (single node) or **kind** (multi-node, closer to a real managed cluster like AKS — this is what was validated here: two nodes, `desktop-control-plane` + `desktop-worker`).

This matters for `imagePullPolicy: Never`, which these manifests use to force pulling from local images instead of a registry:

- **kubeadm**: the single node shares the host's Docker image cache directly — a `docker build` is immediately visible, no extra step.
- **kind**: each node is its own container with its own isolated containerd image store. A `docker build` on the host is **not** visible inside either node until it's explicitly loaded in — confirmed by deploying a test pod against a freshly-built image and observing `ErrImageNeverPull` until the image was loaded. Docker Desktop doesn't bundle the `kind` CLI (so `kind load docker-image` isn't available as-is), so `k8s/load-images.sh` replicates what that command does — `docker save` piped into each node container, then `ctr -n k8s.io images import` inside it:

  ```sh
  ./k8s/load-images.sh
  ```

  Run this once after each `docker build` of any of the four images, before `kubectl apply`. It no-ops safely under kubeadm (detects the node isn't a separate container and skips).

## Deploy

1. Copy `k8s/examples/01-secret.example.yaml` to `k8s/01-secret.yaml` (gitignored) and fill in `JWT_SECRET` / `RABBITMQ_USER` / `RABBITMQ_PASS` / `MSSQL_SA_PASSWORD` — the same values as the repo root `.env` used by `docker compose`. The template lives in `k8s/examples/` rather than directly in `k8s/` so that a non-recursive `kubectl apply -f k8s/` never picks up its empty placeholder values alongside the real secret.
2. If on kind (see above), run `./k8s/load-images.sh` after building the images.
3. `kubectl apply -f k8s/`
4. `kubectl get pods -w` until everything is `Running`/`Ready` (SQL Server takes ~30-60s to accept connections on first start).
5. Open `http://localhost:4200`. The client's `environment.ts` API URLs (`5101`/`5102`/`5103`) resolve because each backend Service is `type: LoadBalancer` bound to those same ports on `localhost` — Docker Desktop's Kubernetes exposes `LoadBalancer` Services on `localhost` directly, with no separate ingress controller needed.

## Tear down

```sh
kubectl delete -f k8s/
```

(Leaves the PersistentVolumeClaims' underlying data around only as long as Docker Desktop's Kubernetes node exists; deleting the PVCs too removes it: `kubectl delete pvc sqlserver-data rabbitmq-data`.)

## Moving to AKS

The manifests themselves don't change. What would:

- Push the four images to a registry AKS can pull from (Azure Container Registry) and update `image:`/`imagePullPolicy` accordingly.
- Replace `02-sqlserver.yaml` with a connection string to Azure SQL Database, and `03-rabbitmq.yaml` with a managed broker (e.g. Azure Service Bus, with the MassTransit transport swapped accordingly).
- Front the `client` Service with an Ingress + TLS instead of `type: LoadBalancer` on a plain HTTP port.
