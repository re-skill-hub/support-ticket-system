# Trial Azure Deployment

This runbook deploys the support-ticket system to one low-cost development AKS environment through Azure DevOps. The `k8s/azure-dev` overlay intentionally uses single-replica SQL Server and RabbitMQ for a self-contained trial. Replace those dependencies with Azure SQL and a managed RabbitMQ-compatible broker before production.

![End-to-end deployment diagram: GitHub triggers an Azure DevOps pipeline that reads secrets from Key Vault, authenticates to AKS as the least-privilege ci-deployer identity, and pushes images through ACR; inside AKS, ingress-nginx and cert-manager terminate TLS in front of the client/services/RabbitMQ architecture, with Container Insights streaming logs and metrics to Log Analytics](architecture-diagram-e2e.svg)

**Cost notes — nothing here is free while running, even on a trial subscription:**
- The client's public `LoadBalancer` (and any static public IP attached to it, including the one provisioned for TLS below) bills hourly for as long as it exists, not just when it's idle "leftover cruft" — delete it with the rest of the resource group when not actively demoing.
- ACR Basic is ~US$5/month flat, not free.
- Key Vault (RBAC-mode, Standard tier) is negligible per-operation cost, but not literally free — a trial workload's few secret reads/month cost fractions of a cent, still worth knowing it's not $0.

## 1. Local prerequisites

Use Azure Cloud Shell or install Azure CLI, kubectl, Helm, Docker, and Git. The commands below use PowerShell syntax. Authenticate and choose the subscription:

```powershell
az login
az account set --subscription "<subscription-id>"
```

Create a budget alert in Cost Management before creating resources. Use one region with available trial quota.

## 2. Azure resources

Set shell variables for the chosen names:

```powershell
$LOCATION = "<azure-region>"
$RESOURCE_GROUP = "rg-support-ticket-dev"
$ACR_NAME = "<globally-unique-acr-name>"
$AKS_NAME = "aks-support-ticket-dev"
```

Create the resource group, registry, and AKS cluster:

```powershell
az group create --name $RESOURCE_GROUP --location $LOCATION --tags application=support-ticketing environment=dev
az acr create --resource-group $RESOURCE_GROUP --name $ACR_NAME --sku Basic --admin-enabled false
az aks create `
  --resource-group $RESOURCE_GROUP `
  --name $AKS_NAME `
  --location $LOCATION `
  --tier free `
  --node-count 1 `
  --node-vm-size Standard_B2s `
  --enable-managed-identity `
  --enable-oidc-issuer `
  --enable-workload-identity `
  --attach-acr $ACR_NAME `
  --generate-ssh-keys
```

Check the selected VM size and region against the subscription quota before running `az aks create`. The trial overlay uses persistent volumes, so account for disk charges as well.

Get credentials and verify the cluster:

```powershell
az aks get-credentials --resource-group $RESOURCE_GROUP --name $AKS_NAME --overwrite-existing
kubectl get nodes
```

## 3. Azure DevOps setup

Create an Azure DevOps organization and a project named `SupportTicketing`. Connect this repository and create an Azure Resource Manager service connection named `sc-support-ticket-dev`.

Use workload identity federation when available. Scope the connection to `$RESOURCE_GROUP`, not the whole subscription.

Grant the service connection identity `AcrPush` on the registry. The AKS kubelet identity separately needs `AcrPull` on the same registry.

Create an environment named `support-ticketing-dev` and authorize the pipeline to use it. Then add an approval check so deployments require a human sign-off: open the environment, **Approvals and checks** → **+** → **Approvals**, and add at least one approver. The CLI has no support for this; it must be done in the portal. Without it, any run that reaches the `DeployDev` stage — including the first run after a merge to `main` — deploys to the shared dev cluster with no checkpoint.

Also register the AKS namespace as a **Kubernetes resource** on the environment (Environments → `support-ticketing-dev` → Resources → Kubernetes, pointing at the `support-ticketing-dev` namespace in the cluster) — this is what makes the portal show live pod/rollout status for `DeployDev` runs, separately from the approval check above.

Pull requests only run the `Validate` stage (build/test) — `BuildAndPush`, `DeployDev`, and `SmokeTest` are skipped for PR-triggered runs (`Build.Reason == 'PullRequest'`), so opening a PR never pushes images or touches the cluster.

Create a variable group named `support-ticketing-dev` with these non-secret values:

| Variable | Description |
| --- | --- |
| `azureServiceConnection` | Azure DevOps service connection name |
| `resourceGroup` | Resource group containing AKS |
| `aksName` | AKS cluster name |
| `acrName` | ACR resource name |
| `acrLoginServer` | The ACR login server, for example, `<acr-name>.azurecr.io` |
| `kubernetesNamespace` | `support-ticketing-dev` |
| `clientEndpoint` | Public client URL, including scheme and port if needed; no trailing slash or path |
| `initialAdminEmail` | Optional. Email for the seeded initial Admin account; leave empty to disable |
| `initialAdminFullName` | Optional. Display name for the seeded initial Admin account |

### Secrets via Azure Key Vault

Do not store the trial secrets as plain Azure DevOps secret variables. Instead, create an Azure Key Vault with RBAC authorization and link it into the pipeline as a second, Key-Vault-backed variable group:

```bash
az keyvault create \
  --name <globally-unique-vault-name> \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --enable-rbac-authorization true
