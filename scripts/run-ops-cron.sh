#!/usr/bin/env bash
# scripts/run-ops-cron.sh   cron: every 30-60 min, on the agent box only
# Environment comes from a 0600 file on the agent box holding only agent-zone secrets.
set -euo pipefail
: "${HUB_DIR:?}" "${PRODUCTS_DIR:?}" "${STATE_DIR:?}"
exec 9>"$STATE_DIR/ops.lock"; flock -n 9 || exit 0   # no overlapping runs
[ ! -e "$STATE_DIR/PAUSED" ] || exit 0               # kill-switch flag
# Dead-man's switch: no owner review in 7 days, or never, means do nothing.
[ -f "$STATE_DIR/HEARTBEAT" ] && [ $(( $(date +%s) - $(stat -c %Y "$STATE_DIR/HEARTBEAT") )) -lt 604800 ] || exit 0
if [ -n "$(find "$HUB_DIR" "$PRODUCTS_DIR" -name '.env*' -not -path '*/node_modules/*' -print -quit)" ]; then
  echo 'refusing to run: .env file found' >&2; exit 1
fi
git -C "$HUB_DIR" fetch -q origin main
registry=$(git -C "$HUB_DIR" show origin/main:portfolio/registry.json)
slugs=$(jq -r '.products[] | select(.status=="live" or .status=="staging") | .slug' <<<"$registry")
for slug in $slugs; do
  dir="$PRODUCTS_DIR/$slug"; [ -d "$dir/.git" ] || continue
  "$HUB_DIR/scripts/require-status.sh" "$slug" live,staging || continue
  n=$(curl -fsS --max-time 20 -H "Authorization: Bearer $SUPPORT_CHECK_KEY" "$OPS_CHECK_URL/$slug" \
    | jq '(.open_count // 0) + (.error_spikes // 0)' || echo 0)
  [ "${n:-0}" -gt 0 ] || continue                    # idle: zero model cost
  git -C "$dir" fetch -q origin main
  git -C "$dir" checkout -q -f --detach origin/main
  git -C "$dir" clean -fdq -e state -e queue
  mkdir -p "$dir/patches" "$dir/queue" "$dir/state"
  # The MCP servers take the product and its reply-link allowlist from here, read from
  # origin/main, so the model cannot pick another product or widen the allowlist.
  export PRODUCT_SLUG="$slug"
  PRODUCT_DOMAINS=$(jq -r --arg s "$slug" '.products[] | select(.slug==$s) | (.domains // []) | join(",")' <<<"$registry")
  export PRODUCT_DOMAINS
  # Flag notes, each confirmed by a headless test run (see docs/SETUP.md):
  #   --restricted   ignores user/project settings and removes code-running tools
  #   --tools        the only built-in tools that exist in the session
  #   --allowedTools file-write rules are spelled Edit(...); Write(...) path rules do not match
  #   plugin MCP tools are named mcp__plugin_<plugin>_<server>__<tool>
  (cd "$dir" && timeout 900 claude -p "Run /saas-factory:run-support for product $slug." \
    --restricted \
    --tools "Read,Write,Glob,Grep,Skill,Task" \
    --plugin-dir "$HUB_DIR/plugins/saas-factory" \
    --settings "$HUB_DIR/agent-box/settings.json" \
    --allowedTools "Read,Glob,Grep,Edit(./patches/**),Edit(./state/**),mcp__plugin_saas-factory_support-ops__*" \
    --disallowedTools "Bash,WebFetch" \
    --max-turns 30 \
    --max-budget-usd "${RUN_BUDGET_USD:-2}" < /dev/null) || echo "claude run failed: $slug" >&2
  "$HUB_DIR/scripts/apply-patches.sh" "$dir" || echo "apply failed: $slug" >&2
done
