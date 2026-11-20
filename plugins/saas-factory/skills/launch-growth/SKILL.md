---
name: launch-growth
description: Generates high-utility tool pages, social drafts and email sequence drafts for one product. Build sessions only. Output is a review branch and queue/ drafts; nothing is published.
---
1. Read `docs/trend-brief.md` and inspect `src/app/`.
2. Delegate keyword research, `data/seo-pages.json`, social drafts and email drips to `growth-marketer`. Its drafts land in `queue/social/` and `queue/drips/`.
3. Generate `src/app/tools/[slug]/page.tsx` (`generateStaticParams` + `generateMetadata`) embedding the interactive tool with the unique presets from `data/seo-pages.json`, plus `src/app/sitemap.ts`. Every page must offer something a keyword swap would not: its own worked example and defaults.
4. Run `npm run typecheck`, `npm test` and `npm run build`. Never weaken, skip or delete a test assertion.
5. Commit to a branch named `agent/growth-<date>` and push that branch only. CI opens the draft PR. Do not open, approve or merge a PR yourself, and never push `main` or `release`.
6. Summarize: pages generated, drafts queued, and what the owner needs to review.
