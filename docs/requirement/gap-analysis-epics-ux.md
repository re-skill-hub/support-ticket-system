# Gap analysis: `epic-user-story.txt` / `ux-design-consideration.txt` vs. this implementation

This is a second, independent gap analysis alongside `docs/requirement/gap-analysis.md` (which compares the implementation against `Design Document.docx`). That document is settled; this one starts from the two files opened for this pass — `docs/requirement/epic-user-story.txt` (8 epics of functional acceptance criteria) and `docs/requirement/ux-design-consideration.txt` (personas, UX journeys, interaction patterns) — and records what was found missing, what was built to close it, and what was deliberately left out.

Snapshot date: 2026-09-30.

## Resolution categories

- **Implemented** — the gap was closed; the epic's acceptance criteria or the UX doc's interaction pattern is now met.
- **Partially implemented** — the core mechanism exists but a specific polish item from the source doc was not built.
- **Documented, out of scope** — descoped for cost (this runs on a free/trial Azure subscription plus local Docker Compose) or because the source doc marks it explicitly as future work.

Most of Epics 1–2 (auth, ticket CRUD, RBAC) and 5–8 (EF Core, NFRs, testing, CI/CD) were already satisfied by the existing microservice architecture and are not re-litigated here — only the concrete gaps found during this pass are listed.

## Tier 1 — closed this pass

| Epic / UX source | Gap found | Resolution |
|---|---|---|
| Epic 1.4 (View User Profile) — `GET /users/{id}` should let a user view **their own** profile; UX doc's "Forgot password?" link | `GET /api/auth/me` already existed but had no frontend page; `AddIdentityCore<ApplicationUser>` in `Program.cs` had no `.AddDefaultTokenProviders()`, so password-reset tokens couldn't be generated at all | **Implemented.** `.AddDefaultTokenProviders()` added; `POST /api/auth/forgot-password` and `POST /api/auth/reset-password` added to `AuthController` (forgot-password always returns 200, no email-existence leak, reuses the existing `"auth"` rate-limit policy); new `Services/EmailSender.cs` sends via SMTP. New `client/src/features/auth/forgot-password/` and `reset-password/` pages, wired into `app.routes.ts` as anonymous routes; `login.html` links to forgot-password. New `client/src/features/profile/` read-only page at `/profile`, linked from the nav bar (replacing the previous static, unlinked full-name span). |
| Tier 1 email delivery, cost-constrained | Password-reset emails need somewhere to land without a paid provider | **Implemented via Mailpit.** Self-hosted single-container SMTP catcher (MailHog successor) added as a `docker-compose.yaml` service for local dev and `k8s/08-mailpit.yaml` for the AKS cluster (no ingress/public exposure, negligible resource cost on the trial cluster). `Smtp__Host/Port` and `Frontend__BaseUrl` are config-driven (`k8s/00-configmap.yaml` → `k8s/04-ticket-service.yaml` env vars), so swapping to a real provider later is a config change only — recorded as the intentional swap-in point rather than built against a paid service. |
| Epic 4.1 (Support Ticket List — "filters by status... and optionally by date or customer") | `GET /api/tickets` only filtered by `status`/`priority`; no date range, customer, or category filter | **Implemented.** `TicketsController.GetAll` gained `fromUtc`/`toUtc` (inclusive date range on `CreatedAtUtc`), `customerId`, and `category` filters, mirroring the existing `priority` pattern. `TicketService.getAll()` on the frontend was reshaped from positional args to a `TicketQueryFilters` object to keep the growing parameter list manageable; the agent queue (`ticket-queue.ts`/`.html`) gained matching category/customer-id/date-range controls, converting `<input type="date">` values to UTC day-boundary ISO strings at the point of the API call. |
| Epic 4 (triage/manage intent) — assign-to-other-agent | Backend only supported self-assignment (`PATCH /tickets/{id}/assign` with no body); no way for staff to hand a ticket to a colleague or unassign it | **Implemented.** The assign endpoint now accepts an optional `agentId` (`null` unassigns); a new `GET /api/tickets/agents` endpoint (staff-only, name-only `{id, fullName}` projection via `UserManager.GetUsersInRoleAsync`) feeds a staff picker dropdown on the ticket-detail page, added alongside the existing "Assign to me" shortcut. Kept off `UsersController` deliberately — that controller stays Admin-only for the full user-management roster (email, active status, role changes); the new endpoint is a minimal staff-visible slice on `TicketsController`, which is already staff-accessible. |
| Epic 4.2 (literal AC: "if the API call fails, an error message is displayed and the previously displayed status is preserved") | `ticket-detail.ts`'s `applyStatusChange()` had no `error` handler — a failed status PATCH left the status `<select>` on the attempted value instead of reverting | **Implemented.** An `error` callback now reverts `statusControl` to the ticket's last-known status on failure; the existing global error-toast interceptor still surfaces the failure message, so no duplicate error-handling was added. |
| UX doc: inline field-level errors, not just a generic toast | `login.ts` relied solely on the global 401 toast for invalid credentials | **Implemented.** `login.ts` now sets a local error signal on 401 and renders it inline above the form; the global toast is kept for unexpected errors (500/network), which is the case the UX doc's "inline vs. global" split is actually drawing. |
| Accessibility (both sources: keyboard-first, WCAG-aligned interaction patterns) | `shared/sortable-header/sortable-header.directive.ts` was mouse-only (click handler, no keyboard path); form errors in `login.html`/`register.html`/`ticket-new.html`/the reply box weren't wired to their inputs via ARIA | **Implemented.** The sortable header directive gained `tabindex="0"`, `role="columnheader"`, `(keydown.enter)`/`(keydown.space)` handlers, and `[attr.aria-sort]` bound to sort direction. `aria-invalid`/`aria-describedby` now connect each of those inputs to its inline error block. |

