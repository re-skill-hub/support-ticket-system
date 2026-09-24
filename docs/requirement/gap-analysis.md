# Gap analysis: `Design Document.docx` vs. this implementation

This records every place the running system diverges from `Design Document.docx`, and how each divergence was resolved. It extends — rather than repeats — the "Scope notes" section at the bottom of the root `README.md`, which lists deliberate omissions from the as-built system's own point of view; this document instead starts from the design doc's requirements and works forward.

Snapshot date: 2026-09-24.

## Resolution categories

- **Implemented** — the gap was closed; the design doc's requirement is now met.
- **Kept as an improvement** — the running system deliberately does something more capable than the doc's generic template describes, and was left as-is rather than reverted to match it.
- **Documented, out of scope** — the doc's requirement has no current consumer or use case in this system, and implementing it would be speculative; recorded here rather than built.

## Architecture

| Design doc requirement | Current state | Resolution |
|---|---|---|
| Single ASP.NET Core Web API, single SQL Server database, Repository pattern over EF Core | Three independently deployable microservices (TicketService, ResponseService, NotificationService), one database per service, controllers use EF Core directly with no repository layer | **Kept as an improvement.** The doc's own architecture section calls for "Microservices"; database-per-service and direct EF Core usage are the more idiomatic way to realize that, and a repository layer over EF Core (already a repository abstraction) would add indirection without behavioral benefit. |
| `PUT /tickets/{id}/comment` — comments as a sub-resource of the ticket, no event bus | Comments/replies live in a separate ResponseService; TicketService, ResponseService, and NotificationService communicate only via RabbitMQ events (`TicketCreated`, `TicketStatusChanged`, `ResponseAdded`), with no synchronous inter-service calls | **Kept as an improvement.** This is the direct consequence of the microservices decision above — a shared "comment" endpoint on TicketController isn't possible once responses own their own service and database; the event bus is what keeps the two consistent without a distributed transaction. |
| Azure DevOps pipeline → Azure Kubernetes Service (AKS) | No Azure subscription/DevOps org exists for this capstone | **Implemented, adapted.** See "CI/CD and deployment" below. |

## Frontend framework and tooling

| Design doc requirement | Current state | Resolution |
|---|---|---|
| Angular 18, NgModules (e.g. `customer.module.ts` / `support.module.ts`), Bootstrap | Angular 22, standalone components throughout (no NgModules), **Bootstrap 5 + `@ng-bootstrap/ng-bootstrap`**, feature-folder structure (`src/features/*`, `src/core/*`, `src/shared/*`) | **Implemented, with improvements kept.** Bootstrap now matches the design doc directly (an earlier iteration of this system used Angular Material instead; it was replaced with Bootstrap 5 + ng-bootstrap — `NgbModal` for dialogs, `NgbPagination` for tables, `NgbCollapse` for the responsive nav/sidebar — plus Bootstrap Icons and Inter as baseline visual polish). Standalone components and the feature-folder structure are kept as improvements over the doc's NgModule split: standalone components have been Angular's own recommended default since v16, and NgModules are legacy rather than current best practice. |
| Jasmine/Karma test runner | Vitest, via Angular's `@angular/build:unit-test` builder | **Kept as an improvement.** This is the Angular CLI's current default for new projects, replacing Karma/Jasmine; behavior (describe/it, `expect`) is equivalent, tooling is faster and simpler to run in CI (single non-interactive pass under `CI=true`, no headless-Chrome dependency). |
| Single environment, presumably with a dev/prod split implied by "Web App (Angular)" as a standard SPA deployment | One `environment.ts`, no `angular.json` `fileReplacements`, hardcodes `localhost:5101/5102/5103` for every build | **Documented, out of scope.** This follows directly from the existing README scope note that the Angular app calls all three services' ports directly with no API gateway/BFF — introducing a dev/prod split without also introducing a gateway or reverse proxy in front of the services would just move the same hardcoded ports into a second file. Left as a known limitation of the "call services directly" decision, not a new one. |

## Ticket fields and filtering

| Design doc requirement | Current state | Resolution |
|---|---|---|
| Tickets have Priority and Category, filterable in the queue/list views | `Ticket` had neither field; nothing to filter on | **Implemented.** `Priority` (`Low`/`Medium`/`High`/`Urgent`) and `Category` (`General`/`Technical`/`Billing`/`Account`) added to the `Ticket` entity (new EF Core migration), `CreateTicketRequest`/ticket response DTOs, and `GET /api/tickets`'s existing `?status=` filter gained a sibling `?priority=` filter. Mirrored on the frontend: both fields on the create-ticket form, both displayed as table columns (customer's ticket list and the agent queue), a `PriorityChip` component (matching the existing `StatusChip` pattern) for visual display, and a priority filter dropdown in the agent queue alongside the existing status filter. |

