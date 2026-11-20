---
description: Scaffolds, tests and deploys a self-serve Micro-SaaS MVP to a preview URL. Requires Gate 1 approval. Build sessions only.
argument-hint: [product-slug] [problem-statement]
---
Build a self-serve Micro-SaaS web app for: $ARGUMENTS

The first word of the arguments is the product slug; the rest is the problem statement.

## Step 0: the gate

Run `"$HUB_DIR/scripts/require-status.sh" <slug> approved,staging` before anything else. If it exits non-zero, stop and report its message. Do not work around it, and do not edit `portfolio/registry.json`.

## Architecture and integrity rules

1. Stack: Next.js (App Router) + Tailwind CSS + Supabase (Auth and Postgres) + Vercel preview deploy.
2. Self-serve flow: landing page (with Terms, Privacy and refund policy links) -> instant interactive demo -> Supabase Auth gate for saving and exporting.
3. Write unit tests for core business logic and an end-to-end smoke test.
4. NEVER weaken, skip or delete a test assertion to get a passing build.
5. Row-level security tests are part of the suite and fail the build when any of these break: a signed-in user cannot read, update or delete another user's row in any table; an anonymous client cannot read any table that is not explicitly public; the service-role key appears nowhere in the client bundle; every table created in a migration has RLS enabled.
6. Free-demo abuse limits: rate-limit the demo and sign-up endpoints per IP and per session, add a bot check on sign-up, cap input size, and put a daily spend ceiling on any paid API the demo calls. When the ceiling trips, the demo shows "paused, try tomorrow". No LLM call in the anonymous demo unless it sits behind those caps.
7. Add `patches/`, `queue/` and `state/` to `.gitignore`, and copy `templates/product-repo/.github/workflows/agent-branch-ci.yml` from the hub into `.github/workflows/`.
8. Sandbox/test keys only. The build must pass with dummy public env values so CI needs no real secret.
9. Run `npm run typecheck`, `npm test` and `npm run build` until green, then deploy to a preview URL only. Never push `release`, never deploy to production, never set a live key.

Finish by listing the preview URL and the Gate 2 go-live checklist items that are still open. Setting `status: live` and pushing `release` are the owner's actions.
