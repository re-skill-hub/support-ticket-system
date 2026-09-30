# Running the app

Three ways to run the support ticketing system, from fastest to most involved: **Docker Compose** (recommended for local dev and demoing), **Kubernetes on Docker Desktop** (closer to production topology, still local), and **Azure Kubernetes Service** (the real trial deployment — see the live demo, or deploy your own).

## Track 1: Local — Docker Compose

The fastest path. No SDKs, Node, or Angular CLI required locally — they're baked into the Dockerfiles' build stages.

**Prerequisites:** Docker Desktop (with Compose v2).

1. Copy the environment template and fill in real values:

   ```bash
   cp .env.example .env
   ```

   - `JWT_SECRET` — any long random string (32+ characters); shared by all three services since each validates tokens locally.
   - `RABBITMQ_USER` / `RABBITMQ_PASS` — any credentials for the RabbitMQ container.
   - `MSSQL_SA_PASSWORD` — must satisfy SQL Server's complexity policy (8+ characters, mixing upper/lower/digit or symbol) or the container will fail to start.
   - `LOCAL_AGENT_EMAIL` / `LOCAL_AGENT_PASSWORD` — set both to provision a support-agent account. There's no environment gate on this seed (see the callout below) — set both to enable it, leave both empty to disable it.
   - `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` — set both to provision an initial Admin account, the only way to bootstrap the first Admin who can then create everyone else via "Manage Users." Leave both empty to disable it.

2. Build and start everything:

   ```bash
   docker compose up --build -d
   ```

3. Wait for all containers to report healthy:

   ```bash
   docker compose ps
   ```

4. Open the app: **http://localhost:4200**

RabbitMQ's management UI is available at **http://localhost:15672** (login with the `RABBITMQ_USER`/`RABBITMQ_PASS` you set in `.env`). Password-reset emails land in Mailpit's UI at **http://localhost:8025** rather than a real inbox (see "Forgot password" below).

Data persists across restarts via named volumes (`sqlserver-data`, `rabbitmq-data`) — `docker compose down && docker compose up` (no rebuild) keeps everything you created.

> **Note on the local-agent seed:** `LOCAL_AGENT_EMAIL`/`LOCAL_AGENT_PASSWORD` are **not** restricted to Development — `DbSeeder.SeedLocalAgentAsync` in `services/TicketService/Data/DbSeeder.cs` seeds this account whenever both values are non-empty, with no `ASPNETCORE_ENVIRONMENT` check at all. It's documented here as a "local convenience" account because that's how this repo's Compose/k8s setups use it, but the same mechanism is what seeds the support-agent account on the live AKS deployment too (see Track 3).

### Logging in

Three roles: **Customer**, **SupportAgent**, **Admin**. New accounts registered through the Angular app always become Customers — self-registration never produces a SupportAgent or Admin account. Staff and Admin accounts only come from an Admin using "Manage Users" (`/admin/users`) to create one, change a role, or deactivate an account.

### Using the app

**As a customer:**
1. Register, then log in.
2. "New Ticket" to raise an issue, with a category and priority — it appears in "My Tickets" as `Open`.
3. Open the ticket to see the agent's replies and status changes, and reply yourself.
4. Check the notification bell for updates on your tickets.

**As the support agent:**
1. Log in with credentials provisioned by an administrator (or the seeded `LOCAL_AGENT_*` account).
2. "Ticket Queue" lists all tickets, filterable by status, priority, category, and date range.
3. Open a ticket, "Assign to me" (or assign to another agent from the staff picker), reply — the ticket automatically flips from `Open` to `InProgress` on its first response.
4. Change status to `Closed` when resolved.
5. "Dashboard" shows live counts (open/in-progress/closed) and average first-response/resolution times across all tickets.

**As an admin:** everything a support agent can do, plus "Manage Users" — list/filter accounts by role, create a Customer/SupportAgent/Admin account, change an account's role, and activate/deactivate an account. An admin can't change their own role or deactivate their own account.

### Forgot / reset password

1. From the login page, click "Forgot password?" and submit an email.
2. Open Mailpit at **http://localhost:8025** — the reset email (with a working link back into the Angular app) lands there instead of a real inbox.
3. Follow the link, set a new password, log in.

