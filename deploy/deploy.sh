#!/usr/bin/env bash
# Switch the running HugoFlow container to an image built by CI. Runs on the server,
# from the deploy checkout (the directory holding compose.yml and .env).
#
#   deploy/deploy.sh                # latest build of main
#   deploy/deploy.sh sha-1a2b3c4    # a specific build, e.g. to roll back
#   deploy/deploy.sh previous       # whatever was running before the last deploy
#
# It is also the forced command for the CI deploy key, in which case the tag arrives in
# $SSH_ORIGINAL_COMMAND. Nothing is built here: the server only pulls and restarts.
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")/.."

IMAGE=ghcr.io/arashthr/hugo-flow
TAG="${1:-${SSH_ORIGINAL_COMMAND:-latest}}"
if [[ ! "$TAG" =~ ^(latest|previous|sha-[0-9a-f]{7,40})$ ]]; then
  echo "Refusing to deploy unknown tag: $TAG" >&2
  exit 2
fi

# Keep compose.yml and this script in step with the code being deployed.
if [[ -d .git ]]; then
  git pull --ff-only --quiet origin main
fi

# Remember the running image so a failed deploy can switch straight back to it.
current=$(docker inspect --format '{{.Image}}' hugo-ui 2>/dev/null || true)
if [[ -n "$current" && "$TAG" != previous ]]; then
  docker tag "$current" "$IMAGE:previous"
fi

export TAG
if [[ "$TAG" != previous ]]; then
  docker compose pull --quiet hugo-ui
fi

echo "Starting $IMAGE:$TAG"
if docker compose up --detach --no-build --wait --wait-timeout 120 hugo-ui; then
  echo "Deployed $IMAGE:$TAG"
  docker image prune --force >/dev/null # removes only untagged leftovers
  exit 0
fi

echo "$IMAGE:$TAG did not become healthy" >&2
if [[ -n "$current" && "$TAG" != previous ]]; then
  echo "Rolling back to the previous image" >&2
  TAG=previous docker compose up --detach --no-build hugo-ui
fi
exit 1
