# VUKA — Rise 🎵

Africa's independent music commerce platform. Artists sell beats and releases directly to fans. Zero platform fee. Money goes straight to your bank.

**Live at:** https://vuka-distro.vercel.app

---

## What's Built

### For Artists
- Register and create a public artist profile (`/artist/your-name`)
- Upload beats with artwork, preview MP3, full MP3/WAV
- Upload releases (singles, EPs, albums, mixtapes) with multiple tracks
- Set prices per license type: Basic, Premium, Exclusive
- Fan support page — fans pay what they want to support you directly
- Funding goals with progress tracking
- QR code for your store page
- Dashboard: revenue overview, sales history, payout tracking

### For Fans / Buyers
- Browse all beats and releases at `/store`
- Preview beats before buying
- Buy with PayFast (ZAR — SA buyers)
- Token-gated downloads after purchase (valid 30 days, max 5 downloads)
- Re-download portal at `/redownload` (email lookup)
- Wishlist, follow artists, fan library

### Payment Flow
```
Buyer clicks Buy
  → POST /api/checkout/payfast/initiate
  → Signed form POSTed to payfast.co.za/eng/process
  → Buyer pays on PayFast
  → PayFast fires ITN → POST /api/checkout/payfast/notify
  → Purchase confirmed in DB
  → PDF license generated
  → Email sent to buyer with download link
  → Money lands in artist's PayFast account
```

### Zero Platform Fee
Artists keep 100% of every sale. Each artist connects their own PayFast Merchant ID in their dashboard settings — payments go directly to them with no middleman.

---

## Tech Stack

| Layer | Service |
|-------|---------|
| Framework | Next.js 14 (App Router) |
| Database | PostgreSQL via Supabase + Prisma ORM |
| Auth | Supabase Auth (email/password) |
| File Storage | Cloudflare R2 (direct browser → R2 uploads via presigned URLs) |
| Payments | PayFast (ZAR, SA buyers) |
| Emails | Resend |
| Hosting | Vercel |

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
│   ├── artist/[slug]/page.tsx      → /artist/faithworth
│   ├── beat/[slug]/page.tsx        → /beat/iced-out
│   ├── release/[slug]/page.tsx     → /release/my-ep
│   ├── support/[artistSlug]/       → /support/faithworth
│   ├── download/[token]/           → /download/abc123 (token-gated)
│   ├── redownload/                 → Re-download portal
│   ├── checkout/
│   │   └── success/                → Post-payment success page
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
│   │   ├── payouts/                → Payout history
│   │   └── settings/               → Profile + PayFast settings
│   └── api/
│       ├── store/beats             → GET beats with filters
│       ├── store/releases          → GET releases with filters
│       ├── artist/[slug]/          → GET artist profile
│       ├── beats/upload            → POST/PATCH upload beat (presigned R2)
│       ├── releases/upload         → POST/PATCH upload release
│       ├── checkout/payfast/       → PayFast initiate + ITN notify
│       ├── download/[token]        → Secure download API (signed R2 URLs)
│       ├── redownload              → Re-download email lookup
│       ├── support/                → Fan support payments
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
    ├── emails.ts     → Resend email templates
    ├── payfast.ts    → PayFast signature builder + ITN validator
    ├── pdf.ts        → PDF license + receipt generation
    ├── prisma.ts     → Prisma client singleton
    ├── r2.ts         → Cloudflare R2 presigned URL helpers
    ├── supabase.ts   → Supabase client (browser + server)
    └── utils.ts      → formatCurrency, slugify, etc.
```

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=                        # port 6543 with ?pgbouncer=true
DIRECT_URL=                          # port 5432

# Cloudflare R2
CLOUDFLARE_R2_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET_NAME=vuka-audio
CLOUDFLARE_R2_PUBLIC_URL=            # https://pub-XXX.r2.dev

# PayFast (live)
PAYFAST_MERCHANT_ID=                 # your merchant ID from payfast.co.za
PAYFAST_MERCHANT_KEY=                # your merchant key
PAYFAST_PASSPHRASE=                  # your security passphrase
PAYFAST_SANDBOX=false

# PayFast (sandbox — for local dev/testing only)
PAYFAST_SANDBOX_MERCHANT_ID=10000100
PAYFAST_SANDBOX_MERCHANT_KEY=46f0cd694581a
PAYFAST_SANDBOX_PASSPHRASE=

# Email
RESEND_API_KEY=
EMAIL_FROM=noreply@yourdomain.com

# App
NEXT_PUBLIC_APP_URL=https://vuka-distro.vercel.app
```

---

## R2 CORS Policy

Required for direct browser → R2 uploads to work. Set this in your R2 bucket settings:

```json
[
  {
    "AllowedOrigins": ["https://vuka-distro.vercel.app", "http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## Local Development

```bash
npm install
cp .env.local.example .env.local   # fill in your keys
npm run db:push                     # sync schema to Supabase
npm run dev                         # start at http://localhost:3000
```

For local PayFast testing, set `PAYFAST_SANDBOX=true` and use ngrok to expose your local server (PayFast ITN can't reach localhost):
```bash
ngrok http 3000
# update NEXT_PUBLIC_APP_URL to your ngrok URL
```

---

## Deploying

```bash
git add .
git commit -m "your message"
git push
# Vercel auto-deploys on push
```

After adding new environment variables in Vercel → always redeploy for them to take effect.

---

## PayFast ITN Notify URL

Set this in your PayFast dashboard under Developer Settings → Notification Settings:
```
https://vuka-distro.vercel.app/api/checkout/payfast/notify
```

---

## Artist Onboarding

1. Register at `/auth/register`
2. Go to `/dashboard/settings`
3. Enter PayFast Merchant ID (from my.payfast.io → Developer Settings)
4. Upload profile photo and cover image
5. Fill in bio, city, genre tags
6. Upload beats or releases at `/dashboard/uploads`
7. Share your artist page: `vuka-distro.vercel.app/artist/your-name`

---

## Known Limitations

- PayFast only (no Stripe — Stripe doesn't support SA-registered businesses directly)
- PayFast account must be fully verified before payments can be received
- File uploads go directly browser → R2 via presigned URLs (bypasses Vercel 4.5MB limit)

---

*Vuka — Rise. Built in Kroonstad, Free State, South Africa.*
