# POC/Capstone submission: demo video + code + Word doc → Box

## Context

This is a **submission/logistics task**, not a code change — the ticketing system itself is already hardened, tested, and running cleanly (103/103 backend tests, 127/127 frontend tests, `docker compose ps` healthy). Beyond Docker Compose, the system also has a real trial deployment on Azure Kubernetes Service, built and shipped by a 5-stage Azure DevOps pipeline — see `docs/requirement/gap-analysis.md` and `docs/running-the-app.md` for the canonical, up-to-date reference on everything that's built; this plan only covers packaging the finished work for grading: a 10–15 min demo video with all participants present, plus the buildable code and a Word doc, bundled into one folder and uploaded to Box.

**Note:** an earlier draft of this plan assumed Azure was explicitly scoped out of the submission in favor of Docker Compose only. That's no longer true — AKS and Azure DevOps CI/CD are real, live, and worth showing. The script and checklist below have been updated accordingly; Docker Compose remains the primary/fastest way to demo the golden path, with the live AKS URL as an optional addition, not a replacement.

You confirmed: this is a **team** submission, the video will be recorded **remotely via Zoom/Teams**, and right now you want (a) a timed video script/outline, (b) draft Word-doc content, and (c) a pre-recording build/health checklist — all produced below, ready to use. Two things only you can supply before final submission: the **Box upload link** and the **exact teammate names/roles** (placeholders are marked `[FILL IN]`).

## Step-by-step plan

