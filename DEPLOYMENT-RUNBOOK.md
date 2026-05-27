# VUKA — Production Deployment Runbook
# Phase 5 Final Hardening
# ============================================================

## PRE-DEPLOYMENT CHECKLIST

### 1. Repository Setup
- [ ] Push ALL phase files to GitHub (main branch)
- [ ] Ensure .gitignore has: .env, .env.local, node_modules, .next
- [ ] Verify vercel.json is at the project root
- [ ] Verify next.config.js is at the project root
- [ ] Verify middleware.ts is at the project root

### 2. Supabase Setup
- [ ] Create a new Supabase project at supabase.com
- [ ] Go to Settings → Database → Connection string
  - Copy "Transaction" pooler URL → DATABASE_URL (port 6543, add ?pgbouncer=true)
  - Copy "Session" / direct URL → DIRECT_URL (port 5432)
- [ ] Go to Settings → API
  - Copy Project URL → NEXT_PUBLIC_SUPABASE_URL
  - Copy anon/public key → NEXT_PUBLIC_SUPABASE_ANON_KEY
  - Copy service_role key → SUPABASE_SERVICE_ROLE_KEY
- [ ] Enable Email auth in Authentication → Providers
- [ ] Disable "Confirm email" for faster testing (re-enable for production)
- [ ] Set Site URL in Authentication → URL Configuration to your Vercel URL

### 3. Cloudflare R2 Setup
- [ ] Create R2 bucket named "vuka-audio" (or your preferred name)
- [ ] Enable "Public access" on the bucket (for artwork/preview URLs)
- [ ] Create an API token: R2 → Manage R2 API Tokens → Create
  - Permissions: Object Read & Write
  - Specify bucket: vuka-audio
- [ ] Copy Account ID, Access Key ID, Secret Access Key
- [ ] Copy the R2.dev subdomain as CLOUDFLARE_R2_PUBLIC_URL

### 4. Resend Email Setup
- [ ] Create account at resend.com
- [ ] Verify your domain (follow DNS setup instructions)
- [ ] Create API key → copy as RESEND_API_KEY
- [ ] Set EMAIL_FROM="Vuka <noreply@yourdomain.com>" (use verified domain)
- [ ] Test with admin email endpoint after deploy

### 5. PayFast Setup
- [ ] Login to payfast.co.za → Account → Settings → Integration
- [ ] Copy Merchant ID → PAYFAST_MERCHANT_ID
- [ ] Copy Merchant Key → PAYFAST_MERCHANT_KEY
- [ ] Set a Passphrase → PAYFAST_PASSPHRASE
- [ ] Set notify_url in PayFast to: https://yourdomain.com/api/checkout/payfast/notify
- [ ] Start with PAYFAST_SANDBOX="true" for testing

### 6. Stripe Setup
- [ ] Create account at dashboard.stripe.com
- [ ] Copy Secret key → STRIPE_SECRET_KEY
- [ ] Copy Publishable key → NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
- [ ] Create webhook endpoint at: https://yourdomain.com/api/checkout/stripe/webhook
  - Events: checkout.session.completed
- [ ] Copy webhook signing secret → STRIPE_WEBHOOK_SECRET

### 7. Generate CRON_SECRET
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy the output → CRON_SECRET

---

## VERCEL DEPLOYMENT STEPS

### Step 1: Connect Repository
1. Go to vercel.com → New Project
2. Import your GitHub repository
3. Framework: Next.js (auto-detected)
4. Root Directory: (leave empty if vercel.json is at root)

### Step 2: Set Environment Variables
Go to Project → Settings → Environment Variables.
Add EVERY variable from .env.example with your real values.
Set them for: Production, Preview, and Development environments.

### Step 3: Deploy
Click Deploy. Vercel will run:
  npm install
  prisma generate
  prisma migrate deploy   ← runs all migrations automatically
  next build

### Step 4: Verify Deployment
1. Visit /api/health — should return {"status":"healthy",...}
2. Visit your domain — landing page should load
3. Try registering a test account
4. Try uploading a beat (as an artist)
5. Try purchasing a beat (as a fan)

### Step 5: Enable Vercel Cron Jobs
Cron jobs are defined in vercel.json and activate automatically on deploy.
Verify in Vercel Dashboard → Project → Cron Jobs tab.

---

## POST-DEPLOYMENT OPERATIONS

### Test Each System
```bash
# Health check
curl https://yourdomain.com/api/health

# Cron jobs (requires CRON_SECRET)
curl "https://yourdomain.com/api/workers/cron?job=search_sync" \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

### Set Webhook URLs in Stripe Dashboard
- Endpoint URL: https://yourdomain.com/api/checkout/stripe/webhook
- Events: checkout.session.completed

### Set Notify URL in PayFast
- ITN URL: https://yourdomain.com/api/checkout/payfast/notify

### Configure Supabase Auth Redirect
- Authentication → URL Configuration → Site URL: https://yourdomain.com
- Redirect URLs: https://yourdomain.com/api/auth/callback

---

## DATABASE MIGRATION (if updating existing deploy)

```bash
# DO NOT use db:push in production — always use migrate deploy
npx prisma migrate deploy

# The phase4_final_hardening migration is idempotent:
# All ALTER TABLE statements use IF NOT EXISTS
# All indexes use CONCURRENTLY IF NOT EXISTS
# Safe to re-run
```

---

## MONITORING

### Health Check URL
https://yourdomain.com/api/health

Set this as your uptime monitor URL in:
- UptimeRobot (free tier available)
- Vercel Analytics (built-in)
- Any external monitor

Response codes:
- 200 + "healthy" = all systems go
- 200 + "degraded" = DB ok, storage issue (non-critical)
- 503 + "unhealthy" = DB down — investigate immediately

### Logs
All structured logs appear in:
- Vercel Dashboard → Project → Functions → Logs
- Filter by traceId for request correlation

---

## ROLLBACK PROCEDURE

If a deployment breaks production:
1. Vercel Dashboard → Deployments → click previous green deployment → Promote
2. If migration broke the DB, run the rollback SQL manually in Supabase SQL editor
3. Note: Phase 4 migration is designed to be non-destructive (IF NOT EXISTS everywhere)

---

## ENVIRONMENT VARIABLE SECURITY RULES

NEVER commit to git:
- .env
- .env.local
- Any file containing real API keys

NEVER expose in client bundle:
- SUPABASE_SERVICE_ROLE_KEY
- STRIPE_SECRET_KEY
- RESEND_API_KEY
- PAYFAST_PASSPHRASE
- ADMIN_EMAIL
- CRON_SECRET
- DATABASE_URL
- DIRECT_URL

Only these should be NEXT_PUBLIC_*:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
- NEXT_PUBLIC_APP_URL
