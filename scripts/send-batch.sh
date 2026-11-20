#!/usr/bin/env bash
# usage: send-batch.sh <batch.json>   (never run by cron or an agent)
# Human zone only: runs on the owner's laptop, interactively, with credentials loaded by hand.
set -euo pipefail
: "${HUB_DIR:?}" "${HUMAN_STATE:?}"
batch="$1"; approval="${batch%.json}.approved.json"
[ -t 0 ] || { echo 'run interactively' >&2; exit 1; }
[ -f "$approval" ] || { echo 'batch not approved' >&2; exit 1; }
[ "$(jq -r .sha256 "$approval")" = "$(sha256sum "$batch" | cut -d' ' -f1)" ] \
  || { echo 'batch changed after approval' >&2; exit 1; }
# Fail closed: a missing suppression list must stop the send, not skip the check.
[ -f "$HUMAN_STATE/suppression.txt" ] || { echo 'suppression list missing' >&2; exit 1; }

send_one() {
  # Implement for your sender: one-click unsubscribe, physical address, accurate headers.
  echo 'send_one is not implemented; nothing was sent' >&2
  exit 1
}

slug=$(jq -r .product "$batch")
"$HUB_DIR/scripts/require-status.sh" "$slug" live
cap=$(git -C "$HUB_DIR" show origin/main:portfolio/registry.json \
  | jq -r --arg s "$slug" '.products[] | select(.slug==$s) | .caps.outbound_per_day')
[[ "$cap" =~ ^[0-9]+$ ]] || { echo "no numeric outbound_per_day cap for $slug" >&2; exit 1; }
log="$HUMAN_STATE/$slug/sent-$(date -u +%F).log"; mkdir -p "$(dirname "$log")"; touch "$log"
sent=$(wc -l < "$log")
read -r -p "Send up to $((cap - sent)) today? Type SEND: " ans; [ "$ans" = SEND ] || exit 1
: "${SEND_API_KEY:?load it from your password manager}"
jq -c '.recipients[] | select(.approved==true)' "$batch" | while read -r r; do
  email=$(jq -r .email <<<"$r")
  grep -qiFx "$email" "$HUMAN_STATE/suppression.txt" && continue
  [ "$sent" -lt "$cap" ] || break
  send_one "$r"
  echo "$email" >> "$log"; sent=$((sent + 1))
done
