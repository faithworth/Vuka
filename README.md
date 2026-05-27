# Vuka — 02 Creator Economy

**What lives here:**
Payments (Stripe + PayFast checkout), payouts, bank accounts, subscriptions,
creator tiers, storefronts, licensing, invoices, beat/release uploads, downloads.

**Key files:**
- `src/lib/creator.ts` — subscription tiers + memberships
- `src/lib/payouts.ts` — payout request lifecycle
- `src/lib/licensing.ts` — beat license generation + verification
- `src/lib/invoices.ts` — invoice number + PDF generation
- `src/app/api/checkout/` — Stripe + PayFast checkout flows
- `src/app/api/payouts/` — payout requests + bank accounts + reconciliation
- `src/app/api/creator/` — tiers, memberships, storefront, content
- `src/app/api/licensing/` — beat licensing + verify endpoints
- `src/app/api/download/` — secure token-gated file downloads
