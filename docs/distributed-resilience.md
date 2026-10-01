# Distributed exception handling & fault tolerance

Why this exists: the original implementation had a working happy path but shallow failure handling — no shared exception hierarchy, no resilience policies around outbound calls, a flat MassTransit retry with no dead-letter visibility, and no gateway to centralize any of it. This document covers everything added to close that gap, on both the .NET backend and the Angular frontend, and calls out what was deliberately left for later.

See also: `docs/architecture-diagram.svg` (shows the gateway live in the request path) and `docs/architecture-diagram-local.svg` (the Docker Compose topology), `docs/ci-cd-pipeline.md` (the pipeline hardening that came out of this same pass).

## Backend (.NET 10)

### Shared exception hierarchy (`services/Contracts/ExceptionHandling/AppException.cs`)

Every service threw raw framework exceptions (`InvalidOperationException`, etc.) for both business-rule violations and genuine bugs, giving nothing downstream a way to tell them apart. `AppException` is the fix: an abstract base with `StatusCode`, `ErrorCode` (defaults to the type name), and `IsTransient` (default `false`). `IsTransient` is the single flag both the HTTP exception handler and the MassTransit retry filter key off — "is this retryable" is decided once per exception type instead of duplicated in two places.

Concrete types:
- `NotFoundException` (404)
- `ConflictException` (409 — state-transition/concurrency conflicts)
- `BusinessRuleException` (400 — domain rule violations, distinct from ASP.NET's automatic model-validation 400s)
- `ForbiddenException` (403 — business-level authorization, distinct from JWT role checks)
- `ProjectionNotReadyException` (409, `IsTransient = true`) — thrown by a consumer when a projection it depends on (e.g. `TicketMetric`/`TicketRef`) hasn't landed yet. This is a race between two independently-retried events, not a bug, so it retries/redelivers instead of dying on a bug-appropriate schedule. Used by `NotificationService`'s `ResponseAddedConsumer`/`TicketStatusChangedConsumer` and `ResponseService`'s `TicketStatusChangedConsumer`.

### Global HTTP exception handler (`services/Contracts/ExceptionHandling/GlobalExceptionHandler.cs`)

An `IExceptionHandler` registered ahead of ASP.NET's own `UseExceptionHandler()` default (which stays wired as a fallback net). Order of handling:
1. A client-aborted request (`OperationCanceledException` + `HttpContext.RequestAborted.IsCancellationRequested`) is logged at `Debug` and returns `true` without writing to a connection that's already gone — previously this would have been logged as a scary `Error`-level "unhandled exception" for a completely benign navigation-away/timeout.
2. `AppException` → its own status/`ErrorCode`/`Detail` as a `ProblemDetails` body, logged at `Warning`.
3. `DbUpdateConcurrencyException` → 409 `"ConcurrencyConflict"` with a friendly "reload and try again" message, logged at `Warning`. Previously fell through to the generic 500 branch despite the app already having a purpose-built `ConflictException` for exactly this kind of case.
4. Anything else → 500 `"UnexpectedError"` with a generic message (no stack trace or internal detail ever reaches the client), logged at `Error` with the full exception.

Every `ProblemDetails` response carries the request's correlation ID in `Extensions["correlationId"]`.

Registered via `AddSharedExceptionHandling()` in every service's `Program.cs`, including the API Gateway.

### Tiered MassTransit fault handling (`services/Contracts/Resilience/MassTransitResilienceExtensions.cs`)

Replaces the flat `UseMessageRetry(r => r.Interval(3, 5s))` that was identical (and un-triaged) across all three services:

1. **Immediate retry** — exponential backoff (3 attempts, 200ms → 5s), scoped via `.Handle<AppException>(e => e.IsTransient)` so only transient failures retry here; a non-transient business fault or an unexpected bug skips straight past instead of burning 3 slow synchronous attempts.
2. **Delayed redelivery** — 30s/5m/30m intervals via `UseDelayedMessageScheduler`, gated behind the `RabbitMq:DelayedRedeliveryEnabled` config flag (default `false`). This tier needs the RabbitMQ delayed-message-exchange plugin installed on the broker; enabling it without that plugin breaks message scheduling entirely, so it's off by default until that infra change is made (see "Deferred" below).
3. **Circuit breaker** — `TrackingPeriod=1m`, `TripThreshold=15`, `ActiveThreshold=10`, `ResetInterval=5m`. Stops hammering a confirmed-down dependency (e.g. a DB outage) instead of retrying every message individually.
4. **Dead-letter visibility** — MassTransit already auto-routes exhausted messages to the queue's own `_error` queue; `FaultLoggingConsumeObserver` adds a grep-able `MESSAGE_CONSUME_FAULT` log line on every fault (not only the final dead-lettered one) so this is operationally visible today without a real alerting pipeline. Registered via `AddFaultLogging()`.

Applied identically in `TicketService`, `ResponseService`, and `NotificationService`'s `Program.cs` via `cfg.UseResilientFaultHandling(builder.Configuration)`.

### Polly resilience pipelines (`services/Contracts/Resilience/ResiliencePipelines.cs`)

There's no synchronous inter-service HTTP in this system, so these wrap the two outbound calls that previously had no timeout or retry at all:
- `"smtp"` — 2 retries, exponential, 1s base delay, 10s timeout. Wraps `SmtpEmailSender` so a slow/down SMTP relay can't hang a request thread indefinitely.
- `"publish"` — 3 retries, exponential, 1s base delay, **deliberately no circuit breaker or timeout** — a publish failure should surface fast (as a 503 to the caller) rather than hold the HTTP request open. Wraps every `IPublishEndpoint.Publish` call in `TicketsController` and `ResponsesController`; since the DB write has already committed by the time this runs, a final failure is logged at `Critical` ("event is lost") — a known, documented residual risk (no transactional outbox) rather than a silently swallowed one.
- `AddDefaultHttpResilience()` — a ready-made-but-currently-unused standard `HttpClient` resilience handler, for the first real inter-service HTTP call or the API Gateway's forwarder clients whenever one is added.

### API Gateway (`services/ApiGateway`) — YARP reverse proxy

A 4th .NET 10 service, added specifically to give the resilience and exception-handling work above a single front door instead of duplicating it at the edge. Built on [YARP](https://microsoft.github.io/reverse-proxy/) (`Yarp.ReverseProxy`).

- **Routing** (`appsettings.json`): 6 routes mapped to 3 clusters, mirroring the same grouping `client/nginx.conf` already used — `auth`/`tickets`/`users` → `ticketServiceCluster`, `responses` → `responseServiceCluster`, `metrics`/`notifications` → `notificationServiceCluster`.
- **Timeouts**: each route has a 10s `Timeout` (needs `AddRequestTimeouts()` + `UseRequestTimeouts()` wired in `Program.cs` — YARP throws at request time if that middleware isn't present).
- **Active health checks**: each cluster polls its destination's `/health/ready` every 10s (5s timeout, `ConsecutiveFailures` policy) and pulls a degraded backend out of rotation automatically — the first real payoff of the split liveness/readiness design that already existed.
- **Exception handling**: reuses the same `AppException`/`GlobalExceptionHandler` as the backend services, so a gateway-originated fault (no destination available, resilience pipeline exhausted) returns the same `ProblemDetails` shape instead of YARP's raw default error response.
- **Correlation ID**: the gateway runs `UseCorrelationId()` too — since client traffic now hits it first, it's the primary correlation-ID origin. This only works end-to-end because `ObservabilityExtensions.UseCorrelationId` was fixed to also write the (possibly newly-minted) ID back onto the *request* header, not just the response — otherwise a request that arrived with no correlation ID would get a gateway-minted one that never reached the backend, which would then mint its own different one. Verified end-to-end against a live stack: the exact correlation ID minted at the gateway showed up in the matching `TicketService` log line for the same request.
- **No auth of its own** — the gateway doesn't validate JWTs; it just forwards, and each backend service still authenticates and authorizes independently. Defense stays where it already was.

**Current status: live in every environment.** `client/nginx.conf` routes every `/api/*` call through the gateway (`proxy_pass http://api-gateway:8080`) instead of calling the three backend services directly — verified end-to-end (login, an authenticated ticket listing, and the full Playwright suite all pass through the new routing) before this was considered done. The gateway runs as its own container in `docker-compose.yaml` (port 5100), has a manifest for local Kubernetes (`k8s/09-api-gateway.yaml`), and is deployed in the AKS `k8s/azure-dev` overlay and built by the pipeline's `parameters.services` list — the same cutover across all three environments, not just locally.

Cutting this over surfaced a real, separate pre-existing bug: the local Kubernetes Services (`k8s/04`–`k8s/06`, and now `k8s/09`) only exposed a "debug" port (5101/5102/5103/5100, for hitting a service directly from the host) and never the container's actual port (8080) — so nginx (and now the gateway) running *inside* that cluster could never have reached any backend via its Service, only from `docker-compose` and AKS (whose Services always used 8080). Fixed by giving each local Service both a `debug` port and an `internal` (8080) port.

### Distributed tracing (`services/Contracts/Observability/TracingExtensions.cs`)

OpenTelemetry SDK wired into every service (including the gateway) via `AddSharedTracing(serviceName)`: ASP.NET Core + SqlClient instrumentation, plus `AddSource("MassTransit")` (MassTransit 8 emits `Activity` spans natively, chaining a publish on one service to the consumer that handles it on another). A console exporter is always on; an OTLP exporter is added only if `OTEL_EXPORTER_OTLP_ENDPOINT` is set. `Serilog.Enrichers.Span` ties the existing `CorrelationId`-based logs to the same `TraceId`/`SpanId`. No real tracing backend (Jaeger/App Insights) is stood up — that's deliberately out of scope for this pass; the hook is there for whenever one is.

### Consistency fixes bundled with this work

- `EnableRetryOnFailure()` on the EF Core SQL connection was previously only set in `TicketService` — added to `ResponseService` and `NotificationService` too.
- `ResponseService`'s `TicketStatusChangedConsumer` used to log-and-skip on a missing `TicketRef` projection (silently losing the status update forever if the race ever actually happened); it now throws `ProjectionNotReadyException` like its `NotificationService` counterpart, so it retries/redelivers instead.
- The `SourceMessageId` idempotency check duplicated across `NotificationService`'s consumers was extracted into a shared `ConsumedMessageGuard`/`IHasSourceMessageId` (`services/Contracts/Messaging/`).

## Frontend (Angular)

### Interceptor chain (`client/src/app/app.config.ts`)

Registration order matters — interceptors wrap each other in array order, so this is `[correlationId, auth, error, timeout]`:

- **`correlation-id.interceptor.ts`** — mints `crypto.randomUUID()` and sets `X-Correlation-Id` on every outgoing request, so the backend's `UseCorrelationId` uses the browser-supplied ID instead of always generating its own. This is what actually closes the click-to-log traceability loop end-to-end.
- **`timeout.interceptor.ts`** — bounds every request to a timeout (`REQUEST_TIMEOUT_MS`, default 15s, overridable per-call via `HttpContext`; previously unbounded — a hung backend call would block indefinitely). For GET requests only, retries up to twice (linear backoff) on a network error, a 502/503/504, or the request timing out. Never retries 4xx or non-idempotent verbs. Registered *after* `error.interceptor` in the array specifically so `errorInterceptor`'s `catchError` only sees the final result once retries are exhausted.
- **`error.interceptor.ts`** (existing, extended):
  - Splits a 401 into **session-expired** (was authenticated — toast + logout + redirect to `/login`) vs. **unauthorized** (never was — toast only, nothing to log out of), instead of always claiming "your session has expired" even for a request that was never going to succeed.
  - Guards against duplicate handling when several concurrent requests fail with 401 around the same moment (a real session lapse fails every in-flight request near-simultaneously) — `AuthService.isSessionExpiring()`/`beginSessionExpiry()`/`endSessionExpiry()` ensure only the first triggers the toast/logout/redirect.
  - Navigates to `/service-unavailable` only when a `status: 0` failure coincides with the browser itself reporting offline (`ConnectivityService`) — a single flaky request isn't treated as "the app is down."
  - `extractMessage()` now also reads the RFC 7807 `ProblemDetails` shape's `detail` field (the backend's `GlobalExceptionHandler` produces `detail`, not `message` — the two are different JSON fields, and the original extraction only checked for `message`, so every new backend error was silently falling through to a generic "Something went wrong" instead of showing its actual text).
  - Added specific messages for 429 ("Too many attempts...") and 502/503/504 ("The service is temporarily unavailable...") — the latter is checked *before* body-shape parsing, since a gateway/proxy failure never reaches application code to produce a `ProblemDetails` body at all.
  - Guards against a raw HTML error page (e.g. an unstyled gateway error) being dumped verbatim into a toast.

### Global `ErrorHandler` (`client/src/core/error-handling/global-error-handler.ts`)

`provideBrowserGlobalErrorListeners()` only covers `window.onerror`/unhandled promise rejections — not Angular's own internal `ErrorHandler`, which is what actually fires for a change-detection, template-binding, or lifecycle-hook error. Without this override those errors only ever reached the console, leaving the user on a silently broken screen. `GlobalErrorHandler` still logs to console and additionally shows a toast.

### Connectivity + offline UX

- **`connectivity.service.ts`** — wraps `navigator.onLine` + the `online`/`offline` window events into an `isOnline` signal.
- **`shared/offline-banner`** — a persistent, non-blocking "You're offline" bar shown whenever `isOnline()` is false, mounted once in `app.html` above everything else.
- **`features/service-unavailable`** — a dedicated full-page fallback (mirroring the existing 404 page) that `error.interceptor.ts` navigates to for sustained network-down conditions.

### `RequestState<T>` helper (`client/src/core/http/request-state.ts`)

Formalizes the `loading`/`error`/`data`/`retry()` signal pattern that was already implemented ad hoc per component (e.g. the old `user-list.ts`). Introduced as a reference and adopted in `UserList` — **not** mass-migrated across every list component in this pass; `TicketList`/`TicketQueue` still use their own raw signals.

### A real bug found and fixed along the way

While chasing an E2E failure in `user-management.spec.ts`, tracing it all the way to raw DOM state (`selectedIndex`, `options[].selected`) surfaced a genuine, reproducible Angular bug, independent of anything else in this pass: a plain `[value]` binding on a native `<select>` is unreliable when its `<option>`s are generated by a nested `@for` block — the value can be applied before the options exist, so the browser finds no match and silently falls back to the first option. This affected the "Change role" and "Role filter" selects in `user-list.html`: changing a user's role visually reverted to "Customer" even though the backend had saved the change correctly. Fixed by using static `<option>` elements instead of `@for` (the role list is a fixed 3 items, so nothing was gained by generating them dynamically).

## CI/CD pipeline hardening

See `docs/ci-cd-pipeline.md` for the full pipeline reference. The one change that came directly out of this pass: `BuildAndPush`/`DeployDev`/`SmokeTest`/`E2ETest`'s stage conditions previously only checked `ne(Build.Reason, 'PullRequest')` to skip deployment for PR validation builds. That doesn't stop a **manually-queued run** against an unmerged feature branch — a manual run's `Build.Reason` is `'Manual'`, not `'PullRequest'`, so it sailed straight through to a real AKS deployment. Confirmed this had actually happened (a manual run against `feature/azure-deploy`, not `main`, successfully completed `DeployDev`). Fixed by adding `eq(Build.SourceBranch, 'refs/heads/main')` to all four gated conditions — verified against Azure DevOps' own pipeline-preview API before relying on it.

## Deferred (infra/config changes, not part of this pass)

These were identified while doing this work but deliberately not applied — each needs a decision on the live environment, not just a code change:

- **nginx-level timeout/error-page hardening** — `proxy_connect_timeout`/`proxy_read_timeout`/custom error pages on `client/nginx.conf`, now that it's the front door to the gateway. Not done as part of the cutover itself.
- **RabbitMQ delayed-message-exchange plugin** — needed to turn on Tier 2 (delayed redelivery) above; the C# side is already gated behind a config flag waiting for it.
- **K8s resource requests/limits** on `k8s/04-ticket-service.yaml`, `05-response-service.yaml`, `06-notification-service.yaml`, `07-client.yaml`, and `09-api-gateway.yaml` — only the infra pods (SQL Server, RabbitMQ, Mailpit) have them in the base (local/Docker-Desktop) manifests today. (The `k8s/azure-dev` overlay's own copies of the app Deployments *do* already have resource limits — this gap is specific to the base manifests used for local Kubernetes.)
- **Azure DevOps deploy-approval gate** — an Approval check exists on the `support-ticketing-dev` environment (created 2026-09-27) but is currently **disabled**, so `DeployDev` still runs unattended even for a fully reviewed, merged change. Re-enabling it and naming an approver is a one-click portal action, held pending confirmation.
- **GitHub branch protection `enforce_admins`** — currently `false` on `main`, meaning an account with admin/write-bypass rights can skip the required review and status check entirely. Everything that has actually landed on `main` so far went through a real, reviewed PR (#1–#8) — this is a closeable gap, not a known-exploited one — but flipping it is a real workflow change (it would also restrict the admin accounts' own ability to push directly) and is held pending confirmation.
