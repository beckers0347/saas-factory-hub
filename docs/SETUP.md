# Setup and status

Written 2026-11-19. Nothing here is running yet. The hub repo exists with its rulesets (section 3). The agent
GitHub App exists. No Vercel project, agent box or provider account has been created yet.

## 1. What exists and how it was checked

| Piece | Check performed | Result |
|---|---|---|
| `scripts/apply-patches.sh` | Throwaway repos, two layouts (agent folders git-ignored and not) | Good patch pushed as `fix/ticket-<id>` with only its own files; patches touching `.github/`, root or nested `package.json`, with no test, over 200 lines, with a rename, or unparsable were rejected; second run skipped handled tickets |
| `scripts/require-status.sh` | Throwaway hub repo | Exit 0 for an allowed status, 1 for a wrong one, 2 for unknown or status-less products; reads `origin/main`, ignores a tampered working tree |
| MCP servers | `npm test` in `plugins/saas-factory/mcp` | 44 tests pass |
| Headless support run | `claude -p` with the cron wrapper's flags against fixture tickets | How-to ticket: draft grounded in docs. Bug ticket: patch plus regression test, then applied by `apply-patches.sh` to a pushed branch. Refund ticket and a prompt-injection ticket: owner paged, no draft, nothing followed. No tracked file modified |
| Permission rules | `claude -p` asked to write to five folders and read two `.env` files | See section 2 |
| Public forum sources | Live call | Hacker News and Stack Overflow both returned results |
| `review-batch.sh`, `send-batch.sh` | jq logic and hash check exercised by hand; both refuse to run without a terminal | Not run interactively end to end |
| `run-ops-cron.sh`, `run-expansion-cron.sh`, `kill-switch.sh` | Syntax check only | Need the Linux agent box (`flock`, `stat -c`, `systemctl`) |
| `agent-branch-ci.yml` | None | Has never run on GitHub |

## 2. Where the blueprint was wrong, found by testing

These were confirmed with Claude Code CLI 2.1.286. Re-test after any CLI upgrade.

1. **`Write(path)` permission rules do not match file writes.** With only `Write(./scripts/**)`
   denied, a session wrote to `scripts/` and `.github/`. The working spelling is `Edit(path)`,
   for both deny and allow. `agent-box/settings.json` and both cron wrappers use `Edit(...)`.
2. **Plugin MCP tools are not named `mcp__support-ops__*`.** They are
   `mcp__plugin_saas-factory_support-ops__<tool>`. With the blueprint's names the agent has
   no support tools at all. Agent frontmatter and `--allowedTools` use the real names.
3. **`apply-patches.sh` aborted when `patches/`, `queue/` and `state/` were git-ignored**,
   which the blueprint itself prescribes. It now stages with `git apply --index`.
4. **The blocked-path check only matched at the repo root.** A patch could touch
   `apps/web/package.json` or a nested `.env`. It now matches at any depth.
5. **`send-batch.sh` skipped the suppression check when the suppression file was missing.**
   It now exits instead.
6. **Denying `Bash` leaves other tools in the session.** The wrappers now pass `--restricted`
   and an explicit `--tools` list, so the session has only Read, Write, Glob, Grep, Skill and Task.

Additions beyond the blueprint: `--max-budget-usd` per run (default 2, override with
`RUN_BUDGET_USD`); per-run caps of 20 drafts and 10 pages inside `support-ops`; a `domains`
list per product in the registry, which becomes the reply-link allowlist.

## 3. Rollout step 1 (control plane): state on 2026-11-19

Done, on https://github.com/beckers0347/saas-factory-hub (public, because GitHub Free does
not enforce rulesets or offer secret scanning on private repos):

- [x] Repo created and pushed. `.github/CODEOWNERS` reports 0 errors.
- [x] Secret scanning and push protection enabled.
- [x] Ruleset "agent-confinement": every branch except `fix/**` and `agent/**` blocks creation, update, deletion and force pushes.
- [x] Ruleset "main": changes only through a pull request, with one approval and code-owner review.
- [x] Ruleset "tags: owner only": tag creation, update and deletion blocked.
- [x] Default workflow token is read-only.
- [x] Proof: a direct push to `main` by the owner is refused; the same change merges through a pull request.

Difference from the blueprint: it asks for an empty bypass list. Applied literally that
locks the owner out too (no merge to `main`, no push to `release`), and GitHub does not let
you approve your own pull request. So the repository admin role is the only bypass: "always"
on agent-confinement and tags, and "pull requests only" on main. The agent App has no admin
role and gets no bypass. A pull request opened by `github-actions[bot]` still needs the
owner's approval to merge without using the bypass.

