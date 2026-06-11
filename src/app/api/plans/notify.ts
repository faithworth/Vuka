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
 * This file intentionally exports nothing and must not be removed — it exists
 * to prevent import-resolution errors if any tooling mistakenly indexes it.
 * Do NOT import from this file in any new code.
 *
 * PayFast ITN routing reference (by m_payment_id prefix):
 *   (bare purchase id) → /api/checkout/payfast/notify     — Beat/release purchases
 *   sub_<id>           → /api/plans/notify/route.ts        — Artist plan subscriptions
 *   mkt_<id>           → /api/marketplace/checkout/notify  — Marketplace service orders
 *   sup_<id>           → /api/support/payfast-notify       — Tip/support payments
 *   iso_<id>           → /api/webhooks/payfast             — Industry service orders
 *   mem_<id>           → /api/creator/memberships/notify   — Fan memberships
 */

export {};
