#!/usr/bin/env bash
# scripts/require-status.sh <slug> <comma-separated allowed statuses>
# Reads origin/main, not the working tree, so only a merged, human-approved PR can change the answer.
set -euo pipefail
: "${HUB_DIR:?}"
slug="$1"; allowed=",$2,"
git -C "$HUB_DIR" fetch --quiet origin main
status=$(git -C "$HUB_DIR" show origin/main:portfolio/registry.json \
  | jq -r --arg s "$slug" '.products[] | select(.slug==$s) | .status // empty')
[ -n "$status" ] || { echo "unknown product: $slug" >&2; exit 2; }
case "$allowed" in *",$status,"*) ;; *) echo "$slug is '$status'; need one of: $2" >&2; exit 1;; esac