Agent App, created 2026-11-21: `saas-factory-agent-beckers0347` (app id 5862575). Permissions are
Contents: write and Metadata: read, nothing else; webhook off; private to this account;
installed on `saas-factory-hub` and `factory-ruleset-proof` only.

Proofs run 2026-11-21 with the App's installation token against
`beckers0347/factory-ruleset-proof`, which carries the same three rulesets:

- [x] Refused: push to `main`, force-push `main`, delete `main`, create a tag, create `release`, create `snapshots`, create any other branch (`other/thing`).
- [x] Allowed: create `fix/test` and `agent/test`.
- [x] Refused through the API: write a file to `main` (409), create or delete a ruleset (403), open a pull request (403), edit repo settings (403).

Note for the agent box: the token request failed when the machine's clock was 87 seconds
ahead of GitHub's. Keep the box on NTP, and keep the App JWT lifetime well under 10 minutes.

Still to do, by the owner unless noted:

1. Move the App's private key into your password manager. It is the agent box's credential and belongs nowhere else until the box exists.
2. When the snapshot job is built: exclude `snapshots` from agent-confinement, give GitHub Actions the only write path to it, then prove the job can push it and the App cannot.
3. For each product repo: the same three rulesets, plus the `agent-branch-ci` required check on `main`; install the App on it; enable "Allow GitHub Actions to create pull requests"; copy in `templates/product-repo/.github/workflows/agent-branch-ci.yml`.
4. In Vercel, per product project: set the Production Branch to `release`; live keys in the Production environment only.
5. On the agent box, repeat the permission test from section 1: writes to `patches/` and `state/` succeed; writes to `scripts/`, `.github/` and `src/` and reads of `.env` are refused.

## 4. Agent box

A dedicated Linux machine or container. It needs `git`, `jq`, `curl`, `flock`, Node 22+ and
the Claude Code CLI. It must have **no other Claude plugins, MCP servers or connectors**
and must authenticate with an API key that has a provider-side monthly spend limit.

Environment file `/etc/factory/agent.env` (mode 0600), agent-zone values only:

| Variable | Purpose |
|---|---|
| `HUB_DIR`, `PRODUCTS_DIR`, `STATE_DIR` | Checkout of this repo, folder of product checkouts (`<slug>/`), state folder (`/var/lib/factory`) |
| `OPS_CHECK_URL`, `SUPPORT_CHECK_KEY` | Free pre-check: `GET $OPS_CHECK_URL/<slug>` returns `{"open_count": n, "error_spikes": n}` |
| `SUPPORT_API_BASE`, `SUPPORT_DRAFT_KEY` | Support desk: read tickets, create drafts only |
| `MONITORING_API_BASE`, `MONITORING_READ_KEY` | Error spikes, read-only |
| `ALERT_WEBHOOK_URL` | Fixed Slack or Discord webhook for `page_owner` |
| `SEO_API_BASE`, `SEO_API_KEY`, `ANALYTICS_API_BASE`, `ANALYTICS_READ_KEY` | Read-only marketing data |
| `LEAD_API_BASE`, `LEAD_SEARCH_KEY` | Lead search only, no send |
| `TREND_API_BASE`, `TREND_DATA_API_KEY` | Search-trend and ad data, read-only |
| `DATAFORSEO_BASIC_AUTH` | Search volume, read-only. Only needed if trend research runs on the box |
| `RUN_BUDGET_USD` | Optional per-run spend cap |

Never on the box: any `.env` file (the wrappers abort if they find one), payment keys, the
send key, the Supabase service-role key, kill-switch tokens.

Create `$STATE_DIR/HEARTBEAT` at setup and `touch` it at each weekly review. Without a
heartbeat newer than 7 days the wrappers do nothing.

## 5. Data contracts (unverified sources)

Apart from search volume (see the end of this section), no support desk, monitoring, SEO,
analytics, lead or ad-data provider has been chosen or tested. Each MCP server calls a base URL from the environment with a bearer key and expects
the JSON below. For each provider, either point the base URL at a thin adapter you own that
returns this shape, or replace the call in the server. Until a source is configured its tool
answers "not configured" (trend tools answer `verified: false, weight: 0`) and never invents data.