### Browser end-to-end test

```bash
cd client
npm ci
npx playwright install chromium
npm run e2e
```

Set both `LOCAL_AGENT_*` values in `.env` first. The suite registers a customer, creates a ticket, signs in as the local agent to assign/reply/close it, then verifies the customer notification and updated dashboard metrics — using unique generated test data and waiting for event-driven projections to catch up.

### Tracing a request across services

Every log line carries a `CorrelationId`. To watch one flow across all three services:

```bash
docker compose logs ticket-service | grep -i correlationid   # find one, e.g. from a ticket-creation log line
docker compose logs response-service | grep <that-id>
docker compose logs notification-service | grep <that-id>
```

The same id appears in all three because the HTTP request's correlation id is threaded onto the RabbitMQ message it publishes, and each consumer logs under that same id.

---

## Track 2: Local — Kubernetes (Docker Desktop)

Closer to the real deployment topology (separate pods/Services/Deployments instead of one Compose file) while still fully local. Built and validated against Docker Desktop's built-in single-node Kubernetes, not AKS — but the manifests are ordinary Deployments/Services with no Docker-Desktop-specific fields, so they carry over conceptually to Track 3.

`sqlserver`, `rabbitmq`, and `mailpit` run as single-replica, no-backup pods purely so the stack is self-contained for a local demo.

**Prerequisites:**
- Docker Desktop with Kubernetes enabled (Settings → Kubernetes → Enable Kubernetes), context `docker-desktop` selected (`kubectl config use-context docker-desktop`).
- The four images built locally with the tags the manifests reference:

  ```sh
  docker build -t ticket-service:local -f services/TicketService/Dockerfile .
  docker build -t response-service:local -f services/ResponseService/Dockerfile .
  docker build -t notification-service:local -f services/NotificationService/Dockerfile .
  docker build -t client:local -f client/Dockerfile .
  ```

### A note on Docker Desktop's two Kubernetes provisioners

Docker Desktop can provision its Kubernetes cluster with either **kubeadm** (single node) or **kind** (multi-node — this is what was validated here: two nodes, `desktop-control-plane` + `desktop-worker`).

This matters for `imagePullPolicy: Never`, which these manifests use to force pulling from local images instead of a registry:

- **kubeadm**: the single node shares the host's Docker image cache directly — a `docker build` is immediately visible, no extra step.
- **kind**: each node is its own container with its own isolated containerd image store. A `docker build` on the host is **not** visible inside either node until explicitly loaded in. Docker Desktop doesn't bundle the `kind` CLI, so `k8s/load-images.sh` replicates `kind load docker-image` (`docker save` piped into each node container, then `ctr -n k8s.io images import` inside it):

  ```sh
  ./k8s/load-images.sh
  ```

  Run this once after each `docker build` of any of the four images, before `kubectl apply`. It no-ops safely under kubeadm.

### Deploy

1. Copy `k8s/examples/01-secret.example.yaml` to `k8s/01-secret.yaml` (gitignored) and fill in `JWT_SECRET` / `RABBITMQ_USER` / `RABBITMQ_PASS` / `MSSQL_SA_PASSWORD` — the same values as the repo root `.env` used by `docker compose`. The template lives in `k8s/examples/` rather than directly in `k8s/` so a non-recursive `kubectl apply -f k8s/` never picks up its empty placeholder values alongside the real secret.
2. If on kind, run `./k8s/load-images.sh` after building the images.
3. `kubectl apply -f k8s/`
4. `kubectl get pods -w` until everything is `Running`/`Ready` (SQL Server takes ~30-60s to accept connections on first start).
5. Open **http://localhost:4200**. The client's nginx proxies every `/api/*` call to the right backend Service by path (`auth`/`tickets`/`users` → TicketService, `responses` → ResponseService, `metrics`/`notifications` → NotificationService) — the Angular app itself uses one relative `/api` base URL, not per-service ports. Each backend Service is `type: LoadBalancer` bound to `localhost` (Docker Desktop's Kubernetes exposes `LoadBalancer` Services on `localhost` directly, no separate ingress controller needed) purely so you can hit a service's port directly for debugging; the app itself never needs those ports.

