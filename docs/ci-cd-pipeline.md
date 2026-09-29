# CI/CD pipeline architecture

What `azure-pipelines.yaml` actually does and how the deploy identity is scoped. This is the reference for the pipeline's internals; `docs/azure-deployment.md` is the runbook for standing up the Azure resources it runs against. See `architecture-diagram-e2e.svg` for how this pipeline fits into the full end-to-end deployment.

## Stages

1. **Validate** (always runs, including on PRs) — restores/builds/tests the .NET solution, installs/tests/builds the Angular client, then runs `kubectl kustomize k8s/azure-dev > /dev/null` to catch overlay errors (missing files, bad kustomization references, YAML syntax) before any image is built or pushed. NuGet and npm package caches (`Cache@2`) are keyed on `**/*.csproj` and `client/package-lock.json` respectively, so restores are fast on unchanged dependency sets.
2. **BuildAndPush** (skipped on PRs — `condition: ne(variables['Build.Reason'], 'PullRequest')`) — logs in to ACR, then for each entry in the `services` pipeline parameter (`ticket-service`, `response-service`, `notification-service`, `client`) builds and pushes `<acr>/<name>:<commit-sha>`. The `k8s/azure-dev` overlay is published as a pipeline artifact for the next stage.
3. **DeployDev** (skipped on PRs) — an Azure DevOps `deployment` job bound to the `support-ticketing-dev` environment, so it honors that environment's manual-approval check (see `docs/azure-deployment.md`). Builds the `app-secrets` Kubernetes Secret from the six Key-Vault-sourced pipeline variables, then substitutes `__CLIENT_ENDPOINT__`, `__INITIAL_ADMIN_EMAIL__`, and `__INITIAL_ADMIN_FULL_NAME__` in the overlay's `kustomization.yaml` via `sed` before applying it. Deploys, then for each service in `parameters.services`, sets its image and waits for `rollout status`. A failure-diagnostics step (pods, events, `describe pods`) runs unconditionally on `failed()`.
4. **SmokeTest** (skipped on PRs) — `curl --fail --retry 5` against `clientEndpoint`.

Each stage/job has an explicit `timeoutInMinutes` (15/15/10/5) so a hung step (e.g. a stuck `rollout status`) fails fast instead of running to the org-wide default timeout.

## Per-service templating

Every stage that repeats work per service (`BuildAndPush`'s build/push, `DeployDev`'s set-image/rollout) drives off the `services` pipeline parameter (`azure-pipelines.yaml` top) via `${{ each svc in parameters.services }}`, instead of hardcoding four near-identical steps. Adding a fifth service means adding one entry to `parameters.services` — no step duplication.

## Deploy identity: least-privilege `ci-deployer`, not cluster-admin

This AKS cluster has no AAD integration, so the credential `az aks get-credentials` hands out is a static, cluster-admin-bound client certificate — anyone who can read the pipeline's Azure service connection could otherwise touch every namespace in the cluster.

`k8s/azure-dev/ci-deployer-rbac.yaml` defines a namespace-scoped `ci-deployer` ServiceAccount whose token is what the pipeline actually authenticates as for every `kubectl` call:

- A `Role`/`RoleBinding` in `support-ticketing-dev` grants only what a deploy needs: get/list/watch/create/update/patch on `deployments`, `replicasets`, `services`, `configmaps`, `secrets`, `persistentvolumeclaims`, `ingresses`; read-only (get/list/watch) on `pods`/`pods/log`/`events` for the diagnostics step.
- A `ClusterRole`/`ClusterRoleBinding` grants get/patch on exactly one `Namespace` object, restricted by `resourceNames: ["support-ticketing-dev"]` — enough for `kubectl apply -f namespace.yaml` to succeed, not enough to create, list, or delete any other namespace.

`ci-deployer-rbac.yaml` is **not** part of the `k8s/azure-dev` kustomize overlay and is never applied by the pipeline — the pipeline's own reduced-privilege token has no permission to manage RBAC objects (`rbac.authorization.k8s.io` isn't in its `Role`), so this file is a one-time, admin-run bootstrap step (see "Manual bootstrap steps" below), the same category as `ingress-nginx`/`cert-manager`.

The pipeline's `DeployDev` stage and its failure-diagnostics step both swap to this identity right after `az aks get-credentials`:

```bash
az aks get-credentials --resource-group "$(resourceGroup)" --name "$(aksName)" --overwrite-existing
kubectl config set-credentials ci-deployer --token="$K8S_CI_TOKEN"
kubectl config set-context --current --user=ci-deployer --namespace="$(kubernetesNamespace)"
```

`K8S_CI_TOKEN` is one of six Key-Vault-backed secrets (`K8S-CI-TOKEN`), read from the ServiceAccount token Secret (`kubectl -n support-ticketing-dev get secret ci-deployer-token`) and stored the same way as the other five app secrets — see `docs/azure-deployment.md`.

## Manual bootstrap steps (one-time, run by a human with cluster-admin, not by the pipeline)

These are applied directly against the cluster, outside `kubectl apply -k k8s/azure-dev`, because the pipeline's own `ci-deployer` identity has no permission to create them (RBAC objects) or they're cluster-scoped infrastructure rather than a namespaced app resource:

1. `kubectl apply -f k8s/azure-dev/ci-deployer-rbac.yaml` — creates the deploy identity itself; must exist before the pipeline's first `DeployDev` run.
2. `kubectl apply -f k8s/azure-dev/ingress-nginx/controller.yaml` and `k8s/azure-dev/cert-manager.yaml` — see `k8s/azure-dev/README.md`.
3. `kubectl apply -f k8s/azure-dev/cluster-issuer.yaml` — cluster-scoped `ClusterIssuer`.

## Azure DevOps Environment: registered Kubernetes resource

The `support-ticketing-dev` Environment has the AKS namespace registered as a **Kubernetes resource** (Environments → `support-ticketing-dev` → Resources → Kubernetes), pointing at `support-ticketing-dev` in `aks-support-ticket-dev-01`. This is separate from the environment's approval check — it's what lets the portal show live pod/rollout status for `DeployDev` runs against that specific namespace, rather than the environment being just an approval gate with no resource attached. Registered via the REST API (`POST .../distributedtask/environments/{id}/providers/kubernetes`) since the CLI has no dedicated command for it.

## Monitoring: AKS Container Insights

The cluster has the `monitoring` add-on enabled, sending container/node metrics and logs to a Log Analytics workspace in the same resource group:

```bash
az provider register --namespace microsoft.insights   # one-time per subscription
az monitor log-analytics workspace create --resource-group <resourceGroup> --workspace-name <workspace-name>
az aks enable-addons --resource-group <resourceGroup> --name <aksName> \
  --addons monitoring --workspace-resource-id <workspace-resource-id>
```

`az provider register` is asynchronous — poll `az provider show --namespace microsoft.insights --query registrationState` until `Registered` before retrying the addon-enable call if it fails with `MissingSubscriptionRegistration`. On Windows Git Bash, prefix commands that take a `/subscriptions/...`-style argument with `MSYS_NO_PATHCONV=1`, since MSYS2 otherwise mangles the leading-slash argument into a Windows path.

Verify with `kubectl -n kube-system get pods -l component=oms-agent` and the workspace's Container Insights blade in the Azure portal.
