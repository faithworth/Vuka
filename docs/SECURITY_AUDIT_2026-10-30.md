# Vuka Music Security Audit — 2026-10-30

## Status

Initial source-code audit of `faithworth/Vuka` (default branch `main`) with first remediation pass isolated on `security/vuka-security-audit-2026-10` and draft PR #59.

This is a source review plus read-only Supabase metadata/advisor inspection, not a penetration test. No customer record contents, Cloudflare R2 bucket policy, Vercel environment values, or live payment-provider dashboard settings were accessed. The Supabase checks read project/table metadata, advisor findings, function definitions, policy definitions, grants, and a role-scoped row-count test.

## Threat coverage: SQL injection and common attack classes

### SQL injection

The inspected 2FA and password-reset database operations use Prisma tagged-template calls such as `prisma.$queryRaw\`... ${value} ...\`` and `prisma.$executeRaw\`... ${value} ...\``. Prisma parameterizes interpolated values in these tagged-template APIs; user values are not concatenated into SQL in the inspected examples. The central helper in `src/lib/prisma.ts` also exposes `$queryRawUnsafe` / `$executeRawUnsafe` wrappers that accept a SQL string plus values. Passing values separately can be parameterized, but any caller that concatenates or interpolates untrusted input into the SQL string would be vulnerable.

**Status: NOT YET CERTIFIED.** GitHub code search was rate-limited during the extended audit, so every call site of the unsafe wrappers and every raw SQL construction could not be enumerated. The new Semgrep workflow scans for common OWASP/JavaScript issues, but it is not a substitute for a complete manual query review or adversarial SQL injection tests. Required completion: enumerate all `$queryRawUnsafe`, `$executeRawUnsafe`, `queryRaw`, `executeRaw`, `$queryRaw`, and `$executeRaw` call sites; confirm all dynamic values are bound parameters; remove or tightly constrain any dynamically assembled SQL; test quote, comment, boolean, UNION, time-delay and encoding payloads against staging endpoints without using production customer data.

### Other attack classes in scope

| Attack class | Current status |
|---|---|
| SQL injection | Parameterized patterns observed; complete call-site review pending |
| Broken access control / IDOR | Route-by-route ownership review pending |
| Authentication / account takeover | Server-side 2FA enforcement and registration trust boundary remain open |
| Password reset abuse | Plaintext token and race issue remains open |
| XSS / HTML injection | CSP weakened by unsafe-inline/eval; content rendering review pending |
| CSRF | SameSite/cookie and origin checks require route-by-route review |
| SSRF | URL-fetching endpoints and allowlists require review |
| Malicious uploads | Dashboard upload MIME allowlist added in audit branch; content signature and size enforcement pending |
| Path traversal | Middleware blocks several patterns; storage/download handlers still need canonical path and ownership review |
| Brute force / credential stuffing | Rate limits exist but DB fallback fails open; credential-stuffing and IP trust need review |
| Payment/webhook replay | PayPal capture binding improved; every provider webhook needs signature, amount, currency and idempotency tests |
| DoS / resource exhaustion | Request/body limits, concurrency and provider-level WAF/DDoS configuration not verified |
| Secrets / supply chain | New history secret scan and dependency audit workflow added; results pending |
| Clickjacking / MIME sniffing | X-Frame-Options and nosniff headers observed |
| Session theft / fixation | Session lifecycle, cookie flags and revocation need full verification |

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

### MEDIUM — Upload URL issuance does not enforce file-size or content-signature validation
**Affected:** `src/app/api/dashboard/settings/upload-url/route.ts`, `src/lib/r2.ts`

The authenticated artist upload endpoint previously accepted arbitrary MIME subtypes and derived object extensions from them. Authentication and server-derived object-key prefixes were present, but the original code did not enforce an upload size limit or inspect file contents.

**Remediation in audit branch:** explicit MIME allowlists now apply per upload category (images only for profile/artwork/event thumbnails; audio only for audio; a limited audio/video/PDF set for exclusive content). The GET legacy endpoint now only accepts photo/cover and JPEG/PNG/WebP. This blocks obvious HTML/script/executable MIME declarations but does not validate actual file signatures or impose a byte limit.

