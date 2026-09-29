# Support Ticketing System

A customer support ticketing system built as a microservices capstone: customers raise tickets, support agents respond and manage status, and response/resolution time is tracked as a measurable business outcome.

- **ASP.NET Core Web API** (.NET 10) — three independent services, one database each
- **Angular 22** (standalone components, signals, Bootstrap 5 + ng-bootstrap) — customer and agent dashboards
- **RabbitMQ** (via MassTransit) — event-driven communication between services
- **SQL Server** — one shared instance, three isolated databases (`TicketServiceDb`, `ResponseServiceDb`, `NotificationServiceDb`)
- **Docker Compose** — the entire stack, infra and app, in one command

## Architecture

| Service | Responsibility | Port |
|---|---|---|
| **TicketService** | Auth (JWT issuance), ticket CRUD, status/assignment | `5101` |
| **ResponseService** | Agent/customer responses on a ticket, thread history | `5102` |
| **NotificationService** | Notifications, response-time/resolution-time metrics | `5103` |
| **client** | Angular dashboard (served by nginx) | `4200` |

Services communicate only through RabbitMQ events (`TicketCreated`, `TicketStatusChanged`, `ResponseAdded`) — there are no synchronous service-to-service calls and no cross-database joins. ResponseService and NotificationService build their own local read-models purely from consumed events (event-carried state transfer).

![Architecture diagram: Angular client calling three independent services, each with its own database, exchanging events through RabbitMQ](docs/architecture-diagram.svg)

The diagram above is app-only. For the full picture including the Azure DevOps pipeline, Key Vault, ACR, and the AKS cluster it deploys to, see the end-to-end deployment diagram:

![End-to-end deployment diagram: GitHub triggers an Azure DevOps pipeline that reads secrets from Key Vault, authenticates to AKS as the least-privilege ci-deployer identity, and pushes images through ACR; inside AKS, ingress-nginx and cert-manager terminate TLS in front of the same client/services/RabbitMQ architecture, with Container Insights streaming logs and metrics to Log Analytics](docs/architecture-diagram-e2e.svg)

Every service exposes `GET /health/live` (process-alive only, checked by its own Docker healthcheck) and `GET /health/ready` (SQL Server + RabbitMQ dependency check, used by Kubernetes readiness probes) — split so a transient dependency blip pulls a pod out of rotation instead of restarting it. Every service also logs structured JSON to the console enriched with a `CorrelationId` that flows from the originating HTTP request through every downstream consumer — so a single ticket's event chain is traceable across all three services' logs.

## Prerequisites

- Docker Desktop (with Compose v2)

That's it — the SDKs, Node, and Angular CLI used to build the images are baked into the Dockerfiles' build stages; you don't need them installed locally to run the stack.

## Running the stack

1. Copy the environment template and fill in real values:

   ```bash
   cp .env.example .env
   ```

   - `JWT_SECRET` — any long random string (32+ characters); shared by all three services since each validates tokens locally
   - `RABBITMQ_USER` / `RABBITMQ_PASS` — any credentials for the RabbitMQ container
   - `MSSQL_SA_PASSWORD` — must satisfy SQL Server's complexity policy (8+ characters, mixing upper/lower/digit or symbol) or the container will fail to start
   - `LOCAL_AGENT_EMAIL` / `LOCAL_AGENT_PASSWORD` — set both to provision a local-only support agent for browser E2E; leave both empty to disable it
   - `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` — set both to provision an initial Admin account; unlike `LOCAL_AGENT_*`, this seed runs in every environment (not just local Docker Compose), since it's the only way to bootstrap the first Admin who can then create everyone else. Leave both empty to disable it.

2. Build and start everything:

   ```bash
   docker compose up --build -d
   ```

3. Wait for all containers to report healthy:

   ```bash
   docker compose ps
   ```

4. Open the app: **http://localhost:4200**

RabbitMQ's management UI is available at **http://localhost:15672** (login with the `RABBITMQ_USER`/`RABBITMQ_PASS` you set in `.env`).

Data persists across restarts via named volumes (`sqlserver-data`, `rabbitmq-data`) — `docker compose down && docker compose up` (no rebuild) keeps everything you created.

