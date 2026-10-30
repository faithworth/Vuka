# Vuka Music Security Audit — 2026-10-30

## Status

Initial source-code audit of `faithworth/Vuka` (default branch `main`) with first remediation pass isolated on `security/vuka-security-audit-2026-10` and draft PR #59.

This is a source review plus read-only Supabase metadata/advisor inspection, not a penetration test. No customer record contents, Cloudflare R2 bucket policy, Vercel environment values, or live payment-provider dashboard settings were accessed. The Supabase checks read project/table metadata, advisor findings, function definitions, policy definitions, grants, and a role-scoped row-count test.

## Threat coverage: SQL injection and common attack classes

### SQL injection

The inspected 2FA and password-reset database operations use Prisma tagged-template calls such as `prisma.$queryRaw\`... ${value} ...\`` and `prisma.$executeRaw\`... ${value} ...\``. Prisma parameterizes interpolated values in these tagged-template APIs; user values are not concatenated into SQL in the inspected examples. The central helper in `src/lib/prisma.ts` also exposes `$queryRawUnsafe` / `$executeRawUnsafe` wrappers that accept a SQL string plus values. Passing values separately can be parameterized, but any caller that concatenates or interpolates untrusted input into the SQL string would be vulnerable.

**Manual source review completed for the discovered unsafe-wrapper/helper call sites.** `src/lib/prisma.ts` passes SQL and bound values separately to Prisma's `$queryRawUnsafe` / `$executeRawUnsafe` APIs. Reviewed call sites in admin plans, creator tiers, creator subscription helpers, industry services/orders, Paystack industry webhook handling, and marketplace services use `$1`, `$2`, etc. with values passed separately. Admin plan pagination is parsed as numbers before interpolation. The migration route executes only a static, source-controlled migration registry and checks `CRON_SECRET` before execution.

**A genuine injection-prone construction was found and fixed on the audit branch:** `src/app/api/marketplace/services/route.ts` previously interpolated `category` and `search` into SQL strings after manual quote escaping, and interpolated pagination directly. It now builds fixed SQL predicates with numbered PostgreSQL bind markers and passes category, search, limit and offset as parameters; input lengths and pagination bounds are constrained.

The primary MCP SQL tool intentionally accepts a read-only SELECT/CTE string and executes it with a statement timeout and row cap. It is now behind the MCP bearer-authentication gate, but it remains a privileged data-reading capability and should only be exposed to trusted operators. Static analysis is not a substitute for adversarial SQL injection tests. Required validation before production approval: test quote, comment, boolean, UNION, time-delay and encoded payloads against a staging copy, and review any newly added raw SQL call sites in future PRs.

### Other attack classes in scope

| Attack class | Current status |
|---|---|
| SQL injection | Unsafe helper call sites reviewed; marketplace filter injection fixed; staging payload tests pending |
| Broken access control / IDOR | Route-by-route ownership review pending |
| Authentication / account takeover | Central auth and edge middleware now enforce hashed HttpOnly MFA proof; registration trust boundary remains open |
| Password reset abuse | Hashing and atomic one-time claim implemented on audit branch |
| XSS / HTML injection | CSP weakened by unsafe-inline/eval; content rendering review pending |
| CSRF | SameSite/cookie and origin checks require route-by-route review |
| SSRF | URL-fetching endpoints and allowlists require review |
| Malicious uploads | Dashboard upload MIME allowlist added in audit branch; content signature and size enforcement pending |
| Path traversal | Middleware blocks several patterns; storage/download handlers still need canonical path and ownership review |
| Brute force / credential stuffing | Sensitive actions fail closed on dual-backend outage; DB counter concurrency and IP trust need review |
| Payment/webhook replay | PayPal capture binding improved; every provider webhook needs signature, amount, currency and idempotency tests |
| DoS / resource exhaustion | Request/body limits, concurrency and provider-level WAF/DDoS configuration not verified |
| Secrets / supply chain | Gitleaks, Semgrep and npm audit passed; 0 dependency advisories; GitHub Actions pinned to SHAs |
| Clickjacking / MIME sniffing | X-Frame-Options and nosniff headers observed |
| Session theft / fixation | Session lifecycle, cookie flags and revocation need full verification |

