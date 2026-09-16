# Support Ticketing System

A customer support ticketing system built as a microservices capstone: customers raise tickets, support agents respond and manage status, and response/resolution time is tracked as a measurable business outcome.

- **ASP.NET Core Web API** (.NET 10) — three independent services, one database each
- **Angular 22** (standalone components, signals, Angular Material) — customer and agent dashboards
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

Every service exposes a `GET /health` endpoint (checked by its own Docker healthcheck) and logs structured JSON to the console enriched with a `CorrelationId` that flows from the originating HTTP request through every downstream consumer — so a single ticket's event chain is traceable across all three services' logs.

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

A support agent account is seeded automatically on TicketService's first startup:

- **Email:** `agent@support.local`
- **Password:** `Agent#Pass123`

Any new account registered through the Angular app's Register page becomes a **Customer**. There is no self-service way to create additional agents — that's intentionally out of scope for this capstone.

## Using the app

**As a customer:**
1. Register, then log in.
2. "New Ticket" to raise an issue — it appears in "My Tickets" as `Open`.
3. Open the ticket to see the agent's replies and status changes, and reply yourself.
4. Check the notification bell for updates on your tickets.

**As the support agent:**
1. Log in with the seeded credentials above.
2. "Ticket Queue" lists all tickets, filterable by status.
3. Open a ticket, "Assign to me", reply — the ticket automatically flips from `Open` to `InProgress` on its first response.
4. Change status to `Closed` when resolved.
5. "Dashboard" shows live counts (open/in-progress/closed) and average first-response/resolution times across all tickets.

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
├── docker-compose.yml
├── services/
│   ├── Contracts/            # shared event DTOs, JWT wiring, observability — no domain entities
│   ├── TicketService/        # Identity + ticket CRUD
│   ├── ResponseService/      # responses + ticket read-model
│   └── NotificationService/  # notifications + metrics
└── client/                   # Angular app
```

## Scope notes

Deliberately left out for this capstone (see the project plan for the full reasoning): no API gateway/BFF — the Angular app calls all three services' ports directly; no JWT refresh-token rotation — a single longer-lived access token is used instead.
