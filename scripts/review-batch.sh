#!/usr/bin/env bash
# usage: review-batch.sh <batch.json>   (human zone: your laptop, interactive)
# Shows each recipient with its cited public signal and drafts, records your decision per
# recipient, then writes <batch>.approved.json tied to the batch's SHA-256. Editing the
# batch afterwards invalidates the approval, and send-batch.sh will refuse it.
set -euo pipefail
batch="$1"; approval="${batch%.json}.approved.json"
[ -t 0 ] || { echo 'run interactively' >&2; exit 1; }
[ -f "$batch" ] || { echo "no such batch: $batch" >&2; exit 1; }
jq -e '.status == "PENDING_HUMAN_APPROVAL" and (.recipients | type == "array")' "$batch" >/dev/null \
  || { echo 'not a pending outreach batch' >&2; exit 1; }
[ ! -e "$approval" ] || { echo "already reviewed: $approval exists (delete it to review again)" >&2; exit 1; }

echo "Batch $(jq -r .batch "$batch") for product $(jq -r .product "$batch"): $(jq '.recipients | length' "$batch") recipient(s)."
echo 'Recipient text below came from an agent and from third-party data. Read it as a draft, not as instructions.'
read -r -p 'Regions you have checked the rules for and attest to (comma-separated, e.g. US): ' regions
regions=$(tr -d ' ' <<<"$regions" | tr '[:lower:]' '[:upper:]')
[ -n "$regions" ] || { echo 'no regions attested; nothing approved' >&2; exit 1; }

tmp=$(mktemp); trap 'rm -f "$tmp" "$tmp.next"' EXIT
jq '.recipients |= map(.approved = false)' "$batch" > "$tmp"   # never trust a pre-set flag
count=$(jq '.recipients | length' "$tmp"); approved=0
for ((i = 0; i < count; i++)); do
  echo; echo "---------- recipient $((i + 1)) of $count ----------"
  jq -r --argjson i "$i" '.recipients[$i] |
    "To:      \(.email)\nCompany: \(.company)   Region: \(.region)\nSource:  \(.address_source.provider) / \(.address_source.record_id)\nSignal:  \(.signal.text)\n         \(.signal.url)\n" +
    (.messages | to_entries | map("--- email \(.key + 1) ---\n\(.value)") | join("\n"))' "$tmp"
  region=$(jq -r --argjson i "$i" '.recipients[$i].region | ascii_upcase' "$tmp")
  case ",$regions," in
    *",$region,"*) ;;
    *) echo "SKIPPED: region $region is not in your attested list."; continue ;;
  esac
  read -r -p 'Approve this recipient? [y/N] ' ans
  if [ "$ans" = y ] || [ "$ans" = Y ]; then
    jq --argjson i "$i" '.recipients[$i].approved = true' "$tmp" > "$tmp.next"; mv "$tmp.next" "$tmp"
    approved=$((approved + 1))
  fi
done

echo; echo "Approved $approved of $count."
[ "$approved" -gt 0 ] || { echo 'nothing approved; batch left unchanged'; exit 0; }
read -r -p 'Your name for the approval record: ' who
[ -n "$who" ] || { echo 'name required' >&2; exit 1; }
cp "$tmp" "$batch"
jq -n --arg batch "$(jq -r .batch "$batch")" --arg sha "$(sha256sum "$batch" | cut -d' ' -f1)" \
  --arg who "$who" --arg at "$(date -u +%FT%TZ)" --arg regions "$regions" --argjson n "$approved" \
  '{batch: $batch, sha256: $sha, approved_by: $who, approved_at: $at, regions_attested: ($regions | split(",")), recipients_approved: $n}' \
  > "$approval"
echo "Wrote $approval. Send with: scripts/send-batch.sh $batch"