| Source | Request | Response |
|---|---|---|
| support | `GET products/<slug>/tickets?status=open&limit=n` | `{"tickets": [{"id", "subject", "body", "created_at"}]}` |
| support | `POST products/<slug>/tickets/<id>/drafts` with `{"body"}` | any 2xx. Must create a draft, never send |
| monitoring | `GET products/<slug>/error-spikes` | `{"spikes": [{"id", "message", "count", "route", "first_seen"}]}` |
| seo | `GET keywords?seed=&limit=` | `{"keywords": [{"keyword", "volume", "cpc_usd", "intent"}]}` |
| analytics | `GET products/<slug>/funnel?days=` | flat numeric fields, optional `top_queries: [string]` |
| lead | `GET companies?q=&region=&limit=` | `{"companies": [{"record_id", "name", "domain", "region", "contact_email", "signal_text", "signal_url"}]}` |
| lead | `GET enrich?domain=` | `{"summary", "signals": [{"text", "url"}]}` |
| trend | `GET search-trends?keywords=a,b` | `{"keywords": [{"keyword", "volume", "trend_pct_90d"}]}` |
| trend | `GET ads?q=` | `{"ads": [{"advertiser", "days_running", "text"}]}` |

Ticket ids must match `^[A-Za-z0-9_-]{1,40}$`; others are skipped. All calls are https only,
never follow redirects, and time out after 20 seconds.

For a dry run with no provider, set `FACTORY_FIXTURE_DIR` to a folder of JSON files laid out
as `<source>/<path>.json` (for example `support/products/<slug>/tickets.json`). Drafts then
land in `state/drafts/` and pages in `state/pages.log`.

### Search volume: DataForSEO (connected 2026-11-24)

`query_search_trends` uses DataForSEO when a credential is present, and falls back to the
generic `trend` contract above when it is not. One call sends up to 10 keywords to
`POST v3/keywords_data/google_ads/search_volume/live` for the United States in English and
returns, per keyword, `volume`, `trend_pct_90d`, `cpc_usd` and `competition`.

- `trend_pct_90d` is worked out here, not by the provider: the latest three months of
  `monthly_searches` against the three before. It is `null` with under six months of history
  or a zero base. A missing figure is always `null`, never zero.
- The credential is read from the environment (`DATAFORSEO_BASIC_AUTH`, or `DATAFORSEO_LOGIN`
  plus `DATAFORSEO_PASSWORD`), or from a keys file outside any repo: `FACTORY_KEYS_FILE`, or
  `~/.saas-factory/data-keys.env` by default. Only `DATAFORSEO_*` lines are read from that file.
- Every live call costs money. A server process stops after 10 calls, and the tool reports
  `cost_usd` from each response.
- The provider reports errors inside an HTTP 200. The adapter treats any status other than
  20000, at the top level or on the task, as a failure.
- Checked 2026-11-24 against `sandbox.dataforseo.com` (free, canned keywords): the response
  fields match what the adapter reads. Five live calls of 10 keywords each returned real
  figures the same day, at $0.09 per call.
- Set `DATAFORSEO_API_BASE=https://sandbox.dataforseo.com` to exercise the tool at no cost.

## 6. Registry entry shape

```json
{
  "slug": "example-tool",
  "repo": "beckers0347/product-example-tool",
  "domains": ["example-tool.com"],
  "status": "validating",
  "gate1": {
    "pass_if_any": [
      { "visitors_min": 300, "signup_rate_min": 0.08, "traffic": "targeted: paid test or ICP communities, not friends" },
      { "interviews_min": 5, "would_pay_min": 3, "named_price_usd": 15 }
    ],
    "test_window_days": 21,
    "waitlist_retention_days": 90
  },
  "caps": { "llm_usd_month": 40, "outbound_per_day": 25 }
}
```

The threshold numbers are the blueprint's examples. Set your own in the PR that sets
`validating`. `domains` is the only set of hosts a drafted support reply may link to; with
no domains every link is refused.

## 7. Not built yet, and why

- **Metrics snapshot job** (daily CI job writing `snapshots/YYYY-MM-DD.json`): depends on which payment provider and analytics tool you choose at Gate 2. `run-expansion-cron.sh` exits quietly until that branch exists.
- **`send_one` in `send-batch.sh`**: a stub that refuses to send. It depends on your cold-email provider, and must add one-click unsubscribe, your postal address and accurate headers.
- **Provider adapters** for the sources in section 5, other than search volume.
- **Any product**: the waitlist page and app are built per product in a build session, after you pick a niche (rollout step 3).
- **Auto-send for a reply class**: the registry flag is described in the blueprint but nothing reads it. Every reply is a draft.
- Legal, tax, Terms and Privacy text, and regional email rules are outside this repo and need a professional.
