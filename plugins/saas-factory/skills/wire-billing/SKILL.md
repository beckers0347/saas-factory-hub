---
name: wire-billing
description: Wires checkout, customer portal and idempotent webhook entitlements against a payment provider's sandbox. Interactive build sessions only.
---
1. Run `"$HUB_DIR/scripts/require-status.sh" <slug> approved,staging`. If it fails, stop and report its message.
2. Confirm the provider with the owner. The default is a merchant of record (Paddle or Lemon Squeezy); Stripe direct needs the owner's explicit choice.
3. Inspect `docs/trend-brief.md`, `.env.example`, Supabase auth and the schema files.
4. Delegate checkout, portal, migration and webhook implementation to `billing-architect`.
5. Document sandbox variable names in `.env.example` with placeholder values. Never commit a secret.
6. Run `npm run typecheck`, `npm test` and `npm run build`. Confirm the webhook tests pass: a replayed event changes nothing, and an invalid signature causes no database write.
7. Stop at the preview deploy. List the Gate 2 go-live checklist items still open, and remind the owner that live keys go into Vercel's Production environment only, pasted by the owner.
