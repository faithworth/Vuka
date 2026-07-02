# Vuka — Complete Production Hardening Deployment Guide

## What this package contains

This is the **complete** set of files for the production hardening pass.
It includes all files from `vuka-fixes.zip` (Fixes 1–10) plus all additional
fixes and new systems identified in the master audit.

---

## Files in this package

### Already-fixed files (from vuka-fixes.zip — deploy as-is)

| File | Fix |
|------|-----|
| `src/app/api/social/feed/route.ts` | Fix 1 — Feed lt→lte + shape mismatch |
| `src/app/api/industry/browse/route.ts` | Fix 2 — Industry browse auth |
| `src/app/dashboard/services/page.tsx` | Fix 3 — Artist services dashboard (NEW) |
| `src/app/dashboard/layout.tsx` | Fix 4 — Services + Messages nav |
| `src/app/dashboard/videos/page.tsx` | Fix 5 — Video/sample upload page (NEW) |
| `src/app/services/page.tsx` | Fix 6 — Message button on services |
| `src/app/industry-dashboard/page.tsx` | Fix 7 — Industry inquiry reply |
| `src/app/api/creator/storefront/route.ts` | Fix 8 — tagline→headline mapping |
| `src/app/dashboard/memberships/page.tsx` | Fix 9 — price→priceMonthly |
| `src/app/dashboard/releases/page.tsx` | Fix 10 — ISRC/UPC display |
| `src/app/api/releases/upload/route.ts` | Fix 10 — ISRC/UPC generation |
| `prisma/migrations/add_isrc_upc.sql` | Fix 10 — DB migration |
| `prisma/schema_additions.txt` | Fix 10 — Schema guide |

### New files (from this audit pass)

| File | What it fixes |
|------|--------------|
| `src/app/dashboard/payouts/page.tsx` | Stripe removed, SA payments UI (PayFast/Ozow/Yoco/EFT) |
| `src/app/dashboard/settings/page.tsx` | Stripe removed, SA bank account section |
| `src/app/notifications/page.tsx` | Notifications now clickable with linkType routing |
| `src/app/fan/page.tsx` | Inline notifications now clickable |
| `src/app/api/dashboard/payouts/route.ts` | Stripe crash fix, PayFast-only connected object |
| `src/app/api/social/notifications/route.ts` | GET + PATCH notifications API |
| `src/app/api/payouts/bank-accounts/route.ts` | SA bank account CRUD |
| `src/app/api/auth/me/route.ts` | DB-authoritative role, ADMIN_EMAIL elevation |
| `src/app/api/webhooks/payfast/route.ts` | PayFast ITN webhook — real payment verification |
| `src/lib/distribution.ts` | ISRC/UPC generators + DSP delivery architecture |
| `src/lib/services/notification.service.ts` | Centralized notification creation |
| `src/lib/services/transaction.service.ts` | Atomic purchase transactions |
| `src/lib/services/payfast.service.ts` | PayFast payment URL + ITN verification |
| `prisma/schema_complete_additions.txt` | Complete schema guide (all models) |
| `prisma/migrations/add_production_hardening.sql` | Full DB migration SQL |

---

## Deployment checklist

### Step 1 — Schema migration (REQUIRED FIRST)

```bash
# Option A — Prisma migrate (recommended, tracks history)
npx prisma migrate dev --name vuka_production_hardening

# Option B — Direct SQL (if you're on Supabase and prefer SQL migrations)
# Run the SQL in prisma/migrations/add_production_hardening.sql via Supabase SQL editor
# Then also run prisma/migrations/add_isrc_upc.sql if not already applied

# After migration:
npx prisma generate
```

Add these fields to `prisma/schema.prisma` **before** migrating
(see `prisma/schema_complete_additions.txt` for the exact lines):

- `Release.upc String?`
- `Track.isrc String?`
- `Artist.payfastMerchant String?`
- `Artist.currency String @default("ZAR")`
- `Artist.isVerified Boolean @default(false)`
- `Artist.coverUrl String?`
- `ArtistPost.isPublished Boolean @default(true)`
- `ArtistPost.publishedAt DateTime @default(now())`
- `ArtistPost.likeCount Int @default(0)`, `.commentCount`, `.repostCount`, `.isPinned`
- `ArtistPost.linkUrl String?`, `.linkType String?`, `.linkItemId String?`
- `Notification` model (full — see schema_complete_additions.txt)
- `ArtistBankAccount` model (full)
- `PayoutRequest` model (full)