## Tier 2 — worth doing, partially closed this pass

| Item | Status | Notes |
|---|---|---|
| Relative timestamps ("5 minutes ago") | **Implemented.** | New `shared/relative-time/relative-time.pipe.ts` (`Intl.RelativeTimeFormat`-backed, unit-tested), used in `ticket-list`, `ticket-queue`, `ticket-detail` (ticket header + response thread), and `notification-list`. The exact timestamp is kept as a `title` tooltip alongside the relative text rather than dropped, so nothing is lost for a user who wants the precise time. |
| "You" / "Support" comment labeling instead of the raw role string | **Implemented.** | `ticket-detail.ts` gained `authorLabel(response)`, comparing `response.authorUserId` against `authService.currentUser()?.id` first (→ "You"), then falling back to `isStaffRole(response.authorRole)` (→ "Support" or "Customer"). |
| Aging/unassigned/high-priority visual emphasis in the agent queue | **Implemented, partially.** | `ticket-queue.ts` gained `isAging(ticket)` (unassigned, not closed, older than 24h) which highlights the row (`.aging-row`) and shows a warning icon on the age cell. High-priority emphasis was not added separately — the existing `PriorityChip` component already visually distinguishes `Urgent`/`High` in its own column, so a second highlight mechanism was judged redundant rather than additive. |
| Success toasts for status-change/assign/reply | **Implemented.** | The existing `ToastService` (previously wired for errors only, via the global interceptor) now also fires on successful status changes, self-assign, reassign/unassign, and sent replies in `ticket-detail.ts`. |
| Notification bell dropdown preview | **Implemented.** | New shared `client/src/shared/notification-bell/` component: an `NgbDropdown` on the existing bell icon, lazily fetching a preview (latest 5) via the existing `NotificationService.getMine()` only when opened (`container="body"` so the sidebar's `overflow-y: auto` doesn't clip it), with inline "mark as read" per item and a "View all" link to `/notifications`. Wired into both `nav.html` and `agent-shell.html` (desktop + mobile), replacing the previously duplicated bell markup in each. No new endpoint required. |
| Ticket/response list pagination (`GetAll`/`GetMine`, `GetByTicket`) | **Descoped.** | `TicketsController.GetAll`/`GetMine` already support rich filtering (Tier 1); adding `PagedResult<T>` there would only be safe if `ticket-list.ts`'s client-side title search and `ticket-queue.ts`'s client-side column sort also moved server-side — otherwise search/sort would silently only see one page instead of the full result set, a real UX regression disguised as a scalability improvement. That's a substantially larger, riskier change (new query params, reshaping both components' state, rewriting their specs) than the current data volumes justify. Left as client-side pagination over the full filtered result set; revisit if ticket counts grow large enough for this to matter in practice. |

## Tier 3 — explicitly descoped (with rationale)

- **Real email delivery to an actual inbox** (SendGrid/Azure Communication Services) — descoped for cost on a free/trial subscription. Mailpit (above) proves the forgot/reset-password flow end-to-end without a paid provider; the SMTP config keys are the documented swap-in point.
- **Dark mode / theming** — not requested by either source doc.
- **Notification preferences** — the UX doc marks this explicitly as "Future."
- **Admin dashboard/journey polish beyond current state** — the UX doc marks the admin journey explicitly as a "Future-Proof Outline, not necessarily implemented yet."
- **`ux-design-consideration.txt` truncation note (not a remediation item)** — the source file cuts off mid-sentence at the very end ("...revert control to previous value and show[EOF]"). Epic 4.2's AC independently gives the same revert-on-failure requirement (closed above), so this wasn't blocking — but if the original `.docx` this was converted from is still available, it's worth re-extracting in case later sections were lost in the txt conversion.

## Verification status

- **Backend:** `dotnet test services/TicketService.Tests/TicketService.Tests.csproj` passes (72/72) with the new `GetAgents`/forgot-password/reset-password/filter coverage included.
- **Frontend:** `ng test` (Vitest) passes (127/127) across all new and changed components/services, including the new `relative-time.pipe.spec.ts`, `notification-bell.spec.ts`, and the extended `ticket-detail.spec.ts`/`ticket-queue.spec.ts`/`ticket.service.spec.ts`.
- **Postman collection** (`docs/postman/`) extended with requests for `forgot-password`, `reset-password` (with a note on pulling the reset token from Mailpit), the full `GetAll` filter set, `GET /api/tickets/agents`, and `assign`/unassign with an explicit `agentId`.
- **Not verified in this pass (no browser tooling available in this environment):**
  - Manual walkthrough of forgot-password → Mailpit (`localhost:8025`) → reset link → login.
  - Manual walkthrough of the profile page as each role, agent-queue filters, assign-to-other-agent as Admin and SupportAgent, the notification bell dropdown, and keyboard-only navigation through the sortable table header.
  - Actually running the extended Postman collection against a live stack.

  These remain open follow-ups — the automated test suites above cover logic correctness, but not the actual browser/email/Postman round-trip.

## See also

- `docs/requirement/gap-analysis.md` — the design-doc-vs-implementation analysis this document runs alongside, not against.
- Root `README.md`'s "Scope notes" section.
- `docs/postman/README.md` — how to run the Postman collection against a live stack.
