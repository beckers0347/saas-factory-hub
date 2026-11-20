#!/usr/bin/env bash
# usage: apply-patches.sh <product-checkout>
# Non-LLM. Turns agent-written patches/ticket-<id>.diff files into fix/ticket-<id> branches.
set -euo pipefail
cd "$1"
git fetch --quiet origin main
mkdir -p state/processed
for diff in patches/ticket-*.diff; do
  [ -e "$diff" ] || continue
  id=$(basename "$diff" .diff); id=${id#ticket-}
  [[ "$id" =~ ^[A-Za-z0-9_-]{1,40}$ ]] || { echo "rejected: bad id $id"; continue; }
  if compgen -G "state/processed/$id.*" >/dev/null; then echo "skipped: ticket $id already handled"; continue; fi
  # -f discards anything a previous failed run or the agent left in the tree.
  git checkout -q -f --detach origin/main
  if git ls-remote --exit-code --heads origin "fix/ticket-$id" >/dev/null 2>&1; then
    echo "skipped: branch for ticket $id already exists"; touch "state/processed/$id.exists"; continue
  fi
  numstat=$(git apply --numstat "$diff" 2>/dev/null) || { echo "rejected: unparsable $id"; touch "state/processed/$id.rejected"; continue; }
  if grep -qE '^-[[:space:]]' <<<"$numstat"; then echo "rejected: binary $id"; touch "state/processed/$id.rejected"; continue; fi
  # Defence in depth: bug fixes have no need for renames, copies, mode changes or symlinks.
  if grep -qE '^(rename (from|to) |copy (from|to) |old mode |new mode |(new|deleted) file mode 120000)' "$diff"; then
    echo "rejected: rename, mode change or symlink $id"; touch "state/processed/$id.rejected"; continue
  fi
  files=$(cut -f3 <<<"$numstat")
  lines=$(awk '{s+=$1+$2} END {print s+0}' <<<"$numstat")
  [ "$(wc -l <<<"$files")" -le 5 ] && [ "$lines" -le 200 ] || { echo "rejected: too big $id"; touch "state/processed/$id.rejected"; continue; }
  # Blocked at any depth, not only the repo root.
  if grep -qE '(^|/)(\.github/|\.claude/|scripts/|supabase/migrations/|\.env|package(-lock)?\.json|next\.config|vercel\.json)' <<<"$files"; then
    echo "rejected: blocked path $id"; touch "state/processed/$id.rejected"; continue
  fi
  grep -qE '^(tests?/|.*\.test\.)' <<<"$files" || { echo "rejected: no test $id"; touch "state/processed/$id.rejected"; continue; }
  git apply --check --index "$diff" 2>/dev/null || { echo "rejected: does not apply $id"; touch "state/processed/$id.rejected"; continue; }
  git checkout -q -B "fix/ticket-$id"
  # --index stages exactly what the diff changes and nothing else. (The blueprint's
  # `git add -A -- . ':!patches' ...` aborts the batch when those directories are git-ignored.)
  git apply --index "$diff"
  summary=$(head -c 2000 "patches/ticket-$id.md" 2>/dev/null || true)
  git -c user.name=factory-bot -c user.email=bot@users.noreply.github.com \
    commit -q -m "Agent fix for ticket $id" -m "$summary"
  git push -q origin "fix/ticket-$id"
  touch "state/processed/$id.applied"
  git checkout -q --detach origin/main
  git branch -q -D "fix/ticket-$id"
done
git checkout -q -f --detach origin/main
git reset -q --hard origin/main
git clean -fdq -e state -e queue
