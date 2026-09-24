#!/usr/bin/env bash
# Makes the four locally-built :local images visible inside Docker Desktop's
# Kubernetes cluster when it's provisioned with kind.
#
# Why this is needed: kind runs each node as its own container with its own
# containerd image store, isolated from the host's. `imagePullPolicy: Never`
# only finds an image if it's already present in that node's store, so every
# `docker build -t x:local` has to be pushed into each node manually — there
# is no `kind` CLI bundled with Docker Desktop to do this via
# `kind load docker-image`, so this script replicates what that command does
# by hand: `docker save` piped into the node container, then `ctr images
# import` inside it.
#
# Not needed on kubeadm (Docker Desktop's other provisioner) — kubeadm's
# single node shares the host's image store directly, so a built image is
# already visible. This script detects that case and skips it automatically.
set -euo pipefail
export MSYS_NO_PATHCONV=1

IMAGES=(
  "ticket-service:local"
  "response-service:local"
  "notification-service:local"
  "client:local"
)

NODES=$(kubectl get nodes -o jsonpath='{.items[*].metadata.name}')
if [ -z "$NODES" ]; then
  echo "No Kubernetes nodes found — is the cluster running?" >&2
  exit 1
fi

for image in "${IMAGES[@]}"; do
  echo "== $image =="
  tar_name="$(echo "$image" | tr '/:' '__').tar"

  for node in $NODES; do
    if ! docker inspect "$node" >/dev/null 2>&1; then
      echo "  -> $node is not a Docker container (kubeadm) — image already shared, skipping"
      continue
    fi

    echo "  -> $node"
    docker save "$image" | docker exec -i "$node" sh -c "cat > /tmp/$tar_name"
    docker exec "$node" ctr -n k8s.io images import "/tmp/$tar_name"
    docker exec "$node" rm "/tmp/$tar_name"
  done
done

echo "Done. All images are now visible on every node."
