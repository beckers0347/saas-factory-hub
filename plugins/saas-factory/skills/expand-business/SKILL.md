---
name: expand-business
description: Reads registry, learnings and metrics snapshots, and writes one evidence-backed proposal. Never launches anything.
---
The wrapper script has placed read-only copies in the working directory: `portfolio/registry.json` and `portfolio/learnings.md` (both from origin/main), and the last 4 metrics snapshots in `snapshots/`. You hold no payment or analytics key and can write only under `queue/`.

1. Read `portfolio/registry.json`, `portfolio/learnings.md` and every file in `snapshots/`. Use only numbers that appear in those files. If a number you need is missing, say it is missing; never estimate it.
2. If any live product has `critical_errors_open` > 0 or an unresolved escalation in its latest digest, the proposal is "fix that first" and nothing else.
3. Otherwise choose ONE: scale a winner (feature or tool-page proposal tied to its top-converting queries), test an adjacent niche (propose a trend-mvp run and a registry idea entry), or pause/retire a product whose numbers miss the targets in its registry entry.
4. Do not propose a new product when the number of live products is at registry `max_live_products`.
5. Write `queue/proposals/<date>.md`: evidence table with the snapshot dates used, the recommendation, what result in the next 14 days would show it was wrong, and cost and support-load estimate. Write `queue/learnings-append.md` with notes for the owner to commit.
6. Do not run commands, launch, deploy or edit the registry.