## CRITICAL — Privileged MCP endpoints have no explicit authentication gate
**Affected:** `src/app/api/[transport]/route.ts`, `src/app/api/mcp-business/[transport]/route.ts`, `src/lib/mcp-shared.ts`, `middleware.ts`

Both MCP routes instantiate server-side Supabase clients with `SUPABASE_SERVICE_ROLE_KEY` and export the MCP handler directly for GET/POST/DELETE. The inspected route code contains no request authentication or per-tool authorization check before the handler is invoked. The CORS preflight handlers allow `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Headers: *`. The middleware does not include these MCP routes in its admin or cron gates; ordinary unauthenticated requests are not rejected by the generic middleware path.

The original MCP manifest includes a `run_sql_query` tool that sends caller-supplied SQL to PostgreSQL after regex checks, and the business MCP manifest exposes artist revenue, payout and purchase summaries using a service-role client. This is a critical trust-boundary issue: a remote caller may be able to invoke privileged tools without a verified identity. The SQL keyword filter is not a substitute for authentication, least-privilege database credentials, and per-tool authorization. The full tool set must be classified, and privileged operations must be protected by an authenticated bearer/OAuth mechanism or removed from the public manifest.

**Remediation committed on the security branch:** all six MCP route groups now pass GET/POST/DELETE through a shared fail-closed bearer-authentication gate before invoking `mcp-handler`: `/api/mcp` (`src/app/api/[transport]/route.ts`), `/api/mcp-business`, `/api/mcp-cofounder`, `/api/mcp-github`, `/api/mcp-ops`, and `/api/mcp-safety`. The gate reads `MCP_API_KEY`, rejects missing/misconfigured credentials with 503, rejects absent/invalid Bearer tokens with 401, compares fixed-length SHA-256 digests with `timingSafeEqual`, and never logs or returns the secret. Wildcard CORS headers were removed from MCP OPTIONS handlers; preflight no longer grants cross-origin access.

A new Vercel sensitive environment variable `MCP_API_KEY` was created for Production and Preview. The credential is high entropy (48 random bytes). The secret value is intentionally not recorded in repository files, PR text, or this audit document. Existing MCP connectors will fail authentication until their Authorization header is configured with `Bearer <MCP_API_KEY>`.

**Status: CODE AND SECRET CONFIGURATION ADDED ON SECURITY BRANCH / VERCEL PROJECT.** The production route code on `main` is not protected until this branch is deployed to Production. The Preview deployment must be rebuilt after the environment variable was added, then tested for 401 without a token and successful MCP initialize/tools/list with a valid token. Update every external connector with the same bearer credential before expecting it to work again. Rotate the key if it is exposed; update all clients before rotating.

## Confirmed findings

### HIGH — PayPal capture did not bind the supplied order to the requested purchase
**Affected:** `src/app/api/checkout/paypal/capture-order/route.ts`

The handler selected a purchase using `purchaseId OR paypal:<orderId>`. It did not require the selected purchase's stored PayPal order reference to match the supplied order ID before returning an existing download URL or capturing the order. A request could therefore pair an unrelated PayPal order ID with a purchase ID. The handler also did not verify the PayPal order's Vuka-generated `reference_id` or compare the captured USD amount with the server-retrieved order amount.

**Remediation in PR #59:** require exact persisted order-reference match, require the submitted item type/ID to match the purchase, retrieve PayPal's order and verify its Vuka purchase reference and USD amount, then verify the completed capture amount/currency against that order.

