# Trial Azure Deployment

This runbook deploys the support-ticket system to one low-cost development AKS environment through Azure DevOps. The `k8s/azure-dev` overlay intentionally uses single-replica SQL Server and RabbitMQ for a self-contained trial. Replace those dependencies with Azure SQL and a managed RabbitMQ-compatible broker before production.

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

Create an environment named `support-ticketing-dev` and authorize the pipeline to use it.

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

Populate the four secrets (Key Vault secret names cannot contain underscores, so use hyphens):

```bash
az keyvault secret set --vault-name <vault-name> --name MSSQL-SA-PASSWORD --value "<value>"
az keyvault secret set --vault-name <vault-name> --name RABBITMQ-USER --value "<value>"
az keyvault secret set --vault-name <vault-name> --name RABBITMQ-PASS --value "<value>"
az keyvault secret set --vault-name <vault-name> --name JWT-SECRET --value "<value>"
```

Create a second variable group named `support-ticketing-dev-secrets` of type `AzureKeyVault`, linked to the vault via `sc-support-ticket-dev`, listing the four secret names above. The Azure DevOps CLI does not support creating Key-Vault-linked variable groups; use the REST API instead:

```bash
az rest --method post \
  --uri "https://dev.azure.com/<org>/<project>/_apis/distributedtask/variablegroups?api-version=7.1-preview.2" \
  --resource 499b84ac-1321-427f-aa17-267ca6975798 \
  --headers "Content-Type=application/json" \
  --body @variablegroup.json
```

where `variablegroup.json` sets `"type": "AzureKeyVault"` and a `providerData` object with `serviceEndpointId`, `vault`, and a `lastRefreshedOn` timestamp (required by the API on creation), plus a `variables` object listing each secret name with `"isSecret": true`.

Never commit a populated secret manifest or secret values. The pipeline creates the `app-secrets` Kubernetes Secret from the Key-Vault-sourced pipeline variables at deploy time.

## 4. Run the pipeline

Commit and push `azure-pipelines.yaml`. The pipeline will:

1. Build and test the .NET solution.
2. Test and build the Angular client.
3. Build and push four images to ACR using the commit SHA.
4. Create the development namespace and Kubernetes Secret.
5. Apply the trial overlay.
6. Set the image tags and exact CORS origin.
7. Wait for all four Deployments to roll out.
8. Smoke-test the client endpoint.

Before the first successful pipeline run, `clientEndpoint` must be known because it is used for CORS configuration and the smoke test. Provision a static public IP or DNS name for the client LoadBalancer first, or update the pipeline to separate the initial deployment from the smoke test. Then set `clientEndpoint` to the final URL without a trailing slash, such as `http://20.10.30.40`.

The client is the only public LoadBalancer. Nginx proxies `/api/auth` and `/api/tickets` to TicketService, `/api/responses` to ResponseService, and `/api/metrics` and `/api/notifications` to NotificationService.

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
