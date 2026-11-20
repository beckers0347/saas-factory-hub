---
description: Researches trend signals for a niche, writes a validation brief, and scaffolds an honest waitlist page. Stops at Gate 1.
argument-hint: [seed-niche]
---
Research the niche "$ARGUMENTS" and stop at Gate 1. Do not build the application.

1. Delegate niche research for "$ARGUMENTS" to the `trend-scout` subagent.
2. Save the ranked opportunities and their evidence to `docs/trend-brief.md`, including trend-scout's list of signals that scored zero because the source was unverified, under the heading "Human checks at Gate 1".
3. Scaffold a lightweight waitlist page. Before it can collect a single signup it must have:
   - Plain "in development, join the list for early access" copy. No fake testimonials, no usage counts, no features that do not exist, and no payment taken.
   - A privacy notice stating what is collected (email), why, how long it is kept (the `waitlist_retention_days` value), and how to be deleted.
   - An unticked consent checkbox for EU/UK visitors.
   - Signups stored in Supabase with row-level security enabled, and a documented deletion path in `docs/runbooks/waitlist-deletion.md`.
4. Write `queue/registry-proposal.json`: a proposed registry entry with `slug`, `repo`, `domains`, `status: "validating"`, and a `gate1` block (`pass_if_any` thresholds, `test_window_days`, `waitlist_retention_days`) and `caps`. Mark the threshold numbers as suggestions: the owner sets the real values and freezes them in the PR that sets `validating`.
5. Stop. Output the brief, the waitlist preview URL if one exists, and a reminder that only the owner can change `portfolio/registry.json`, by copying the proposal into a PR.
