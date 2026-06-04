# VUKA — Independent Music Distribution Platform

> Release. Distribute. Earn. Own.

African-first independent music distribution and artist ecosystem. Alternative to DistroKid, TuneCore, and Beatstars — built for scale.

## Tech Stack

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes (serverless), Prisma ORM
- **Database:** PostgreSQL via Supabase (with PgBouncer pooling)
- **Storage:** Cloudflare R2 + Workers (CDN audio delivery)
- **Payments:** PayFast (ZA) · Flutterwave (Africa) · PayPal (International)
- **Email:** Resend + React Email
- **Auth:** Supabase Auth (JWT)
- **Cache:** Upstash Redis (serverless)
- **Monitoring:** Sentry · PostHog · Better Uptime
- **Deployment:** Vercel (jnb1 region) + Cloudflare CDN

## Phases Complete

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | ✅ | Project scaffolding + database schema |
| 2 | ✅ | Authentication system (artist + admin passwordless) |
| 3 | ✅ | Artist dashboard |
| 4 | ✅ | Public-facing pages |
| 5 | ✅ | Admin dashboard |
| 6 | ✅ | Distribution engine |
| 7 | ✅ | Royalty & earnings processing |
| 8 | ✅ | Security implementation |
| 9 | ✅ | Email system (16 templates) |
| 10 | ✅ | Analytics system |
| **11** | ✅ | **Infrastructure & deployment** |

## Quick Start (Local Dev)

```bash
# 1. Start local services
docker compose up -d

# 2. Install dependencies
npm install

# 3. Copy env template
cp .env.example .env.local
# Edit .env.local with your credentials

# 4. Run migrations
npm run db:migrate

# 5. Seed database
npm run db:seed

# 6. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment

See:
- `VERCEL_SETUP.md` — Vercel deployment guide
- `CLOUDFLARE_SETUP.md` — CDN, R2, Workers setup
- `DOPPLER_SETUP.md` — Secrets management
- `.env.example` — All environment variables documented

## Architecture

```
User → Cloudflare CDN
         ├── Audio/Artwork → R2 via Workers (signed URLs, edge cached)
         └── App requests → Vercel (jnb1, Johannesburg)
                              ├── Next.js SSR + API Routes
                              ├── Supabase (PostgreSQL + Auth + Realtime)
                              ├── Upstash Redis (rate limiting)
                              └── Resend (transactional email)
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in all values.
See `DOPPLER_SETUP.md` for production secrets management.

## License

Private. All rights reserved.
