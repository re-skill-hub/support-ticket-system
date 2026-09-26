# Trial AKS overlay

This overlay is for a low-cost development deployment only. It reuses the local SQL Server and RabbitMQ manifests so the environment is self-contained; use Azure SQL and a managed RabbitMQ-compatible broker before production.

The Azure DevOps pipeline creates `app-secrets` at deployment time from protected variables. No secret manifest belongs in source control.

The client nginx container proxies same-origin API paths to the internal services:

- `/api/tickets` -> `ticket-service`
- `/api/responses` -> `response-service`
- `/api/notifications` -> `notification-service`

The three API Services are `ClusterIP`. The client is also `ClusterIP` — the only public entry point is the ingress-nginx controller's `LoadBalancer` Service, bound to a pre-provisioned static IP (`pip-support-ticket-ingress` in the AKS node resource group) so the hostname is known before the first deploy.

## TLS (ingress-nginx + cert-manager + nip.io)

`ingress-nginx/controller.yaml` and `cert-manager.yaml` are one-time, cluster-scoped installs — apply them manually with `kubectl apply -f`, not through this kustomize overlay (they're cluster infrastructure, not part of a per-namespace app deploy). `cluster-issuer.yaml` is also applied manually, once, after cert-manager's webhook is `Ready` — it's cluster-scoped so kustomize's namespace transformer would otherwise mis-tag it.

`ingress.yaml` *is* part of this overlay (namespaced, app-specific, safe to reapply every deploy) and routes `<static-ip>.nip.io` to the `client` Service with a cert-manager-issued certificate.

Order of operations:
1. Static public IP already created (`pip-support-ticket-ingress`).
2. `kubectl apply -f k8s/azure-dev/ingress-nginx/controller.yaml` — wait for the controller's Service to report the static IP as its external IP.
3. `kubectl apply -f k8s/azure-dev/cert-manager.yaml` — wait for all pods in the `cert-manager` namespace to be `Running`/`Ready` (the webhook needs a few seconds after that before it accepts custom resources).
4. Fill in a real email in `k8s/azure-dev/cluster-issuer.yaml`, then `kubectl apply -f k8s/azure-dev/cluster-issuer.yaml`.
5. Deploy the app overlay as usual (`kubectl apply -k k8s/azure-dev`) — this now includes `ingress.yaml`.
6. `kubectl -n support-ticketing-dev get certificate` until `client-tls` is `Ready`. It starts on `letsencrypt-staging` (untrusted test CA, generous rate limits) — once issuance succeeds, switch the `cert-manager.io/cluster-issuer` annotation in `ingress.yaml` to `letsencrypt-prod` and reapply, so the pipeline's `SmokeTest` stage (a plain `curl --fail`, which rejects the untrusted staging CA) actually passes.
