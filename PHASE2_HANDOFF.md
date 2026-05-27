# VUKA — Phase 2 Handoff Document
## Creator Economy + Distribution + Marketplace + Payout Expansion

---

## 1. COMPLETED SYSTEMS

### Distribution Engine (`src/lib/distribution.ts`)
- ✅ ISRC generation (ZA-ZAV-YY-NNNNN format, South African registrant)
- ✅ UPC generation (12-digit UPC-A with EAN-13 check digit; dev prefix — replace with GS1 SA prefix in production)
- ✅ Release metadata validation (required fields, artwork status, track checks, DSP allowlist)
- ✅ Status lifecycle: `draft → metadata_review → artwork_review → approved → scheduled → delivering → live → failed | takedown`
- ✅ Full status history logging (JSON append, timestamped)
- ✅ DSP delivery pipeline for: Spotify, Apple Music, YouTube Music, TikTok, Deezer, Audiomack, Amazon Music
- ✅ DDEx-like payload builder (structured for real DSP adapter plug-in)
- ✅ DSP delivery status lifecycle per DSP record
- ✅ Retry logic (max 3 retries per delivery, per release)
- ✅ Rollback / takedown support
- ✅ **BUG FIXED**: `initiateDeliveryPipeline` had a broken `upsert` using a fabricated compound ID. Replaced with `findFirst + create/update` pattern.

### Creator Economy (`src/lib/creator.ts`)
- ✅ Subscription tier CRUD (up to 5 tiers per artist)
- ✅ Monthly/yearly billing intervals
- ✅ Subscriber cap enforcement
- ✅ Membership lifecycle: create, cancel, renew
- ✅ Entitlement checking for exclusive content (tier-scoped access control)
- ✅ Creator analytics: active members, MRR breakdown, beat/release sales, pending payouts, revenue history
- ✅ Revenue record upsert (period-based, rolling aggregates)
- ✅ Storefront create/update/publish

### Beat Licensing Engine (`src/lib/licensing.ts`) — **NEW FILE**
- ✅ Three-tier license term definitions: `basic`, `premium`, `exclusive`
- ✅ License issuance from confirmed purchase (idempotent)
- ✅ Auto-marks beat as inactive after exclusive sale
- ✅ License verification (public, by license key)
- ✅ License revocation (DMCA/admin)
- ✅ PDF generation hook (stub — connects to existing `lib/pdf.ts`)
- ✅ License retrieval by purchaseId or beatId

### Marketplace Engine (`src/lib/marketplace.ts`)
- ✅ Service creation and listing with filters (category, search, pagination)
- ✅ Package-based order creation with self-order prevention
- ✅ 15% platform fee calculation + commission tracking
- ✅ Order acceptance (seller)
- ✅ Order delivery with deliverables (seller)
- ✅ Revision requests with cap enforcement (buyer)
- ✅ Order completion + auto-payout trigger (buyer)
- ✅ Dispute raising with evidence (either party)
- ✅ Review submission with rolling average update (buyer, post-completion)
- ✅ Revenue record rolling update on completion

### Payout Infrastructure (`src/lib/payouts.ts`)
- ✅ Payout request creation: PayFast, bank transfer, PayPal-ready
- ✅ Balance sweep of pending `ArtistPayout` records
- ✅ Collaborator split payouts (percentage-based, multi-recipient)
- ✅ Admin approve/process flow
- ✅ Provider routing stubs (PayFast, bank EFT, PayPal — real API hooks marked)
- ✅ Payout retry (max 3, with revert on failure)
- ✅ Rollback on failure (sweeps reverted to `pending`)
- ✅ Full reconciliation report (balance by status + recent requests)
- ✅ Bank account management (add/list/delete with masked account numbers)

### Business Infrastructure (`src/lib/invoices.ts`)
- ✅ Sequential invoice number generation (VK-YYYYMM-NNNN format)
- ✅ Invoice creation from confirmed purchases
- ✅ Invoice creation from completed marketplace orders
- ✅ Annual tax record generation (income breakdown by source)
- ✅ Platform commission reporting (by period, by source)
- ✅ VAT-ready structure (0% now; 15% when artist is VAT-registered)

