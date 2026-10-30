# Vuka Music Security Audit — 2026-10-30

## Status

Initial source-code audit of `faithworth/Vuka` (default branch `main`) with first remediation pass isolated on `security/vuka-security-audit-2026-10` and draft PR #59.

This is a source review, not a penetration test. No production data, Supabase project settings, Cloudflare R2 bucket policy, Vercel environment values, or live payment-provider dashboard settings were accessed. Findings below are limited to what can be established from repository code and configuration.

## Confirmed findings

### HIGH — PayPal capture did not bind the supplied order to the requested purchase
**Affected:** `src/app/api/checkout/paypal/capture-order/route.ts`

The handler selected a purchase using `purchaseId OR paypal:<orderId>`. It did not require the selected purchase's stored PayPal order reference to match the supplied order ID before returning an existing download URL or capturing the order. A request could therefore pair an unrelated PayPal order ID with a purchase ID. The handler also did not verify the PayPal order's Vuka-generated `reference_id` or compare the captured USD amount with the server-retrieved order amount.

**Remediation in PR #59:** require exact persisted order-reference match, require the submitted item type/ID to match the purchase, retrieve PayPal's order and verify its Vuka purchase reference and USD amount, then verify the completed capture amount/currency against that order.

### HIGH — 2FA is not enforced server-side
**Affected:** `src/app/auth/login/page.tsx`, `src/app/auth/2fa/page.tsx`, `src/app/api/auth/2fa/route.ts`, `src/lib/auth.ts`

The password login establishes the Supabase session before redirecting to the 2FA page. The challenge token is stored only in browser `sessionStorage`; repository search found no call site for `consume2FAChallenge`. The central `getServerUser()` helper checks the Supabase session and database user but does not require a completed MFA challenge. Consequently, the 2FA screen is a client-side flow, not a server-side authorization boundary: a caller with valid primary credentials can attempt authenticated API requests without completing the challenge.

**Status:** NOT FIXED. Requires a coordinated server-side MFA gate across protected API routes and pages, plus a secure HttpOnly verification marker. Do not claim 2FA is protective until this is implemented and tested.

### MEDIUM — Public registration endpoint trusts caller-supplied email and role
**Affected:** `src/app/api/auth/register/route.ts`, `src/app/auth/register/page.tsx`, `src/app/api/auth/callback/route.ts`

The registration API is public and creates/updates the application database user using the submitted email and role before email verification necessarily completes. It can also promote an existing lower-privilege database role to artist/producer/industry based on the submitted role. Admin roles are not accepted by this schema, so this is not a demonstrated admin escalation, but it permits unauthenticated account-profile/role mutation and pre-creation of artist/industry records.

**Status:** NOT FIXED. Safer flow is to create application profiles only after Supabase has authenticated the email (callback/session), and bind the profile operation to that authenticated user's ID/email.

### MEDIUM — Scheduled worker accepted CRON_SECRET in URL query string
**Affected:** `middleware.ts`, `src/app/api/workers/cron/route.ts`

Both middleware and the worker route accepted a `?secret=` query parameter. URLs can be recorded in logs, analytics, monitoring, browser history, and referrer data.

**Remediation in PR #59:** query-string secrets removed; bearer and `x-cron-secret` headers remain supported. Vercel's existing cron URLs only pass the job name in the query string and continue to authenticate using the Authorization header.

### MEDIUM — Rate limiting fails open if both Redis and database storage fail
**Affected:** `src/lib/rateLimit.ts`

If Upstash is unavailable, the limiter falls back to Postgres. If the database path also errors, the helper returns `false` (allow). This preserves availability but means brute-force and abuse controls are not fail-closed during a combined dependency outage.

**Status:** NOT FIXED. Decide per endpoint whether sensitive actions (login, password reset, payout, checkout, upload) should fail closed or use a durable independent fallback. Avoid a global change that could block all legitimate traffic.

### MEDIUM — Upload URL issuance does not enforce a strict content-type/size policy
**Affected:** `src/app/api/dashboard/settings/upload-url/route.ts`, `src/lib/r2.ts`

