# VUKA — Doppler Secrets Management
## Phase 11 — Infrastructure & Deployment

Doppler syncs environment variables across all environments (dev, staging, production) and injects them at build/runtime via the Vercel integration.

---

## 1. Install Doppler CLI

```bash
# macOS
brew install dopplerhq/cli/doppler

# Linux
curl -Ls --tlsv1.2 --proto "=https" --retry 3 https://cli.doppler.com/install.sh | sh
```

## 2. Create a Vuka project

```bash
doppler login
doppler projects create vuka
doppler setup
```

## 3. Create environments

Doppler environments map to:
- `dev`        → your .env.local
- `staging`    → Vercel Preview deployments
- `production` → Vercel Production

```bash
doppler environments create staging --project vuka
doppler environments create production --project vuka
```

## 4. Seed variables from .env.example

```bash
# Copy all vars from .env.example into Doppler dev environment
doppler secrets upload .env.local --project vuka --config dev
```

## 5. Connect Doppler to Vercel

1. Install the Doppler Vercel integration: https://vercel.com/integrations/doppler
2. Link the `vuka` project to your Vercel project
3. Map: `staging` → Preview, `production` → Production
4. Click "Sync Now" — Doppler pushes all secrets to Vercel env vars

## 6. Use Doppler in local development (optional)

Instead of a .env.local file, run:

```bash
doppler run -- npm run dev
```

This injects secrets from Doppler at runtime (never written to disk).

---

## Required secrets per environment

See `.env.example` for the full list with descriptions.

### Minimum required (dev + production):
- `DATABASE_URL`, `DIRECT_URL`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `ADMIN_EMAIL`
- `CLOUDFLARE_R2_*` (5 variables)
- `RESEND_API_KEY`
- `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`
- `ENCRYPTION_KEY` (64-char hex: `openssl rand -hex 32`)
- `CRON_SECRET` (32+ chars: `openssl rand -base64 32`)

### Production-only additions:
- `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_HASH`
- `PAYPAL_CLIENT_SECRET`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `SENTRY_DSN`
- `NEXT_PUBLIC_POSTHOG_KEY`

---

## Rotating secrets

```bash
# Rotate ENCRYPTION_KEY (triggers re-encryption job — coordinate with team)
openssl rand -hex 32
doppler secrets set ENCRYPTION_KEY=<new_value> --project vuka --config production

# Rotate CRON_SECRET
openssl rand -base64 32
doppler secrets set CRON_SECRET=<new_value> --project vuka --config production
# Also update the secret in Vercel Cron config (vercel.json does not embed secrets)
```
