---
name: cold-outreach
description: Researches B2B prospects for one live product and stages a cold email batch for the owner's approval. Never sends.
---
1. Read `docs/trend-brief.md` to confirm the ICP criteria and the live URL. Outreach is only for a product whose registry status is `live`; if it is not, stop.
2. Delegate prospect research and draft creation to `outreach-researcher`. It stages one batch under `queue/outreach/`.
3. Do not send anything, and do not mark any recipient approved. There is no tool here that can.
4. Output a Gate 3 summary for the owner: the batch file, each recipient's company, region, cited public signal and URL, and the personalization angle used.
5. Remind the owner of the human-only steps: pull the batch to the laptop, run `scripts/review-batch.sh <batch.json>`, then `scripts/send-batch.sh <batch.json>`.