The authenticated artist upload endpoint accepts caller-supplied MIME types, derives extensions from those values (including a generic subtype fallback), and issues one-hour presigned PUT URLs without an application-level file-size limit or content inspection. Authentication and server-derived object-key prefixes are present, but these controls do not prevent oversized uploads or content-type spoofing.

**Status:** NOT FIXED. Implement explicit file-type allowlists per upload category, size limits enforced by the upload path/bucket policy, and server-side validation before publishing/serving files. Do not assume the browser's MIME declaration proves file contents.

### MEDIUM — Password reset token is stored in plaintext and consumption is not atomic
**Affected:** `src/lib/security/passwordReset.ts`

Reset tokens are high entropy but stored in plaintext. The code validates a token, updates the Supabase password, and only afterwards marks the token used. Concurrent requests can both pass the initial validation before either marks the token consumed.

**Status:** NOT FIXED. Store only a cryptographic hash of reset tokens and atomically claim a valid, unused, unexpired token before changing the password. If the provider update fails after claiming, require a fresh reset link rather than making a token reusable.

### LOW/MEDIUM — Content Security Policy permits unsafe script execution primitives
**Affected:** `next.config.js`

The production Content Security Policy includes `'unsafe-inline'` and `'unsafe-eval'` in `script-src`. These weaken the protection CSP can provide against script injection. Removing them safely requires checking Next.js runtime requirements and replacing inline scripts with nonces or hashes; do not remove them blindly without a build/runtime test.

**Status:** NOT FIXED.

### LOW/MEDIUM — Dependency audit is non-blocking
**Affected:** `.github/workflows/ci.yml`

The workflow runs `npm audit --audit-level=critical || true`, so detected critical dependency vulnerabilities do not fail CI.

**Status:** NOT FIXED. First obtain a current dependency audit and remediate any existing advisories, then make the security check blocking at an agreed severity. Avoid making CI fail on known unresolved advisories without a remediation plan.

## Positive controls observed

- `.gitignore` excludes common local environment files.
- `.env.example` contains placeholders rather than actual credential values.
- Supabase service-role use is server-side in the inspected helper.
- Admin APIs inspected use database-backed role checks; the database-repair route additionally requires an explicit enable flag and a secret header.
- PayPal webhook signature verification is required in production when the webhook ID is absent (the handler returns 503).
- Security response headers include HSTS, frame denial, MIME sniffing protection, and a restrictive default CSP.
- The PayPal capture and 2FA one-time credential race fixes described above are committed only to the audit branch.

## Not yet verified — requires provider/dashboard access or execution

1. Supabase Auth settings: email confirmation, password policy, MFA settings, session lifetime, leaked-password protection, service-role key handling.
2. Supabase database exposure: RLS policies, grants, exposed schemas, anon/authenticated role privileges, and whether the application database role is over-privileged.
3. Cloudflare R2: bucket visibility, public bucket configuration, CORS, token scope, lifecycle/retention, object size limits, and access to private verification documents.
4. Vercel: production/preview environment separation, deployment protection, environment-variable scope, team access, build logs, and production deployment branch.
5. GitHub: secret-scanning alert state, Dependabot alerts, branch protection/rulesets, required reviews, and historical secret exposure. Code-search results alone cannot establish that Git history is clean.
6. Live webhook replay/idempotency and payment reconciliation tests for every active provider.
7. Backup frequency, restore testing, database point-in-time recovery, and R2 recovery.
8. Full route-by-route authorization/IDOR review across all API modules.
9. Dependency vulnerability scan, type-check, lint, unit tests, and production build on the PR branch.

## Immediate priorities

1. Complete server-side MFA enforcement.
2. Bind registration/profile creation to verified Supabase identity.
3. Fix password-reset token storage and atomic consumption.
4. Finish upload validation/size enforcement and audit private-file download paths.
5. Run provider/dashboard checks and restore tests.
6. Run the complete automated test/build suite and review PR #59 before merge.

## Change control

No changes in this audit branch have been merged into `main`. No production deployment has been intentionally triggered by merging this work. PR #59 is a draft pending CI and security review.
