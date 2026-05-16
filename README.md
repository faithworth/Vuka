# VUKA — Rise 🎵

Premium independent music commerce platform for producers and artists.

## Quick Start (Local Dev — No Domain Needed)

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment
Copy `.env.local` and fill in your keys (see below for free accounts).

### 3. Push database schema
```bash
npm run db:push
```

### 4. Seed test data (optional)
```bash
npm run db:seed
```

### 5. Run dev server
```bash
npm run dev
```
Open http://localhost:3000

---

## Free Services to Set Up (Test Mode — No Payment Needed)

| Service | What For | Sign Up |
|---------|----------|---------|
| **Supabase** | Database + Auth | https://supabase.com |
| **Stripe** | Payments (test mode) | https://stripe.com |
| **PayFast** | ZAR payments (sandbox) | https://www.payfast.co.za/registration |
| **Cloudflare R2** | Audio file storage | https://cloudflare.com |
| **Resend** | Emails (3k/month free) | https://resend.com |

### Stripe Test Cards
- `4242 4242 4242 4242` — any future date, any CVC
- `4000 0056 0000 0008` — test 3D Secure

### PayFast Sandbox
- Use merchant ID `10000100`, key `46f0cd694581a`
- Set `PAYFAST_SANDBOX=true` in `.env.local`

### Stripe Webhooks (local)
```bash
npm install -g stripe
stripe listen --forward-to localhost:3000/api/checkout/stripe/webhook
```
Copy the webhook secret shown → paste into `STRIPE_WEBHOOK_SECRET`

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    → / (Landing)
│   ├── store/
│   │   ├── page.tsx                → /store (All beats + releases)
│   │   ├── beats/page.tsx          → /store/beats
│   │   └── releases/page.tsx       → /store/releases
│   ├── artist/[slug]/page.tsx      → /artist/dj-vusi
│   ├── beat/[slug]/page.tsx        → /beat/fire-beat-2024
│   ├── release/[slug]/page.tsx     → /release/my-ep
│   ├── support/[artistSlug]/       → /support/dj-vusi
│   ├── download/[token]/           → /download/abc123 (token-gated)
│   ├── redownload/                 → Re-download portal
│   ├── checkout/
│   │   ├── success/                → Post-payment success
│   │   └── connect-return/         → Stripe Connect callback
│   ├── auth/
│   │   ├── login/
│   │   ├── register/
│   │   └── verify/
│   ├── dashboard/
│   │   ├── page.tsx                → Revenue overview
│   │   ├── beats/                  → Manage beats
│   │   ├── releases/               → Manage releases
│   │   ├── uploads/                → Upload new content
│   │   ├── support/                → Fan support inbox
│   │   ├── goals/                  → Funding goals
│   │   ├── purchases/              → All sales
│   │   ├── payouts/                → Stripe payouts
│   │   └── settings/               → Profile + payment settings
│   └── api/
│       ├── store/beats             → GET beats with filters
│       ├── store/releases          → GET releases with filters
│       ├── artist/[slug]/          → GET artist profile
│       ├── beats/upload            → POST upload beat
│       ├── releases/upload         → POST upload release
│       ├── checkout/stripe/        → Stripe checkout + webhook
│       ├── checkout/payfast/       → PayFast initiate + ITN webhook
│       ├── download/[token]        → Secure download API
│       ├── redownload              → Re-download email request
│       ├── support/                → Fan support payments
│       ├── connect/onboard         → Stripe Connect onboarding
│       ├── dashboard/              → All dashboard data APIs
│       └── wishlist                → Add/remove wishlist items
├── components/
│   ├── BeatCard.tsx
│   ├── BuyModal.tsx
│   ├── LandingPage.tsx
│   ├── Navbar.tsx
│   ├── NowPlayingBar.tsx
│   └── StoreClient.tsx
└── lib/
    ├── auth.ts       → Supabase server auth helpers
    ├── emails.ts     → Resend email functions (all 6 templates)
    ├── payfast.ts    → PayFast ITN validation + form builder
    ├── pdf.ts        → PDF license + receipt generation
    ├── prisma.ts     → Prisma client singleton
    ├── r2.ts         → Cloudflare R2 upload/download helpers
    ├── stripe.ts     → Stripe + Connect helpers
    ├── supabase.ts   → Supabase client (browser + server)
    └── utils.ts      → formatCurrency, slugify, cuid, etc.
```

---

## Payment Flows

### Stripe (International)
1. User clicks Buy → `POST /api/checkout/stripe/create-session`
2. Redirect to Stripe Checkout
3. Stripe fires webhook → `POST /api/checkout/stripe/webhook`
   - Confirms purchase in DB
   - Generates PDF license (beats)
   - Sends confirmation email with download link
4. User lands on `/checkout/success`

### PayFast (South Africa - ZAR)
1. User clicks Buy (PayFast) → `POST /api/checkout/payfast/initiate`
2. Server builds signed form → browser POSTs to PayFast
3. PayFast fires ITN → `POST /api/checkout/payfast/notify`
   - Validates signature + IP + amount
   - Same post-payment flow as Stripe

### Downloads
- Token-gated: each purchase gets a unique `downloadToken`
- Valid 30 days, max 5 downloads
- Returns signed R2 URLs (expire 1 hour)
- Re-download portal at `/redownload` (email lookup)

---

## Deploying to Vercel

1. Push to GitHub
2. Import to Vercel
3. Add all env vars from `.env.local`
4. Set `NEXT_PUBLIC_APP_URL=https://your-domain.com`
5. Add Stripe webhook endpoint: `https://your-domain.com/api/checkout/stripe/webhook`
6. Add PayFast notify URL: `https://your-domain.com/api/checkout/payfast/notify`

---

## South African Micro-copy Used Throughout

| Generic | Vuka |
|---------|------|
| Confirm | Yebo |
| Error | Eish — |
| Success | Sharp! |
| Loading | Just now… |
| Support sent | You just made someone's day |
| Purchased | It's yours now, download below |
