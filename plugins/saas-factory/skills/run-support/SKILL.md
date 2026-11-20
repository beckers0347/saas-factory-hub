---
name: run-support
description: Runs unattended support triage for one product through support-sentinel. Proposes fixes as patch files only.
---
1. Read state/ops-log.md and docs/runbooks/.
2. Delegate triage and anomaly checks for this product to support-sentinel.
3. Do not run builds, tests, git or deployments. apply-patches.sh and CI do that.
4. Write state/digest-<date>.md: drafted replies, patches proposed, escalations.