---

## 2. MODIFIED FILES

| File | Change |
|---|---|
| `src/lib/distribution.ts` | Bug fix: DSP delivery `upsert` → `findFirst + create/update` |
| `prisma/schema.prisma` | Full Phase 2 schema (extends Phase 1, adds 14 new models) |

---

## 3. CREATED FILES

### Library
| File | Purpose |
|---|---|
| `src/lib/distribution.ts` | Distribution engine (from Phase 2 spec, with bug fix) |
| `src/lib/creator.ts` | Creator economy engine |
| `src/lib/marketplace.ts` | Marketplace engine |
| `src/lib/payouts.ts` | Payout infrastructure |
| `src/lib/invoices.ts` | Invoice + tax + commission |
| `src/lib/licensing.ts` | **NEW** — Beat licensing engine |
| `src/lib/transaction.patch-notes.ts` | Patch instructions for Phase 1 `transaction.ts` |

### API Routes
| Route File | Endpoint | Methods |
|---|---|---|
| `api/creator/tiers/route.ts` | `/api/creator/tiers` | GET, POST, PATCH |
| `api/creator/memberships/route.ts` | `/api/creator/memberships` | GET, POST, DELETE |
| `api/creator/content/route.ts` | `/api/creator/content` | GET, POST, PATCH, DELETE |
| `api/creator/storefront/route.ts` | `/api/creator/storefront` | GET, PATCH |
| `api/creator/analytics/route.ts` | `/api/creator/analytics` | GET |
| `api/distribution/releases/route.ts` | `/api/distribution/releases` | GET, POST, PATCH |
| `api/distribution/releases/[id]/tracks/route.ts` | `/api/distribution/releases/[id]/tracks` | GET, POST, DELETE |
| `api/distribution/releases/[id]/submit/route.ts` | `/api/distribution/releases/[id]/submit` | POST |
| `api/distribution/releases/[id]/rollback/route.ts` | `/api/distribution/releases/[id]/rollback` | POST |
| `api/distribution/admin/route.ts` | `/api/distribution/admin` | GET, POST |
| `api/marketplace/services/route.ts` | `/api/marketplace/services` | GET, POST, PATCH |
| `api/marketplace/orders/route.ts` | `/api/marketplace/orders` | GET, POST |
| `api/marketplace/orders/[id]/deliver/route.ts` | `/api/marketplace/orders/[id]/deliver` | POST |
| `api/marketplace/orders/[id]/revise/route.ts` | `/api/marketplace/orders/[id]/revise` | POST |
| `api/marketplace/orders/[id]/complete/route.ts` | `/api/marketplace/orders/[id]/complete` | POST |
| `api/marketplace/orders/[id]/dispute/route.ts` | `/api/marketplace/orders/[id]/dispute` | POST |
| `api/marketplace/orders/[id]/review/route.ts` | `/api/marketplace/orders/[id]/review` | POST |
| `api/payouts/request/route.ts` | `/api/payouts/request` | GET, POST, PATCH |
| `api/payouts/admin/route.ts` | `/api/payouts/admin` | GET, POST |
| `api/payouts/bank-accounts/route.ts` | `/api/payouts/bank-accounts` | GET, POST, DELETE |
| `api/payouts/reconciliation/route.ts` | `/api/payouts/reconciliation` | GET |
| `api/invoices/route.ts` | `/api/invoices` | GET, POST |
| `api/licensing/beat/route.ts` | `/api/licensing/beat` | GET, POST |
| `api/licensing/verify/route.ts` | `/api/licensing/verify` | GET (public) |

### Database
| File | Purpose |
|---|---|
| `prisma/schema.prisma` | Full Phase 2 schema |
| `prisma/migrations/phase2_creator_economy/migration.sql` | Safe incremental SQL (all IF NOT EXISTS) |

---

## 4. MIGRATIONS ADDED