## API testing

| Design doc requirement | Current state | Resolution |
|---|---|---|
| Postman collection for manual/API testing | Only informal per-service `.http` scratch files, none filled in | **Implemented.** `docs/postman/support-ticketing.postman_collection.json` (Auth, Tickets, Responses, Notifications, Metrics folders, with test scripts that auto-chain `{{ticketId}}`/`{{notificationId}}` between requests) plus a matching environment file and a short README explaining the cookie-based-auth login flow. |

## CI/CD and deployment

| Design doc requirement | Current state | Resolution |
|---|---|---|
| Azure DevOps build pipeline (restore/build/test/publish) | None existed | **Implemented, adapted.** `.github/workflows/ci.yml` (GitHub Actions, since there's no Azure DevOps org for this capstone) — functionally the same stages: restore/build/test the .NET solution, then `npm ci`/test/build the Angular client, then a `docker build` per service and for the client as the "publish artifacts" equivalent, validating that every Dockerfile still builds. |
| Deployment to Azure Kubernetes Service (AKS) | None existed; README already deferred Azure/AKS as a stated future extension | **Implemented, adapted.** `k8s/` holds Deployment + Service manifests for all four app components plus `sqlserver`/`rabbitmq` (self-contained for a local demo), built and validated against **Docker Desktop's built-in Kubernetes** rather than real AKS — same manifest shape (ordinary Deployments/Services, no Docker-Desktop-specific fields), just a single local node instead of a managed multi-node cluster, since no Azure subscription is available for this capstone. `k8s/README.md` documents the local-vs-AKS scope and what would change to actually target AKS (registry push, managed SQL/broker, ingress). |

## Backend test coverage

| Design doc requirement | Current state | Resolution |
|---|---|---|
| Unit tests for controllers/services | 3 xUnit test projects already existed (`TicketService.Tests`, `ResponseService.Tests`, `NotificationService.Tests`; 55 `[Fact]`/`[Theory]` using Moq + EF Core InMemory) but were **not referenced by `SupportTicketing.slnx`**, so `dotnet test` on the solution silently discovered and ran zero of them | **Fixed.** All three test projects added to the `.slnx`; `dotnet test SupportTicketing.slnx` now discovers and runs all 55 tests. The vestigial `UnitTest1.cs` scaffold file was also removed in favor of the real, descriptively-named test files it had been left alongside. |

## Frontend test coverage

| Design doc requirement | Current state | Resolution |
|---|---|---|
| Test coverage for the Angular app (implied by "Testing" as a lifecycle stage in the design doc, and the Jasmine tooling it specifies) | Only the CLI-generated `src/app/app.spec.ts` boilerplate existed — zero real tests for any of the 5 core services, 2 guards, 2 interceptors, or feature components | **Implemented.** Vitest unit tests added for all 5 services (`auth`, `ticket`, `response`, `notification`, `metrics`), both guards (`auth.guard`, `role.guard`), and both interceptors (`auth.interceptor`, `error.interceptor`) using `HttpTestingController` and `TestBed.runInInjectionContext`; smoke-level component tests added for the three components the design doc names explicitly — `ticket-list`/`ticket-queue` (the doc's single "ticket list" view, split here into a customer view and an agent queue), `ticket-new`, and `ticket-detail`. |

## Out of scope

| Design doc requirement | Why it wasn't implemented |
|---|---|
| `GET /users/{id}` — retrieve another user's details | No screen or workflow in this system ever needs to view a user profile other than "who am I" (`GET /api/auth/me`, already implemented). Customers only see their own tickets; agents see ticket metadata (`assignedAgentId` as an id, not a profile) but never a separate user-lookup screen. Adding the endpoint without a consumer would be speculative surface area, so it's recorded here as a known, intentional gap rather than built. |

## See also

- Root `README.md`'s "Scope notes" section — deliberate omissions from the as-built system's own perspective (no API gateway/BFF, no JWT refresh-token rotation, Docker Compose as the primary deployment target).
- `k8s/README.md` — Docker Desktop vs. AKS scope note for the Kubernetes manifests specifically.
- `docs/postman/README.md` — how to run the Postman collection against a live stack.
