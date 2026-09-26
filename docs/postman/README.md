# Postman collection

Covers Auth, Tickets, Responses, Notifications and Metrics across the three services.

1. Import `support-ticketing.postman_collection.json` and `support-ticketing.postman_environment.json` into Postman.
2. Select the **Support Ticketing - Local (Docker Compose)** environment.
3. Start the stack (`docker compose up --build -d`) so the APIs are reachable on ports 5101/5102/5103.
4. Run **Auth → Register (Customer)** (or **Login**) to set the httpOnly auth cookie, then **Tickets → Create Ticket** — it sets `{{ticketId}}` automatically for the requests that follow.
5. Run **Auth → Login (Support Agent)** with an administrator-provisioned support account before calling the agent-only requests (`Get All Tickets`, `Update Ticket Status`, `Assign Ticket To Self`, `Metrics`).

Auth is cookie-based, not bearer-token-based — Postman's cookie jar handles it automatically as long as requests run through the same Postman session.