### 1. Lock the open logistics details
- Confirm with your program/instructor (if not already known): the exact folder-naming convention for "your assigned use case" (this plan assumes `SupportTicketingSystem`, from the README title — rename if your assignment sheet specifies something else), the submission deadline, and the Box upload link (the instructions reference one "provided below" that wasn't included in what you pasted — retrieve it from the original assignment doc/email).
- Confirm final teammate list (names + role/contribution) — needed for both the video sign-off and the Word doc.

### 2. Schedule the recording session
- Since it's remote, book a Zoom or Teams meeting with **all participants required to attend** (the instructions are explicit about this). Pick a time, send the calendar invite, and confirm each person's segment (who talks/presents which part — see the script below, it's split by topic so you can assign sections to different speakers).
- Assign one person as the screen-sharer/driver for the live UI walkthrough (needs the stack running locally — see Step 3) and confirm they'll enable cloud or local recording at the start of the call.

### 3. Pre-recording build/health checklist (run this right before you hit record)
This proves the "error-free, buildable" claim on the actual state you're about to demo. Run from the repo root:

```bash
git status                                   # must be clean — nothing uncommitted, no stray files
git log -1 --oneline                         # note the commit hash you're demoing, for your own reference

# Backend: build + test the whole solution (expect 103/103 passing —
# 72 in TicketService.Tests, 13 in ResponseService.Tests, 18 in NotificationService.Tests)
dotnet build SupportTicketing.slnx
dotnet test SupportTicketing.slnx

# Frontend: build + test (expect 127/127 passing, ~80% statement coverage)
cd client
npm run build
npm test -- --watch=false
cd ..

# Full stack up and healthy
docker compose up --build -d
docker compose ps                            # every service must show "healthy"
```

If anything fails here, fix it and re-run before scheduling/recording — don't discover a broken build on camera.

**Optional — live AKS smoke check**, if you plan to demo or reference the live deployment (Step 4's intro/CI-CD beat):

```bash
curl --fail https://52.152.144.127.nip.io/
```

or just open that URL in a browser and confirm the app loads with a valid TLS certificate before recording.

Optional extra confidence: re-run the golden-path curl smoke test (register → login → create ticket → agent assign/reply → close → metrics) that was already verified working, or just walk it manually in the browser as part of the recording itself (see Step 4, section 4).

### 4. Video script/outline (10–15 min, timed)
Assign each numbered section to a speaker. Keep a visible timer; this is intentionally tight so the whole thing lands under 15 min.

**Before you hit record, have open:** a browser with tabs for the app (`localhost:4200` or the live AKS URL), Mailpit (`localhost:8025`), and (optionally) the live URL's TLS padlock; an IDE with `README.md`'s architecture table, `azure-pipelines.yaml`, and the key backend/frontend files named below already opened in tabs so you're not hunting for files on camera.

Each beat below has **Show** (what's on screen) and **Say** (a suggested line — read it close to verbatim, or use it as a memory jog; don't feel locked to the exact words).

**0:00–1:00 — Intro & use case**
- **Show:** Everyone briefly on camera/mic (attendance requirement).
- **Say:** *"Hi, we're presenting our capstone: a customer support ticketing system. Customers raise tickets, support agents respond to them and track status, and we measure response and resolution time as a real business outcome. It's built as three independent ASP.NET Core microservices behind an Angular 22 frontend, using RabbitMQ for events and SQL Server for storage. It runs three ways: Docker Compose for local dev, local Kubernetes, and a real trial deployment on Azure Kubernetes Service through a 5-stage Azure DevOps pipeline — we'll show all of that today."*

**1:00–2:00 — Architecture overview**
- **Show:** `README.md`'s architecture table and `docs/architecture-diagram.svg`.
- **Say:** *"Here are the three services — TicketService, ResponseService, and NotificationService — each with its own isolated database. They never call each other directly and there are no cross-database joins. The only way they communicate is by publishing and consuming events over RabbitMQ — TicketCreated, TicketStatusChanged, ResponseAdded. So when a ticket's status changes, ResponseService and NotificationService each hear about it as an event and update their own local copy of the data they need — that's called event-carried state transfer, and it's what lets us scale or redeploy one service without the others knowing or caring."*
- **Show (optional):** `docs/architecture-diagram-e2e.svg` as a lead-in to the CI/CD beat.
- **Say:** *"This second diagram is the same architecture, but showing how it actually gets deployed to Azure — we'll come back to this in a few minutes."*

**2:00–4:30 — Backend code & design patterns**
- **Show:** `services/Contracts/` (event DTOs, JWT wiring).
  **Say:** *"All three services reference one shared Contracts library instead of copy-pasting code. It defines the event shapes — TicketCreated, TicketStatusChanged, ResponseAdded — and the JWT authentication setup, so every service validates tokens and speaks events the exact same way. Change it once, all three services get the fix."*
- **Show:** `TicketsController.cs`, `AuthController.cs`, `UsersController.cs`.
  **Say:** *"Auth issues a JWT, but stores it in an httpOnly cookie instead of returning it to JavaScript — that's a deliberate choice, it means a cross-site-scripting bug can't steal the token, because client-side JS never has access to it. On top of that we have three roles — Customer, SupportAgent, Admin — enforced with policy-based authorization on every endpoint, plus a full filter set on tickets: status, priority, category, customer, and date range, all as query parameters. We also built forgot-password and reset-password flows that send a real email — we'll see that land in Mailpit later in the demo."*
- **Show:** `ResponseService/Consumers/`, `NotificationService/Consumers/`.
  **Say:** *"This is the event-carried state transfer in action — these consumers listen for events and build up their own local read models. And because message queues can redeliver a message more than once, we guard against double-processing with a SourceMessageId idempotency check, so a duplicate delivery can't double-count a metric or send the same notification twice."*
- **Show:** `MetricsController.cs`.
  **Say:** *"This is where average first-response time and resolution time get computed — the numbers you'll see on the dashboard later aren't hardcoded, they're calculated live from actual ticket events."*
- **Show:** the `*.Tests/` projects in `SupportTicketing.slnx`.
  **Say:** *"And all of this is backed by real unit tests — 103 of them across the three services, all passing — not just smoke tests that check the code compiles."*

**4:30–6:30 — Frontend code & design patterns**
- **Show:** `client/src/features/dashboard/dashboard.ts`.
  **Say:** *"The frontend is Angular 22, using standalone components and signals instead of the older NgModule style — it's Angular's own current recommended approach. This dashboard, for example, uses a signal and a computed value to drive a small inline SVG donut chart, with no charting library dependency at all."*
- **Show:** `client/src/shared/confirm-dialog/`, `ticket-detail.ts`.
  **Say:** *"Changing a ticket's status pops this confirm dialog. If you cancel, or if the API call fails, the dropdown visually reverts back to the original status instead of just silently sticking on the wrong value — small detail, but it's the kind of thing that matters for a real support tool."*
- **Show:** `ticket-list.ts` / `ticket-queue.ts`.
  **Say:** *"Both the customer's ticket list and the agent queue share a keyboard-accessible sortable-header directive and pagination component, with a full filter bar for status, priority, category, and date range."*
- **Show:** `client/src/shared/notification-bell/`, `client/src/features/profile/`.
  **Say:** *"The notification bell only fetches its preview list when you actually open the dropdown, not on every page load, and lets you mark a notification read inline. There's also a profile page showing your own account details."*

**6:30–7:30 — CI/CD and the AKS deployment**
- **Show:** `azure-pipelines.yaml`.
  **Say:** *"Beyond Docker Compose, we also have a real trial deployment on Azure Kubernetes Service, built by a 5-stage Azure DevOps pipeline: Validate, BuildAndPush, DeployDev, SmokeTest, and E2ETest, which runs Playwright against the just-deployed environment. Opening a pull request only ever runs Validate — build and test — the other four stages are skipped so a PR can never accidentally touch the live cluster."*
- **Say:** *"The pipeline deploys using a least-privilege service account, not a cluster-admin identity, and pulls its secrets from Azure Key Vault rather than storing them in the pipeline itself."*
- **Show (optional):** the live URL `https://52.152.144.127.nip.io`.
  **Say:** *"And here it is actually running — real TLS certificate, real cluster. We can either continue the walkthrough here or on the local Docker Compose stack."*

**7:30–12:30 — Live UI walkthrough (the "overall functionality" ask)**
Drive this against the `docker compose up` stack from Step 3 (or the live AKS URL), at `http://localhost:4200`. Each step below has a one-line cue to say while you click.
1. Register a new customer, log in. **Say:** *"Registering as a new customer — and logging in issues that httpOnly cookie we mentioned; notice there's no token sitting in localStorage."* (open devtools Application tab briefly to show it)
2. Raise a ticket with a category and priority. **Say:** *"Filing a new ticket — it lands in My Tickets as Open."*
3. Log out, log in as a seeded support agent. **Say:** *"Now switching to a support agent account."*
4. Open "Ticket Queue." **Say:** *"This is the agent's queue — full filter bar, sortable columns, pagination."*
5. Open the ticket, assign it, reply. **Say:** *"Assigning it to myself and replying — that automatically flips the status to InProgress."*
6. Switch back to the customer, open the notification bell. **Say:** *"As the customer, the bell shows the new reply — marking it read, then opening the ticket to see the response."*
7. Back as agent, change status to Closed. **Say:** *"Changing status to Closed brings up the confirm dialog — cancelling once to show it reverts, then confirming for real."*
8. Open "Dashboard." **Say:** *"And the dashboard updates live — status distribution, average first-response and resolution time, computed from what we just did."*
9. "Forgot password?" then Mailpit. **Say:** *"Quick detour — requesting a password reset, and here's the actual email landing in Mailpit, with a working reset link."*
10. Log in as Admin, open "Manage Users." **Say:** *"And finally, as an Admin — creating an account and changing a role."*

**12:30–14:00 — Wrap-up**
- **Say (scope):** *"A few things we deliberately left out of scope: there's no API gateway or BFF — the Angular app talks to all three services through one nginx reverse proxy; there's no JWT refresh-token rotation, we use a single longer-lived access token instead; and on AKS we're still self-hosting SQL Server and RabbitMQ in-cluster rather than using managed Azure SQL or a managed broker. All of that is intentional and documented — see our gap-analysis doc for the full reasoning."*
- **Say (contributions, each participant in turn):** *"My name is [Name], and I worked on [role/contribution]."*

**14:00–15:00 — Buffer**
- Reserved for whichever section runs long; don't pad it if unused.

### 5. Record, then trim/export
- Record via Zoom/Teams cloud or local recording as decided in Step 2.
- Download the recording, trim any dead air/setup chatter from the start/end, and confirm the final cut is **between 10 and 15 minutes**.
- Export/save as a widely-playable format (`.mp4`) and do one full playback to confirm audio/video sync and that screen content is legible.

### 6. Word document — draft content (paste into a new .docx)

This is a full report, not a short summary — every claim below is drawn from what's actually implemented and verified in this repo (`docs/requirement/gap-analysis.md` and `docs/running-the-app.md` are the sources of truth; don't add anything beyond what they document).

**Before assembling the doc, export the two diagrams to images** so they can actually be embedded (Word can't render `.svg` inline reliably):
- Open `docs/architecture-diagram.svg` and `docs/architecture-diagram-e2e.svg` in a browser (or an SVG viewer), and export/save each as a PNG — either the browser's right-click "Save image as..." after opening the raw file, an OS screenshot, or, if available, a one-line CLI conversion (e.g. `npx svg2png docs/architecture-diagram.svg` or `inkscape docs/architecture-diagram.svg --export-type=png`). Save both PNGs somewhere local (they're throwaway working files for the doc — no need to commit them to the repo).
- Embed both images at page width in the Architecture section (§3) below.

```
Support Ticketing System — Capstone Submission

1. Overview / Use Case
A customer support ticketing system built as a microservices capstone. Customers raise
support tickets; support agents respond to and manage ticket status and assignment; response
time and resolution time are tracked as measurable business outcomes. Three roles are
supported end-to-end: Customer (raises tickets, views responses and notifications), Support
Agent (works an assignable ticket queue, replies, changes status), and Admin (manages user
accounts and roles).

2. Tech Stack
ASP.NET Core Web API (.NET 10, three independent microservices — TicketService, ResponseService,
NotificationService), Angular 22 (standalone components, signals, Bootstrap 5 + ng-bootstrap),
RabbitMQ (via MassTransit) for event-driven inter-service communication, SQL Server (one
isolated database per service), Docker Compose for local development, local Kubernetes for a
cluster-parity dev option, and Azure Kubernetes Service + Azure DevOps CI/CD for a real trial
deployment (5-stage pipeline: Validate, BuildAndPush, DeployDev, SmokeTest, E2ETest).

3. Architecture
[Embed architecture-diagram.png here]
TicketService, ResponseService, and NotificationService are independently deployable services,
each owning its own database. They do not call each other directly and there are no
cross-database joins — the only communication path is publishing and consuming events over
RabbitMQ (TicketCreated, TicketStatusChanged, ResponseAdded). ResponseService and
NotificationService each build their own local read model purely from consumed events
(event-carried state transfer), guarded by a SourceMessageId idempotency check so a redelivered
message can't double-count a metric or duplicate a notification. A shared Contracts library
holds the event DTOs and JWT auth wiring so all three services agree on both without duplicating
code.

[Embed architecture-diagram-e2e.png here]
This second diagram shows the same architecture as actually deployed: GitHub triggers an Azure
DevOps pipeline that authenticates to AKS as a least-privilege ci-deployer identity, reads
secrets from Key Vault, and pushes images through Azure Container Registry; inside the cluster,
ingress-nginx and cert-manager terminate TLS in front of the same client/services/RabbitMQ
architecture.

4. Key Features
- Ticket creation with category and priority; customer-facing "My Tickets" list
- Agent ticket queue with a full filter set (status, priority, category, customer, date range),
  sortable/keyboard-accessible columns, and pagination
- Assignment ("assign to me" or pick another agent), reply threads, and a status lifecycle
  (Open -> InProgress -> Closed) with a confirm-before-change dialog that reverts on cancel or
  on a failed update
- Notification bell with a lazily-loaded preview list and inline mark-as-read
- Dashboard with live status-distribution and first-response/resolution-time metrics, computed
  from real ticket/event data, not hardcoded
- Forgot-password / reset-password flow delivering a real email (via Mailpit in local
  environments)
- Admin "Manage Users" — create accounts, change roles
- Read-only profile page

5. Design Patterns & Engineering Highlights
- Event-carried state transfer between services, with idempotent consumers
- JWT authentication stored in an httpOnly cookie (not exposed to client-side JavaScript),
  policy-based role authorization for Customer / SupportAgent / Admin
- A shared Contracts library to avoid duplicating event schemas and auth wiring across services
- Angular 22 standalone components and signals throughout (no NgModules) — signals/computed
  drive a dependency-free inline SVG dashboard chart
- `/health/live` (process-alive) and `/health/ready` (dependency check) split per service, so a
  transient RabbitMQ/SQL blip pulls a pod out of rotation instead of restarting it
- Structured JSON logging enriched with a CorrelationId that flows from the originating HTTP
  request through every downstream consumer, so one ticket's event chain is traceable across
  all three services' logs

6. Testing & Quality
- Backend: `dotnet test SupportTicketing.slnx` — 103/103 tests passing (72 in
  TicketService.Tests, 13 in ResponseService.Tests, 18 in NotificationService.Tests)
- Frontend: `ng test` (Vitest) — 127/127 tests passing across 22 test files, 80.5% statement
  coverage (84.0% branch, 66.3% function, 83.6% line)
- Postman collection covering the full ticket filter set, agent listing, assign/unassign, and
  forgot/reset-password
- Playwright end-to-end test wired into the CI pipeline's E2ETest stage, run against the
  actually-deployed environment

7. Deployment
- Docker Compose is the primary local path — one command brings up all three services, the
  Angular client (served by nginx), SQL Server, RabbitMQ, and Mailpit
- Local Kubernetes (Docker Desktop) is available as a cluster-parity option using the same base
  manifests as the AKS overlay
- Azure Kubernetes Service hosts a real trial deployment, built and shipped by a 5-stage Azure
  DevOps pipeline (Validate, BuildAndPush, DeployDev, SmokeTest, E2ETest), using a least-
  privilege ci-deployer identity (not cluster-admin), Key-Vault-backed secrets, and TLS via
  cert-manager

8. Live Demo
Live URL: https://52.152.144.127.nip.io
| Role | Email |
|------|-------|
| Admin | admin@test.com |
| SupportAgent | support@test.com |
(Passwords available on request — not published in this document.)
What to expect: this is a single-node, free-tier AKS cluster running self-hosted SQL Server and
RabbitMQ in-cluster (not managed Azure SQL/Service Bus) — a cost-constrained trial environment,
not a production SLA. Password-reset emails are accepted but currently have no delivery path on
this cluster (no Mailpit deployed there); everything else works the same as the local tracks.

9. Scope & Known Limitations
Deliberately left out for this capstone: no API gateway/BFF (the Angular app calls all three
services through one nginx reverse proxy); no JWT refresh-token rotation (a single longer-lived
access token is used instead); the AKS trial still self-hosts SQL Server and RabbitMQ in-cluster
rather than managed Azure SQL / a managed broker; the AKS overlay has no Mailpit deployment, so
password-reset emails have no delivery path there. Full reasoning and the current list of
forward-looking improvements are in gap-analysis.md.

10. How to Run
cp .env.example .env, fill in the required secrets, then docker compose up --build -d and open
http://localhost:4200. Full instructions for all three run modes (Docker Compose, local
Kubernetes, Azure AKS) are in docs/running-the-app.md.

11. Participants
- [FILL IN: Name] — [role/contribution, e.g. Backend: TicketService & auth]
- [FILL IN: Name] — [role/contribution, e.g. Backend: ResponseService & NotificationService]
- [FILL IN: Name] — [role/contribution, e.g. Frontend: Angular client]
- [FILL IN: Name] — [role/contribution]
```

Adjust the participant roles/contributions to what's actually true for your team before finalizing.

### 7. Gather the buildable code
- Use the exact commit verified in Step 3 (`git log -1 --oneline` output you noted).
- Produce a clean copy for submission that **excludes build artifacts and dependencies** the grader doesn't need and that would otherwise bloat the upload: `node_modules/`, `client/dist/`, `services/**/bin/`, `services/**/obj/`, and (unless your program wants full history) `.git/`. The simplest reliable way to get this cleanly:
  ```bash
  git archive --format=zip -o SupportTicketingSystem-code.zip HEAD
  ```
  (`git archive` naturally excludes anything not tracked/committed, so gitignored build output is already left out — and it only includes what's actually committed, guaranteeing the code you zip matches what you tested in Step 3.)
- Unzip it into its own folder and do a **fresh** `docker compose up --build -d` from that extracted copy as a final "does the thing I'm about to submit actually build from scratch" check.

### 8. Assemble the submission folder
Create one folder named after your assigned use case (confirm the exact required name per Step 1), containing:
```
<UseCaseName>/
├── code/                     (the extracted, verified-buildable source from Step 7)
├── demo-video.mp4            (from Step 5)
└── <UseCaseName> - Overview.docx   (from Step 6)
```

### 9. Upload to Box
- Upload the whole folder to the Box link from Step 1.
- After upload, reopen the Box folder and spot-check: the video plays, the Word doc opens and shows the right participant list, and the code folder isn't missing anything (e.g. compare file count/top-level structure against your local copy).

## Verification
- `docs/requirement/gap-analysis.md` and `docs/running-the-app.md` are the canonical, up-to-date references for everything built — re-check this plan's script/checklist against them if either doc changes before recording.
- Pre-recording checklist (Step 3) all green immediately before recording.
- Final video: 10–15 min, all participants audible/visible at least once, covers architecture, backend design patterns, frontend design patterns, and a full UI walkthrough per the script.
- Word doc has the use-case summary and a complete, accurate participant list.
- Code folder builds clean from a fresh extraction (Step 7's from-scratch check).
- Box folder, once uploaded, contains exactly the three items named after the correct use-case folder name, and each one opens/plays correctly from Box itself.