### HIGH — 2FA is not enforced server-side
**Affected:** `src/app/auth/login/page.tsx`, `src/app/auth/2fa/page.tsx`, `src/app/api/auth/2fa/route.ts`, `src/lib/auth.ts`

The password login establishes the Supabase session before redirecting to the 2FA page. The challenge token is stored only in browser `sessionStorage`; repository search found no call site for `consume2FAChallenge`. The central `getServerUser()` helper checks the Supabase session and database user but does not require a completed MFA challenge. Consequently, the 2FA screen is a client-side flow, not a server-side authorization boundary: a caller with valid primary credentials can attempt authenticated API requests without completing the challenge.

**Remediation in audit branch:** successful TOTP/backup-code verification issues a 12-hour HttpOnly, Secure-in-production, SameSite=Lax `vuka_mfa` cookie. The random cookie value is stored only as a SHA-256 hash in `two_factor_challenges`. Central `getServerUser()` checks the cookie against the user's unexpired, unused challenge. Edge middleware also checks MFA state and the same challenge for authenticated routes that use Supabase auth directly, returning 401 for API requests or redirecting pages to `/auth/2fa`. `/api/auth/2fa` and `/api/auth/me` are exempt for login/bootstrap; setup cannot overwrite an already-enabled authenticator, and disabling MFA revokes active challenges. The client no longer stores MFA proof in sessionStorage.

**Status: IMPLEMENTED ON AUDIT BRANCH; full route-by-route regression and bypass testing still required.** Existing challenge tokens from the previous plaintext/10-minute format will no longer validate, so users must complete a fresh 2FA challenge after deployment.

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

**Remediation in audit branch:** if Redis and Postgres both fail, login, registration, magic-link, password-reset, email-verification, checkout, payout, bank-account and upload actions now fail closed. Less sensitive social/search/general API actions remain fail-open to avoid a platform-wide outage. The Postgres fallback still uses a read-then-write counter and needs concurrency/atomicity hardening; Redis remains the preferred atomic path.

**Status: PARTIALLY FIXED ON AUDIT BRANCH; production rollout pending.

### MEDIUM — Upload URL issuance does not enforce file-size or content-signature validation
**Affected:** `src/app/api/dashboard/settings/upload-url/route.ts`, `src/lib/r2.ts`

The authenticated artist upload endpoint previously accepted arbitrary MIME subtypes and derived object extensions from them. Authentication and server-derived object-key prefixes were present, but the original code did not enforce an upload size limit or inspect file contents.

**Remediation in audit branch:** explicit MIME allowlists now apply per upload category (images only for profile/artwork/event thumbnails; audio only for audio; a limited audio/video/PDF set for exclusive content). The GET legacy endpoint now only accepts photo/cover and JPEG/PNG/WebP. This blocks obvious HTML/script/executable MIME declarations but does not validate actual file signatures or impose a byte limit.

**Status: PARTIALLY FIXED.** Add upload size enforcement at the R2 upload proxy or signed policy layer and inspect actual file signatures before publishing or serving files.

### MEDIUM — Password reset token is stored in plaintext and consumption is not atomic
**Affected:** `src/lib/security/passwordReset.ts`

Reset tokens are high entropy but stored in plaintext. The code validates a token, updates the Supabase password, and only afterwards marks the token used. Concurrent requests can both pass the initial validation before either marks the token consumed.

**Remediation in audit branch:** new reset tokens are stored as SHA-256 hashes. Consumption atomically claims an unused, unexpired token with `UPDATE ... WHERE usedAt IS NULL AND expiresAt > NOW() RETURNING` before changing the password, preventing concurrent replay. Legacy plaintext tokens remain temporarily accepted during the existing one-hour expiry window and are hashed when consumed. If the provider update fails after the atomic claim, the link remains consumed and the user must request another link.

**Status: FIXED ON AUDIT BRANCH; production rollout pending.**

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

### Live RLS / privilege checks (read-only)