### Tear down

```sh
kubectl delete -f k8s/
```

Leaves the PersistentVolumeClaims' underlying data around only as long as Docker Desktop's Kubernetes node exists; deleting the PVCs too removes it: `kubectl delete pvc sqlserver-data rabbitmq-data`.

### Moving to a real cluster

See Track 3 below — `k8s/azure-dev/` is a kustomize overlay of these same base manifests, adapted for AKS (managed images via ACR, Ingress + TLS instead of `LoadBalancer`, Key-Vault-backed secrets).

---

## Track 3: Azure Kubernetes Service

### See the live demo

The trial deployment is live at:

**https://52.152.144.127.nip.io**

("nip.io" resolves any `<ip>.nip.io` hostname to that IP with no DNS zone needed — it's fronted by a real Let's Encrypt certificate via cert-manager, so the padlock is genuine, not self-signed.)

Seeded accounts (passwords are not committed to the repo — request them separately):

| Role | Email |
|---|---|
| Admin | `admin@test.com` |
| SupportAgent | `support@test.com` |

Both accounts exist because of the same seeding mechanism described in Track 1 — `INITIAL_ADMIN_*` and `LOCAL_AGENT_*` are populated on this cluster from Key-Vault-backed pipeline variables rather than a `.env` file, but the underlying `DbSeeder` code path, and the lack of any environment gate on it, is identical.

**What to expect:** this is a single-node, free-tier AKS cluster running self-hosted SQL Server and RabbitMQ in-cluster (not managed Azure SQL/Service Bus) — a cost-constrained trial environment, not a production SLA. Password-reset emails will accept the request but currently have no delivery path on this cluster (see `docs/requirement/gap-analysis.md`'s "Scope for further improvement" — the AKS overlay doesn't deploy Mailpit); everything else works the same as the local tracks above.

### Deploy your own

Condensed version — see `docs/azure-deployment.md` for the full runbook and `docs/ci-cd-pipeline.md` for what the pipeline actually does stage-by-stage.

1. Provision the Azure resources (resource group, ACR, AKS cluster with workload identity) and an Azure Key Vault for secrets.
2. Set up Azure DevOps: connect the repo, create a service connection, an environment with an approval check, and the two variable groups (plain + Key-Vault-backed).
3. Bootstrap the least-privilege `ci-deployer` ServiceAccount and its RBAC (`k8s/azure-dev/ci-deployer-rbac.yaml`) — the pipeline deploys as this identity, never as cluster-admin.
4. Install ingress-nginx and cert-manager once, cluster-scoped, then run the pipeline (`azure-pipelines.yaml`):
   - **Validate** → **BuildAndPush** → **DeployDev** (manual-approval gated) → **SmokeTest** → **E2ETest**
   - All but `Validate` are skipped on PR-triggered runs, so opening a PR never touches the cluster.
5. Verify with `kubectl -n support-ticketing-dev get pods,svc,pvc`, then open the `clientEndpoint` URL.

Full detail — Key Vault secret names, the `ci-deployer` RBAC bootstrap, TLS setup, Container Insights, and cost notes — is in `docs/azure-deployment.md`.

---

## Project layout

```
support-ticket-system/
├── docker-compose.yaml
├── azure-pipelines.yaml
├── k8s/                       # base manifests (Docker Desktop) + azure-dev/ overlay (AKS)
├── services/
│   ├── Contracts/            # shared event DTOs, JWT wiring, observability — no domain entities
│   ├── TicketService/        # Identity + ticket CRUD
│   ├── ResponseService/      # responses + ticket read-model
│   └── NotificationService/  # notifications + metrics
└── client/                   # Angular app
```

## Where to go next

- `docs/requirement/gap-analysis.md` — how this implementation compares to the original requirements, plus a forward-looking "Scope for further improvement" section.
- `docs/azure-deployment.md` — the full AKS trial-deployment runbook.
- `docs/ci-cd-pipeline.md` — the Azure Pipelines internals and RBAC deploy identity in detail.
- `docs/postman/README.md` — API testing via the included Postman collection.
- Root `README.md` — architecture overview and a quick pointer back here.