### Step 2 — Environment variables

Add these to Vercel (Settings → Environment Variables):

```
# Required — remove these if set, or leave unset:
# STRIPE_SECRET_KEY         ← DELETE or leave unset
# STRIPE_WEBHOOK_SECRET     ← DELETE or leave unset

# PayFast (your platform account, not the artist's)
PAYFAST_MERCHANT_ID=your_platform_merchant_id
PAYFAST_MERCHANT_KEY=your_platform_merchant_key
PAYFAST_PASSPHRASE=your_passphrase_if_set
PAYFAST_SANDBOX=true          # set to false in production

# Admin
ADMIN_EMAIL=your@email.com    # this account becomes OWNER automatically

# App URL (already set — verify it's correct)
NEXT_PUBLIC_APP_URL=https://vukamusic.com
```

### Step 3 — Copy all files

```bash
# From this package root, copy to your project root:
cp -r src/ /path/to/your/vuka/src/
cp -r prisma/ /path/to/your/vuka/prisma/
```

### Step 4 — Remove Stripe imports

Search your codebase for any remaining Stripe references and remove them:

```bash
grep -r "from 'stripe'" src/ --include="*.ts" --include="*.tsx"
grep -r "STRIPE_SECRET_KEY" src/ --include="*.ts" --include="*.tsx"
grep -r "stripeAccountId" src/ --include="*.ts" --include="*.tsx" --include="*.prisma"
```

For any files that still import Stripe: remove the import and replace the
functionality with the PayFast service (`src/lib/services/payfast.service.ts`).

### Step 5 — Deploy

```bash
git add -A
git commit -m "chore: vuka production hardening — SA payments, notifications, ISRC/UPC, transactions"
git push
# Vercel auto-deploys on push
```

### Step 6 — Verify after deploy

- [ ] Log in as your ADMIN_EMAIL account → should land on `/admin`
- [ ] Go to `/dashboard/payouts` → should show PayFast, Ozow, Yoco, EFT panels (no Stripe)
- [ ] Go to `/dashboard/settings` → should show PayFast + SA Bank Account section (no Stripe)
- [ ] Add a PayFast Merchant ID in settings → payouts page should show "✓ Connected"
- [ ] Add a SA bank account → settings + payouts should show it
- [ ] Follow an artist and check `/notifications` → notifications should be clickable
- [ ] Post something as an artist → followers should get notifications
- [ ] Upload a release → should show UPC; each track should show ISRC
- [ ] Go to `/services` as an artist → should see Message button on each service card
- [ ] Go to `/industry-dashboard` as industry user → should see reply buttons on inquiries
- [ ] Check `/dashboard` sidebar → Services and Messages links should be visible

---

## Architecture decisions

### Why Stripe was removed
PayFast is the leading SA payment gateway with direct ZAR support, instant EFT,
and no need for a US entity. Stripe Connect in SA requires complex onboarding and
doesn't support direct ZAR payouts to SA bank accounts as cleanly as PayFast does.

### Why notifications are not sent via email yet
The notification system uses in-platform notifications (DB-backed). Email delivery
via Resend/Postmark is the next phase — the `NotificationService` is designed to
be extended with email sending without changing any call sites.

### Why ISRC/UPC are auto-generated
South African artists on Vuka deserve real ISRC codes. The format `ZA-ZAV-YY-NNNNN`
uses the SA country code. Register with RISA (Recording Industry of South Africa)
for a proper registrant code to replace `ZAV`. UPCs use a placeholder GS1 prefix —
register with GS1 South Africa for production.

### Why transactions use Prisma $transaction
A purchase must atomically create: the Purchase record, increment the sales counter,
and create the ArtistPayout record. If any step fails, the whole thing rolls back.
This prevents partial states where an artist's balance shows a sale that didn't
create a payout record.