- All 112 ordinary tables in the `public` schema currently have row-level security enabled. None currently has `FORCE ROW LEVEL SECURITY`; the server-side service-role/application owner can bypass RLS as expected for trusted backend access.
- `anon` and `authenticated` have table-level grants across the public tables, but the policy inventory returned only `service_role` policies. With RLS enabled and no anon/authenticated policies, those client roles are denied rows by RLS. This is safer than relying on table grants alone, but must be retested after policy changes.
- The only `SECURITY DEFINER` public-schema function returned by the audit was `rls_auto_enable()`, which has `search_path=pg_catalog` and no anon/authenticated EXECUTE grants.
- `protect_approved_verification_request()` is a normal trigger function with `search_path=pg_catalog`, but the live privilege inventory showed default EXECUTE grants to PUBLIC, anon and authenticated. A new migration `20261030160000_revoke_trigger_public_exec` now revokes those grants while retaining server/trigger operation. This migration is on the security branch and has not yet been applied to production.

These checks confirm the table-level RLS state and function grants only; they do not replace a policy-by-policy review of data ownership or service-role key handling.

The live Supabase security advisor returned:

- All 112 public tables have RLS enabled; 99 have no policies (INFO). A catalog query found zero RLS policies granted to `anon`, `authenticated`, or `public`; the four inspected policies on `User`, `Artist`, `Purchase`, and `AdminLog` are restricted to `service_role`. This is fail-closed for direct API roles, but the app's Prisma server connection must still enforce authorization correctly.
- 112 tables are visible in the GraphQL schema to `anon` and 112 to `authenticated` because those roles have SELECT grants. This exposes table/column metadata. Five separate read-only checks under the `anon` role returned zero rows for `User`, `Purchase`, `IndustryBankAccount`, `password_reset_tokens`, and `two_factor_challenges`; a separate check returned zero rows from `user_two_factor`. The advisor's schema-discoverability warning is real, but these checks did not find row-level data exposure through `anon`.
- One public SECURITY DEFINER function, `public.rls_auto_enable()`, executable by `anon` and `authenticated`. It is an event-trigger function with `search_path=pg_catalog`; event-trigger functions are not ordinary RPC functions, but unnecessary EXECUTE grants should still be removed.
- One trigger function, `public.protect_approved_verification_request()`, with mutable search_path. It is not SECURITY DEFINER and its current body uses built-ins/trigger records only; setting search_path to `pg_catalog` is appropriate.
- Leaked-password protection is disabled in Supabase Auth.

A role-scoped read-only check as `anon` returned zero rows from `public.user_two_factor`. The inspected `User`, `Artist`, `Purchase` and `AdminLog` tables each have a service-role-only policy; internal security tables such as `password_reset_tokens` and `two_factor_challenges` had RLS enabled with no policies. This is evidence of fail-closed RLS for those tested paths, not a full proof for every table or every API role.

**Migration application — production database:** Supabase `_prisma_migrations` confirms `20261030140000_security_function_privileges` started at `2026-10-30 13:42:53 UTC` and finished at `13:42:53.878 UTC`. It was applied by the Vercel preview build because Preview and Production share the same `DATABASE_URL` and `DIRECT_URL` environment-variable records. This contradicts the initial assumption that no production migration had run.

**Post-migration verification:** `rls_auto_enable()` now denies EXECUTE to `anon`, `authenticated`, and `PUBLIC`. `protect_approved_verification_request()` is not SECURITY DEFINER and its body uses only `OLD`/`NEW` trigger records and built-ins; its stored setting is `search_path=pg_catalog`. The migration contains no table/data DDL or customer-row updates. No rollback is indicated by the observed function definitions and grants.

