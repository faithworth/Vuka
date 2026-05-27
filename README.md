# Vuka — 05 Apps + Dashboard

**What lives here:**
ALL frontend pages and UI components — artist profiles, store pages,
beat pages, dashboards (beats, releases, payouts, settings, goals),
checkout flows, download pages, admin panel, fan hub, industry hub,
legal pages. Also the dashboard API routes that feed directly into the pages.

**Key files:**
- `src/components/` — BeatCard, BuyModal, Navbar, NowPlayingBar, StoreClient, LandingPage
- `src/app/dashboard/` — artist dashboard pages (beats, releases, payouts, settings…)
- `src/app/artist/[slug]/` — public artist profile page
- `src/app/beat/[slug]/` — beat detail + purchase page
- `src/app/store/` — public beat + release store pages
- `src/app/admin/` — admin panel page
- `src/app/auth/` — login, register, verify pages
- `src/app/checkout/` — success + Stripe Connect return pages
- `src/app/legal/` — terms, privacy, refunds, DMCA pages
- `src/app/api/dashboard/` — beats, releases, settings, QR, uploads

**Note:** This package contains the visual shell. The API calls it makes
hit routes defined in packages 02–04. In the deployed monorepo all
packages are merged — this split is for reading/editing clarity only.
