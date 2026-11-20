#!/usr/bin/env bash
# scripts/run-expansion-cron.sh   cron: weekly, on the agent box only
# Gives expand-business a read-only copy of the registry, learnings and the last 4 metrics
# snapshots, and lets it write one proposal under queue/. It holds no payment or analytics key.
set -euo pipefail
: "${HUB_DIR:?}" "${STATE_DIR:?}"
exec 9>"$STATE_DIR/expansion.lock"; flock -n 9 || exit 0
[ ! -e "$STATE_DIR/PAUSED" ] || exit 0
[ -f "$STATE_DIR/HEARTBEAT" ] && [ $(( $(date +%s) - $(stat -c %Y "$STATE_DIR/HEARTBEAT") )) -lt 604800 ] || exit 0
if [ -n "$(find "$HUB_DIR" -name '.env*' -not -path '*/node_modules/*' -print -quit)" ]; then
  echo 'refusing to run: .env file found' >&2; exit 1
fi
git -C "$HUB_DIR" fetch -q origin main
git -C "$HUB_DIR" fetch -q origin snapshots || { echo 'no snapshots branch yet; nothing to do' >&2; exit 0; }

work="$STATE_DIR/expansion"
rm -rf "$work/portfolio" "$work/snapshots"
mkdir -p "$work/portfolio" "$work/snapshots" "$work/queue/proposals"
git -C "$HUB_DIR" show origin/main:portfolio/registry.json > "$work/portfolio/registry.json"
git -C "$HUB_DIR" show origin/main:portfolio/learnings.md > "$work/portfolio/learnings.md"
files=$(git -C "$HUB_DIR" ls-tree --name-only origin/snapshots \
  | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.json$' | sort | tail -n 4 || true)
[ -n "$files" ] || { echo 'no snapshot files yet; nothing to do' >&2; exit 0; }
for f in $files; do git -C "$HUB_DIR" show "origin/snapshots:$f" > "$work/snapshots/$f"; done

(cd "$work" && timeout 900 claude -p "Run /saas-factory:expand-business." \
  --restricted \
  --tools "Read,Write,Glob,Grep,Skill" \
  --plugin-dir "$HUB_DIR/plugins/saas-factory" \
  --settings "$HUB_DIR/agent-box/settings.json" \
  --allowedTools "Read,Glob,Grep,Edit(./queue/**)" \
  --disallowedTools "Bash,WebFetch" \
  --max-turns 20 \
  --max-budget-usd "${RUN_BUDGET_USD:-2}" < /dev/null) || echo 'claude run failed: expansion' >&2
echo "proposal, if any, is under $work/queue/proposals/"
