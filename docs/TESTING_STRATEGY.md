# Testing Strategy — Payout & Verification Path

## Why this first

The payout enforcement system (bank verification + 48h cooldown) is the
highest-risk code in the app — it directly gates real money leaving the
platform — and had **zero automated test coverage** before this PR. Every
prior fix to it (the original enforcement gate, the verify endpoint, the
cooldown-on-creation logic) was validated by manual `run_sql_query` checks
in chat, one-off, not regression-protected. This PR closes that gap for the
critical path; it does not attempt full app coverage in one pass.

## Testing pyramid applied here

```
   /  E2E  \        none yet — see "Not covered" below
  / Integration \    none yet — see "Not covered" below
 /  Unit Tests   \   added in this PR: 27 cases across 3 route files
```

Route handlers in this app are thin enough (auth → validate → gate → mutate)
that unit-testing the handler function directly, with `prisma`/`auth`/`audit`
mocked, gives most of the value integration tests would, at a fraction of
the cost — no test database, no network. That's the right tradeoff here
given the team size; revisit if the handlers grow more branching logic.

## What's covered in this PR

| File | What it protects |
|---|---|
| `src/app/api/admin/payouts/route.test.ts` | The verification + cooldown gate on `approve`/`mark_paid`; status-transition guards; exactly-once ledger writes; audit logging; that Paystack-method payouts aren't wrongly gated |
| `src/app/api/admin/bank-accounts/verify/route.test.ts` | The only path that can set `isVerified: true`; verify and un-verify (revocation); audit logging |
| `src/app/api/payouts/bank-accounts/route.test.ts` | New accounts get `eligibleForPayoutAt` (48h out) and `isVerified: false`; account numbers are never stored in plaintext; rate limiting |

Each file leads with a comment explaining *why* it exists — the specific
regression class it guards against — not just what it asserts, per this
project's existing convention (`src/lib/plans.test.ts`).

## What to cover next (gaps, ranked)

1. **`src/lib/plans.ts` money math** — already covered (pre-existing).
2. **Paystack webhook** (`checkout/paystack/webhook/route.ts`) — handles
   real payment confirmation; depends on `plans.ts` which is tested, but
   the webhook handler itself (signature verification, idempotency on
   duplicate webhook delivery) is not.
3. **`src/lib/encryption.ts`** — the actual AES-256-CBC + HMAC logic is
   mocked in these tests, not tested directly. Needs its own unit tests:
   round-trip encrypt/decrypt, tamper detection via HMAC mismatch.
4. **Integration test for the full payout lifecycle** — create account →
   attempt payout (blocked) → verify → wait/mock past cooldown → payout
   succeeds. None of the current tests exercise the routes together.
5. **CI wiring** — confirm `vitest` actually runs on every PR (check
   `.github/workflows/`) and blocks merge on failure, not just on
   `type-check`.

## What NOT to test here

Skipped deliberately: Prisma's own query building, Next.js routing itself,
trivial getters. Also skipped: full E2E (Playwright/Cypress) — not worth
the setup cost yet at this stage of the product; revisit once there's a
staging environment with seeded data to run against safely.

## Coverage target

No hard percentage target. The bar for this codebase right now: **every
route that moves money, changes verification/eligibility state, or writes
to the audit log must have unit tests before its next behavioral change**,
not 100% line coverage everywhere.