**Migration name:** `phase2_creator_economy`
**File:** `prisma/migrations/phase2_creator_economy/migration.sql`

**New tables (14):**
1. `DistributionRelease` — music distribution releases
2. `DistributionTrack` — individual tracks on a release
3. `DSPDelivery` — per-DSP delivery status tracking
4. `CreatorSubscriptionTier` — fan subscription tiers
5. `CreatorMembership` — active fan memberships
6. `ExclusiveContent` — gated content for members
7. `CreatorStorefront` — artist storefront config
8. `MarketplaceService` — service listings
9. `MarketplaceOrder` — service orders
10. `OrderMilestone` — optional payment milestones
11. `MarketplaceDispute` — order disputes
12. `ServiceReview` — buyer reviews
13. `BeatLicense` — beat license records
14. `PayoutRequest` — payout requests with status lifecycle
15. `PayoutSplit` — collaborator split records
16. `ArtistBankAccount` — payout destinations
17. `Invoice` — sales invoices and receipts
18. `RevenueRecord` — monthly revenue aggregates
19. `TaxRecord` — annual tax records
20. `PlatformCommission` — platform fee tracking

**Run:**
```bash
npx prisma migrate dev --name phase2_creator_economy
# or for production:
npx prisma migrate deploy
```

---

## 5. UNRESOLVED ISSUES

### Critical (must fix before production)
| # | Issue | Location | Action Required |
|---|---|---|---|
| 1 | **ISRC format** — current format `ZA-ZAV-YY-NNNNN` is non-standard. Correct ISRC is `CC-XXX-YY-NNNNN` where CC=2 chars, XXX=3 chars, and all alphanumeric. Register with RISA (Recording Industry of South Africa) for a real registrant code. | `lib/distribution.ts:generateISRC` | Replace dev prefix with RISA-issued registrant code |
| 2 | **UPC prefix** — `860000000` is a dev placeholder. Real UPCs must be purchased from GS1 South Africa. | `lib/distribution.ts:generateUPC` | Purchase GS1 prefix; update `UPC_PREFIX` env var |
| 3 | **Bank account number encryption** — stored in plain text. Must encrypt with AES-256 before storing in production. | `lib/payouts.ts`, `api/payouts/bank-accounts` | Implement field-level encryption using `crypto` or a KMS |
| 4 | **DSP adapters are stubs** — all DSP deliveries currently mock a reference ID. No real API calls are made. | `lib/distribution.ts:submitToDSP` | Integrate Spotify for Artists API, Apple Music MusicKit, etc. per DSP |
| 5 | **PayFast/PayPal payout APIs are stubs** — `processPayoutRequest` generates mock `providerRef` only. | `lib/payouts.ts:processPayoutRequest` | Integrate PayFast Payout API and PayPal Payouts API |
| 6 | **License PDF generation is a stub** — `issueBeatLicense` sets `pdfUrl = ''`. | `lib/licensing.ts:issueBeatLicense` | Connect to `lib/pdf.ts`, generate license PDF, upload to R2 |
| 7 | **`transaction.ts` not patched** — license issuance and revenue record hooks need to be added to Phase 1's `confirmPurchase`. | `lib/transaction.patch-notes.ts` | Apply the two async hooks described in the patch notes file |

### Non-Critical (technical debt)
| # | Issue | Notes |
|---|---|---|
| 8 | `initiateDeliveryPipeline` creates DSP records synchronously; for large DSP lists this should be a background job | Queue with BullMQ or Vercel background functions |
| 9 | `generateInvoiceNumber` uses an in-memory counter (`invoiceCounter`) which resets on server restart; could create duplicate invoice numbers under load | Replace with a DB-level atomic sequence or `SELECT COUNT()` within a transaction |
| 10 | `checkContentEntitlement` makes 2 DB queries per call; no caching | Add short-lived cache (Redis/Upstash) in production |
| 11 | `MarketplaceOrder` has no payment verification gate — orders can be created without an actual payment being attached | Phase 3: Add `isPaid` check; gate order creation behind PayFast/Stripe webhook confirmation |
| 12 | Artist bank account `accountNumber` is returned from GET (even masked) — should not be returned at all; only used at payout dispatch time | Refactor GET to omit `accountNumber` entirely |

