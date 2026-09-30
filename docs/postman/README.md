# Postman collection

Covers Auth, Tickets, Responses, Notifications and Metrics across the three services.

1. Import `support-ticketing.postman_collection.json` and `support-ticketing.postman_environment.json` into Postman.
2. Select the **Support Ticketing - Local (Docker Compose)** environment.
3. Start the stack (`docker compose up --build -d`) so the APIs are reachable on ports 5101/5102/5103.
4. Run **Auth → Register (Customer)** (or **Login**) to set the httpOnly auth cookie, then **Tickets → Create Ticket** — it sets `{{ticketId}}` automatically for the requests that follow.
5. Run **Auth → Login (Support Agent)** with an administrator-provisioned support account before calling the agent-only requests (`Get All Tickets`, `Update Ticket Status`, assignment requests, `Metrics`).

Auth is cookie-based, not bearer-token-based — Postman's cookie jar handles it automatically as long as requests run through the same Postman session.

## Forgot / reset password

**Forgot Password** always returns 200. If the email matches an account, the reset link is sent through **Mailpit** (local dev SMTP catcher) instead of a real inbox — open http://localhost:8025, find the message, and copy the `token` query param out of the reset link into the `resetToken` environment variable before running **Reset Password**.

## Assignment requests

Run **Get Support Staff (for assignment)** first — it sets `{{agentId}}` to the first SupportAgent/Admin returned, so **Assign Ticket To Agent** works without manual edits. **Unassign Ticket** sends an explicit `agentId: null` to clear an assignment.