## Logging in

There are three roles: **Customer**, **SupportAgent**, and **Admin**. New accounts registered through the Angular app always become Customers — self-registration never produces a SupportAgent or Admin account. Staff and Admin accounts only come from an Admin using the "Manage Users" screen (`/admin/users`) to create one, change an existing account's role, or deactivate an account; no reusable support credentials are shipped with the application, and there is no self-service way to create additional agents.

The first Admin has to come from somewhere before anyone can use that screen, so TicketService can optionally seed one initial Admin account on startup from `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD`/`INITIAL_ADMIN_FULL_NAME`. Unlike the local-only support agent below, this seed is **not** Development-gated — it runs in every environment (local Docker Compose and the AKS trial deployment alike), since without it a freshly-provisioned environment would have no Admin at all.

For local Docker Compose runs only, TicketService can also create an optional support agent when both `LOCAL_AGENT_EMAIL` and `LOCAL_AGENT_PASSWORD` are set in `.env`. This bootstrap is guarded by the Development environment and is not enabled for Kubernetes or production — it exists purely for the browser E2E test below.

## Browser end-to-end test

Start the Compose stack as described above, set both local-agent values in `.env`, then run:

```bash
cd client
npm ci
npx playwright install chromium
npm run e2e
```

The test registers a customer, creates a ticket, signs in as the local agent to assign, reply, and close it, then verifies the customer notification and updated dashboard metrics. It generates unique test data and waits for event-driven projections to catch up.

## Using the app

**As a customer:**
1. Register, then log in.
2. "New Ticket" to raise an issue — it appears in "My Tickets" as `Open`.
3. Open the ticket to see the agent's replies and status changes, and reply yourself.
4. Check the notification bell for updates on your tickets.

**As the support agent:**
1. Log in with credentials provisioned by an administrator.
2. "Ticket Queue" lists all tickets, filterable by status.
3. Open a ticket, "Assign to me", reply — the ticket automatically flips from `Open` to `InProgress` on its first response.
4. Change status to `Closed` when resolved.
5. "Dashboard" shows live counts (open/in-progress/closed) and average first-response/resolution times across all tickets.

**As an admin:** everything a support agent can do, plus "Manage Users" — list/filter accounts by role, create a Customer/SupportAgent/Admin account, change an account's role, and activate/deactivate an account. An admin can't change their own role or deactivate their own account (self-protection, enforced both in the UI and by the API).

## Tracing a request across services

Every log line carries a `CorrelationId`. To watch one flow across all three services:

```bash
docker compose logs ticket-service | grep -i correlationid   # find one, e.g. from a ticket-creation log line
docker compose logs response-service | grep <that-id>
docker compose logs notification-service | grep <that-id>
```

The same id appears in all three because the HTTP request's correlation id is threaded onto the RabbitMQ message it publishes, and each consumer logs under that same id.

## Project layout

```
support-ticket-system/
├── docker-compose.yaml
├── services/
│   ├── Contracts/            # shared event DTOs, JWT wiring, observability — no domain entities
│   ├── TicketService/        # Identity + ticket CRUD
│   ├── ResponseService/      # responses + ticket read-model
│   └── NotificationService/  # notifications + metrics
└── client/                   # Angular app
```

## Scope notes

Deliberately left out for this capstone (see the project plan for the full reasoning): no API gateway/BFF — the Angular app calls all three services' ports directly; no JWT refresh-token rotation — a single longer-lived access token is used instead. Docker Compose is the local-dev target described above; a trial deployment to Azure Kubernetes Service via an Azure DevOps pipeline also exists — see `docs/azure-deployment.md` — with SQL Server and RabbitMQ still self-hosted in-cluster rather than replaced by managed Azure SQL/a managed broker, which the same doc calls out as the gap before this could be a real production deployment.

For how this as-built system compares against `docs/requirement/Design Document.docx` specifically — what was implemented to close a gap, what was intentionally kept as an improvement over the doc's generic template, and what was left out of scope — see `docs/requirement/gap-analysis.md`.