```

Grant the service connection's identity (the managed identity or app registration behind `sc-support-ticket-dev`) the `Key Vault Secrets User` role scoped to the vault, so the pipeline can read secrets at runtime. Grant your own account `Key Vault Secrets Officer` on the vault so you can populate secret values (RBAC-mode vaults grant no implicit access, even to the creator).

Populate the six secrets (Key Vault secret names cannot contain underscores, so use hyphens):

```bash
az keyvault secret set --vault-name <vault-name> --name MSSQL-SA-PASSWORD --value "<value>"
az keyvault secret set --vault-name <vault-name> --name RABBITMQ-USER --value "<value>"
az keyvault secret set --vault-name <vault-name> --name RABBITMQ-PASS --value "<value>"
az keyvault secret set --vault-name <vault-name> --name JWT-SECRET --value "<value>"
az keyvault secret set --vault-name <vault-name> --name K8S-CI-TOKEN --value "<ci-deployer ServiceAccount token>"
az keyvault secret set --vault-name <vault-name> --name INITIAL-ADMIN-PASSWORD --value "<value, or omit to leave the initial Admin seed disabled>"
```

`K8S-CI-TOKEN` is the least-privilege deploy credential the pipeline authenticates as instead of the cluster-admin credential `az aks get-credentials` otherwise hands out — see "Deploy identity" below for how to create it and `docs/ci-cd-pipeline.md` for how the pipeline uses it.

`INITIAL-ADMIN-PASSWORD` seeds the initial Admin account (see `initialAdminEmail`/`initialAdminFullName` in the variable table above). Leaving it and the two non-secret variables unset disables the seed everywhere — unlike the Development-only `LOCAL_AGENT_*` seed used locally, this one would otherwise run in every environment, so an empty value is the only way to opt out on a shared cluster.

Create a second variable group named `support-ticketing-dev-secrets` of type `AzureKeyVault`, linked to the vault via `sc-support-ticket-dev`, listing the six secret names above. The Azure DevOps CLI does not support creating Key-Vault-linked variable groups; use the REST API instead:

```bash
az rest --method post \
  --uri "https://dev.azure.com/<org>/<project>/_apis/distributedtask/variablegroups?api-version=7.1-preview.2" \
  --resource 499b84ac-1321-427f-aa17-267ca6975798 \
  --headers "Content-Type=application/json" \
  --body @variablegroup.json
```

where `variablegroup.json` sets `"type": "AzureKeyVault"` and a `providerData` object with `serviceEndpointId`, `vault`, and a `lastRefreshedOn` timestamp (required by the API on creation), plus a `variables` object listing each secret name with `"isSecret": true`.

Never commit a populated secret manifest or secret values. The pipeline creates the `app-secrets` Kubernetes Secret from the Key-Vault-sourced pipeline variables at deploy time.

### Deploy identity: `ci-deployer`, not cluster-admin

This cluster has no AAD integration, so `az aks get-credentials` hands out a static, cluster-admin-bound client certificate. Rather than let the pipeline deploy with that, apply the least-privilege RBAC bootstrap once, manually, with your own cluster-admin access:

```powershell
kubectl apply -f k8s/azure-dev/ci-deployer-rbac.yaml
$K8S_CI_TOKEN = kubectl -n support-ticketing-dev get secret ci-deployer-token -o jsonpath="{.data.token}" | base64 -d
```

Store that token as the `K8S-CI-TOKEN` Key Vault secret above. Full detail on what this ServiceAccount can and can't do is in `docs/ci-cd-pipeline.md`.

### Container Insights (optional but recommended)

```bash
az provider register --namespace microsoft.insights   # one-time per subscription; async, poll registrationState
az monitor log-analytics workspace create --resource-group $RESOURCE_GROUP --workspace-name <workspace-name>
az aks enable-addons --resource-group $RESOURCE_GROUP --name $AKS_NAME \
  --addons monitoring --workspace-resource-id <workspace-resource-id>