---

## 6. REMAINING ARCHITECTURE TASKS (Phase 3 Scope)

### Webhook Integration
- PayFast ITN handler for marketplace order payments (`/api/payfast/notify`)
- Stripe webhook for recurring membership billing
- PayFast recurring token handling for `CreatorMembership.payfastToken`

### Real DSP Adapter Layer
```
src/lib/dsp/
  spotify.ts        — Spotify for Artists API
  apple_music.ts    — Apple MusicKit / iTunes Connect
  youtube_music.ts  — YouTube Music API (via CMS)
  tiktok.ts         — TikTok SoundOn API
  deezer.ts         — Deezer Backstage API
  audiomack.ts      — Audiomack API
  amazon_music.ts   — Amazon Music for Artists API
  index.ts          — Router: DSP name → adapter
```

### Scheduled Release Processing
- Cron job: check `DistributionRelease` where `status = 'scheduled'` and `scheduledDate <= now()`
- Trigger `initiateDeliveryPipeline` automatically

### Membership Billing Engine
- Cron job: check `CreatorMembership` where `currentPeriodEnd <= now() + 3 days`
- Send renewal reminder emails
- Attempt charge via PayFast recurring token
- Update or expire membership on failure

### PDF License Generation
- Connect `lib/licensing.ts:issueBeatLicense` → `lib/pdf.ts`
- Design license PDF template (artist branding, usage terms, QR code for verify URL)
- Upload to R2 and update `BeatLicense.pdfUrl` + `Purchase.licenseUrl`

### Admin Dispute Resolution
- `PATCH /api/marketplace/admin/disputes` — resolve in buyer/seller favor
- Trigger refund or payout on resolution

### Creator Storefront Frontend
- `/[artistSlug]/store` — public-facing storefront page
- Embed tiers, beats, releases, marketplace services
- Membership checkout flow

### Search + Discovery
- Marketplace search with full-text on `title` + `description`
- Beat catalog search (already partially in Phase 1)
- Add `pg_trgm` extension or Typesense for fuzzy search

### Analytics Dashboards (frontend)
- Revenue chart (monthly, by source)
- Membership growth chart
- DSP delivery status per release
- Marketplace conversion funnel

---

## 7. EXACT HANDOFF STATE FOR PHASE 3

### What's live and safe to build on
```
✅ Auth system (Phase 1 — hardened)
✅ Payment collection: PayFast + Stripe (Phase 1)
✅ Beat/release/video/sample transactions (Phase 1)
✅ Download token system (Phase 1)
✅ DMCA + admin moderation (Phase 1)
✅ Email notifications (Phase 1)
✅ R2 file storage (Phase 1)

✅ Distribution release management (Phase 2)
✅ Creator subscription tiers + memberships (Phase 2)
✅ Exclusive content gating (Phase 2)
✅ Creator storefronts (Phase 2)
✅ Creator analytics + revenue records (Phase 2)
✅ Beat licensing engine (Phase 2)
✅ Marketplace service + order lifecycle (Phase 2)
✅ Payout request + split + reconciliation (Phase 2)
✅ Invoice + tax record + commission tracking (Phase 2)
```

### What Phase 3 must complete before launch
```
🔴 Real DSP delivery adapters (currently all stubs)
🔴 Real payout disbursement (PayFast Payout API / bank EFT)
🔴 transaction.ts patch (license + revenue record hooks)
🔴 Bank account number encryption
🔴 PayFast recurring billing for memberships
🔴 License PDF generation
🔴 Scheduled release cron job
🔴 Marketplace payment verification gate
```

### Environment variables needed for Phase 2
```env
ISRC_REGISTRANT=ZAV           # Replace with RISA-issued code
UPC_PREFIX=860000000          # Replace with GS1 SA-issued prefix
# All Phase 1 vars remain required
```

---

*Phase 2 completed. Stop.*
