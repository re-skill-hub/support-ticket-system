# Trial AKS overlay

This overlay is for a low-cost development deployment only. It reuses the local SQL Server and RabbitMQ manifests so the environment is self-contained; use Azure SQL and a managed RabbitMQ-compatible broker before production.

The Azure DevOps pipeline creates `app-secrets` at deployment time from protected variables. No secret manifest belongs in source control.

The client nginx container proxies same-origin API paths to the internal services:

- `/api/tickets` -> `ticket-service`
- `/api/responses` -> `response-service`
- `/api/notifications` -> `notification-service`

The three API Services are `ClusterIP`. The client remains the only public LoadBalancer in this trial overlay.
