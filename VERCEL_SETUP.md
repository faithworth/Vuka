# VUKA — Vercel Deployment Guide
## Phase 11 — Infrastructure & Deployment

---

## Initial Setup

### 1. Import project to Vercel

```bash
npm install -g vercel
vercel login
vercel link   # link to existing project or create new
```

Or via the Vercel dashboard: New Project → Import Git Repository.

### 2. Set Framework

- Framework Preset: **Next.js**
- Root Directory: `.` (monorepo root)
- Build Command: `node scripts/migrate.js && npx prisma generate && next build`
- Install Command: `npm install`
- Output Directory: `.next`

### 3. Set Region

In Project Settings → Functions:
- Default Region: **jnb1** (Johannesburg)

This ensures minimum latency for South African users.

---

## Environment Variables

**Option A — via Doppler integration (recommended):**
See `DOPPLER_SETUP.md`.

**Option B — manual setup:**
Go to Project Settings → Environment Variables and add all variables from `.env.example`.

Required for build to succeed:
```
DATABASE_URL
DIRECT_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL
ADMIN_EMAIL
CLOUDFLARE_R2_ACCOUNT_ID
CLOUDFLARE_R2_ACCESS_KEY_ID
CLOUDFLARE_R2_SECRET_ACCESS_KEY
CLOUDFLARE_R2_BUCKET_NAME
CLOUDFLARE_R2_PUBLIC_URL
RESEND_API_KEY
PAYFAST_MERCHANT_ID
PAYFAST_MERCHANT_KEY
PAYFAST_PASSPHRASE
ENCRYPTION_KEY
CRON_SECRET
```

---

## Domain Configuration

1. Go to Project Settings → Domains
2. Add `www.vuka.app` (primary)
3. Add `vuka.app` → redirects to `www.vuka.app`
4. Vercel will provision SSL certificates automatically

---

## Cron Jobs

Vercel Cron is pre-configured in `vercel.json`. Verify the cron jobs are active:

1. Go to Project → Cron Jobs tab
2. Confirm these are enabled:
   - `0 2 * * *` — search_sync
   - `0 3 * * *` — trending
   - `0 4 * * *` — milestones
   - `0 5 * * *` — cleanup
   - `*/30 * * * *` — notify_live
   - `0 */6 * * *` — distribution_retry
   - `0 9 * * 1-5` — payout_process (weekdays 9am UTC)

3. Set the `CRON_SECRET` environment variable
4. Vercel automatically injects the secret as the `Authorization: Bearer` header

---

## GitHub Actions Secrets

Add these to your GitHub repository (Settings → Secrets → Actions):

| Secret | Value |
|--------|-------|
| `VERCEL_TOKEN` | From Vercel Account Settings → Tokens |
| `VERCEL_ORG_ID` | From `.vercel/project.json` after `vercel link` |
| `VERCEL_PROJECT_ID` | From `.vercel/project.json` |
| `DATABASE_URL` | Production DB connection string |
| `DIRECT_URL` | Production direct DB connection |
| `SENTRY_AUTH_TOKEN` | From Sentry Settings → Auth Tokens |
| `SENTRY_ORG` | Your Sentry org slug |
| `BETTER_UPTIME_HEARTBEAT_URL` | From Better Uptime heartbeat monitor |

---

## Post-deployment Verification

After first deploy, verify these endpoints:

```bash
# Health check
curl https://www.vuka.app/api/health

# Expected:
# {"status":"ok","checks":{"db":"ok"},"durationMs":...}

# Cron check (use your CRON_SECRET)
curl -H "x-cron-secret: YOUR_CRON_SECRET" \
  "https://www.vuka.app/api/workers/cron?job=search_sync"
```

---

## Performance Targets (Lighthouse)

Run `npx lighthouse https://www.vuka.app` after deploy. Targets:
- Performance: ≥ 90
- Accessibility: ≥ 90
- Best Practices: ≥ 90
- SEO: ≥ 90
