#!/usr/bin/env bash
# scripts/kill-switch.sh   run from your laptop
# Adjust the paths and the cron service name (cron on Debian, crond on RHEL-family) to your box.
set -euo pipefail
: "${AGENT_HOST:?}"
ssh "$AGENT_HOST" 'touch /var/lib/factory/PAUSED && sudo systemctl stop cron && sudo shred -u /etc/factory/agent.env'
echo 'Agent box paused; its env file is destroyed.'
cat <<'EOF'
Now, by hand:
 1. GitHub: suspend or uninstall the agent App.
 2. Revoke the trend, SEO, analytics-read, support-draft, monitoring-read and lead-search keys.
 3. Disable the API key the agent box uses for Claude.
 4. Sender: set the hard daily cap to 0 at the provider.
 5. Email provider: pause every live drip.
EOF