**Status: PARTIALLY FIXED.** Add upload size enforcement at the R2 upload proxy or signed policy layer and inspect actual file signatures before publishing or serving files.

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

## Live Supabase findings

Project: `VUKA` (`zbudtlkgdjaztsjdrbmk`), active, PostgreSQL 17.6.

The live Supabase security advisor returned:

- All 112 public tables have RLS enabled; 99 have no policies (INFO). A catalog query found zero RLS policies granted to `anon`, `authenticated`, or `public`; the four inspected policies on `User`, `Artist`, `Purchase`, and `AdminLog` are restricted to `service_role`. This is fail-closed for direct API roles, but the app's Prisma server connection must still enforce authorization correctly.
- 112 tables are visible in the GraphQL schema to `anon` and 112 to `authenticated` because those roles have SELECT grants. This exposes table/column metadata. Five separate read-only checks under the `anon` role returned zero rows for `User`, `Purchase`, `IndustryBankAccount`, `password_reset_tokens`, and `two_factor_challenges`; a separate check returned zero rows from `user_two_factor`. The advisor's schema-discoverability warning is real, but these checks did not find row-level data exposure through `anon`.
- One public SECURITY DEFINER function, `public.rls_auto_enable()`, executable by `anon` and `authenticated`. It is an event-trigger function with `search_path=pg_catalog`; event-trigger functions are not ordinary RPC functions, but unnecessary EXECUTE grants should still be removed.
- One trigger function, `public.protect_approved_verification_request()`, with mutable search_path. It is not SECURITY DEFINER and its current body uses built-ins/trigger records only; setting search_path to `pg_catalog` is appropriate.
- Leaked-password protection is disabled in Supabase Auth.

A role-scoped read-only check as `anon` returned zero rows from `public.user_two_factor`. The inspected `User`, `Artist`, `Purchase` and `AdminLog` tables each have a service-role-only policy; internal security tables such as `password_reset_tokens` and `two_factor_challenges` had RLS enabled with no policies. This is evidence of fail-closed RLS for those tested paths, not a full proof for every table or every API role.

**Remediation prepared in PR #59:** migration `prisma/migrations/20261030140000_security_function_privileges/migration.sql` revokes public/anon/authenticated EXECUTE on `rls_auto_enable()` (when present) and pins the verification trigger function's search_path to `pg_catalog`. It has not been applied to production. The migration must pass the preview build and be reviewed before merge.

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

### Vercel firewall / WAF status

The connected Vercel project is `vuka-distro` (`prj_2g8TfuexznpNg4o8wQuqINRugpBD`). Its project metadata reports SSO protection enabled for non-custom domains, but trusted-IP restrictions are disabled. The Vercel Firewall configuration and active-attack-status endpoints both returned `404 Seawall Config not found`; attempting to create a firewall configuration also returned the same 404. Therefore no WAF/CRS rules were activated and no firewall settings were changed. This may mean the project/plan does not currently have a provisioned firewall configuration, or the API resource is unavailable to this project. Verify Firewall availability in the Vercel dashboard or with Vercel support before relying on edge SQLi/XSS mitigation.

### Security automation added in audit branch

`.github/workflows/security.yml` now runs:
- `npm audit --audit-level=high` using the locked dependency tree (blocking on high/critical advisories).
- Semgrep OWASP Top 10 and JavaScript static analysis.
- Gitleaks over full Git history to detect committed secrets.

These checks are committed to the audit branch only. Results are pending; scanners may report findings requiring triage and fixes.

## Immediate priorities

1. Complete server-side MFA enforcement.
2. Bind registration/profile creation to verified Supabase identity.
3. Fix password-reset token storage and atomic consumption.
4. Finish upload validation/size enforcement and audit private-file download paths.
5. Run provider/dashboard checks and restore tests.
6. Run the complete automated test/build suite and review PR #59 before merge.

## Change control

No changes in this audit branch have been merged into `main`. No production deployment has been intentionally triggered by merging this work. PR #59 is a draft pending CI and security review.