**Pipeline remediation in audit branch:** `scripts/migrate.js` now exits before running migrations on Vercel deployments where `VERCEL_ENV` is not `production`. The subsequent Vercel preview build for commit `0e923b44095cc654372b44a9d5baefdd38ab6ebb` logged `[migrate] Vercel Preview deployment — skipping database migrations`, confirming the guard works in the preview build. The guard is not deployed to production until merge. Preview still shares production application secrets/database access; a separate staging Supabase project and preview-only environment variables are still required.

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

### Semgrep static-analysis findings and fixes

The first Semgrep run scanned 578 tracked files with 108 rules and returned 46 blocking findings. Important confirmed code patterns included:

- TLS peer verification disabled (`rejectUnauthorized: false`) in three PostgreSQL/MCP connection sites: `src/app/api/[transport]/route.ts` (two locations), `src/app/api/mcp-business/[transport]/route.ts`, and `src/lib/mcp-shared.ts`. The audit branch now sets `rejectUnauthorized: true` at these sites. This must be confirmed by the preview build and an actual database-backed MCP smoke test before production rollout.
- JSON-LD uses `dangerouslySetInnerHTML` with CMS-controlled `page.metaDesc`. `JSON.stringify` alone does not neutralize a `</script>` terminator in HTML script context. The audit branch now uses a fixed, static JSON-LD string that contains no CMS-controlled fields, removing the dynamic script-context injection source entirely.
- A GitHub Actions shell-injection pattern in `.github/workflows/code-review.yml` interpolated changed-file names into a `run:` command. The audit branch now transports the file list through a base64 environment variable and decodes it in the Node script, rather than inserting untrusted paths into shell source.
- Mutable GitHub Action tags were reported across existing workflow files. These remain to be pinned to reviewed full commit SHAs.
- `.npmrc` now sets `min-release-age=7`; the security workflow upgrades npm to 11.10.0 before dependency resolution so the policy is supported. Existing non-security workflows still need a consistent npm-version update.

The Semgrep workflow now excludes `.github` to avoid treating the known mutable-action-tag findings as application-code findings while the action pinning work is handled separately. It still scans application code. This is a scope adjustment, not a claim that workflow supply-chain findings are fixed.

### Dependency audit workflow correction

The first new dependency-audit job failed before reaching `npm audit`: `npm ci` reported that `package.json` and `package-lock.json` are out of sync (lock file contains older versions such as Next.js 14.2.35 / React 18.3.1 while package.json requests Next.js 15.5.26 / React 19). The audit job was changed to `npm install --ignore-scripts` so it can resolve the declared dependency tree and run the advisory audit. The committed lockfile remains stale and must be regenerated and reviewed as a separate dependency maintenance change.

### Security automation added in audit branch

`.github/workflows/security.yml` now runs:
- `npm audit --audit-level=high` using the locked dependency tree (blocking on high/critical advisories).
- Semgrep OWASP Top 10 and JavaScript static analysis.
- Gitleaks over full Git history to detect committed secrets.

These checks are committed to the audit branch only. Initial GitHub Actions results: full-history Gitleaks secret scan passed with no reported secret findings; the existing CI workflow passed type-check, lint, and tests. The new Semgrep OWASP scan and blocking npm audit were still running at the time of this report update; do not treat them as passed. The separate Tests workflow was also still running.

## Immediate priorities

1. Complete route-by-route MFA bypass testing for the new server-side gate.
2. Bind registration/profile creation to verified Supabase identity.
3. Fix password-reset token storage and atomic consumption.
4. Finish upload validation/size enforcement and audit private-file download paths.
5. Run provider/dashboard checks and restore tests.
6. Run the complete automated test/build suite and review PR #59 before merge.

## Change control

No application-code changes in this audit branch have been merged into `main`. However, the Vercel Preview build ran the migration script against the shared Supabase production database and applied `20261030140000_security_function_privileges`; the application migration was verified as complete. This was an unintended consequence of Preview/Production sharing database environment variables. The audit branch now adds a Vercel Preview migration guard, but that guard is not deployed until reviewed and merged. PR #59 remains a draft pending CI and security review.
