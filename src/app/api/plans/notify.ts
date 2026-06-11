/**
 * ⚠️  THIS FILE IS NOT A ROUTE AND IS NEVER SERVED.
 *
 * Next.js App Router only serves files named `route.ts` inside a directory.
 * This file (notify.ts, not route.ts) will NEVER be matched by the router
 * regardless of what URL is requested.
 *
 * The actual PayFast plan subscription ITN handler is at:
 *   src/app/api/plans/notify/route.ts
 *
 * This file is kept to prevent confusion from import errors and to document
 * the historical artefact. It exports nothing and does nothing.
 *
 * PayFast ITN routing reference (by m_payment_id prefix):
 *   (bare purchase id) → /api/checkout/payfast/notify     — Beat/release purchases
 *   sub_<id>           → /api/plans/notify/route.ts        — Artist plan subscriptions
 *   mkt_<id>           → /api/marketplace/checkout/notify  — Marketplace service orders
 *   sup_<id>           → /api/support/payfast-notify       — Tip/support payments
 *   iso_<id>           → /api/webhooks/payfast             — Industry service orders
 */

export {};
