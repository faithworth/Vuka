# Vuka — Split Repository Structure

This project is split into 5 packages for GitHub manageability.
Each package is under 100 files. Each contains the full prisma schema,
package.json, and shared lib files so it can be read and edited independently.

## The 5 Packages

| Package | Purpose | Files |
|---|---|---|
| `01-core-platform` | Auth, middleware, security, cron, admin, email/PDF/R2 libs | ~46 |
| `02-creator-economy` | Payments, payouts, licensing, downloads, subscriptions | ~69 |
| `03-distribution-engine` | Distribution, analytics, discovery, store browse | ~51 |
| `04-social-marketplace` | Feed, messaging, marketplace, moderation, industry | ~61 |
| `05-apps-dashboard` | All frontend pages, components, dashboard UI | ~74 |

## How to deploy

The **deployed app** is the merged `vuka-deploy-ready.zip` — all 5 packages
combined into one Next.js app. That is what goes on Vercel.

These 5 packages are for **reading, editing, and understanding** the codebase.
When you make a change in a package, apply the same change to the merged repo
before pushing to Vercel.

## GitHub repos recommended setup

Create 5 repos (or one monorepo with 5 folders):
- `vuka/01-core-platform`
- `vuka/02-creator-economy`
- `vuka/03-distribution-engine`
- `vuka/04-social-marketplace`
- `vuka/05-apps-dashboard`

Or push all 5 as folders inside one `vuka-platform` repo.