```

## 4. Run the pipeline

Commit and push `azure-pipelines.yaml`. It has four stages — **Validate** (build/test everything, including a `kubectl kustomize` render check of the overlay), **BuildAndPush**, **DeployDev**, **SmokeTest** — with `BuildAndPush`/`DeployDev`/`SmokeTest` skipped on pull-request-triggered runs. Full stage-by-stage detail, the per-service templating, and the deploy identity swap are documented in `docs/ci-cd-pipeline.md`.

Before the first successful pipeline run, `clientEndpoint` must be known because it is used for CORS configuration and the smoke test. This is solved by pre-provisioning a static public IP before the first deploy, rather than waiting to discover whatever ephemeral IP a `LoadBalancer` Service happens to get — see the TLS section below. `clientEndpoint` is then set to that IP's `https://<ip>.nip.io` hostname, no trailing slash.

The client is no longer a public `LoadBalancer` itself — it's `ClusterIP`, fronted by an ingress-nginx controller that holds the one public IP for the whole trial environment. Nginx (inside the client image) still proxies `/api/auth` and `/api/tickets` to TicketService, `/api/responses` to ResponseService, and `/api/metrics` and `/api/notifications` to NotificationService; ingress-nginx just adds TLS termination and routing in front of it.

### TLS: ingress-nginx + cert-manager + nip.io

Rather than serving the trial deployment over plain HTTP, a free `<static-ip>.nip.io` hostname gets a real Let's Encrypt certificate via cert-manager's HTTP-01 challenge (`nip.io` resolves any `<ip>.nip.io` name to `<ip>`, so no DNS zone purchase is needed):

1. Provision a Standard-SKU static public IP in the AKS node resource group (`MC_<resourceGroup>_<aksName>_<location>`), tagged so it's clearly for ingress and not confused with AKS's own managed outbound IP.
2. Install the ingress-nginx controller (`k8s/azure-dev/ingress-nginx/controller.yaml`), with its Service annotated to bind that static IP by resource group + name (`service.beta.kubernetes.io/azure-load-balancer-resource-group`, `service.beta.kubernetes.io/azure-pip-name`).
3. Install cert-manager (`k8s/azure-dev/cert-manager.yaml`) and a `ClusterIssuer` (`k8s/azure-dev/cluster-issuer.yaml`) — start with the Let's Encrypt **staging** CA (untrusted, generous rate limits) to prove out the HTTP-01 flow, then switch to **production** once a certificate issues successfully.
4. `k8s/azure-dev/ingress.yaml` (part of the app kustomize overlay) routes the nip.io hostname to the `client` Service and requests a `tls` certificate via the `cert-manager.io/cluster-issuer` annotation.

ingress-nginx and cert-manager are cluster-scoped, one-time installs — apply them manually with `kubectl apply -f`, not through the per-deploy `kubectl apply -k k8s/azure-dev`. See `k8s/azure-dev/README.md` for the exact command order. Until the issuer is switched to `letsencrypt-prod`, the pipeline's `SmokeTest` stage (a plain `curl --fail`) will reject the staging CA's certificate as untrusted — this is expected during initial setup, not a pipeline bug.

## 5. Verify and clean up

```powershell
kubectl -n support-ticketing-dev get pods,svc,pvc
kubectl -n support-ticketing-dev get events --sort-by=.lastTimestamp
```

Stop AKS outside testing hours where supported. Remove unused images, disks, and public IPs. Delete the resource group when the trial is complete:

```powershell
az group delete --name $RESOURCE_GROUP --yes --no-wait
```

This overlay is a learning environment, not a highly available production deployment. Production must move SQL Server and RabbitMQ out of the cluster, use external secret delivery, and add durable ingress, backups, and multiple nodes.
