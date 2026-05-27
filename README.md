# Vuka — 03 Distribution Engine

**What lives here:**
Distribution releases (draft→submit→live), DSP delivery stubs, analytics,
play tracking, discovery/search/trending, store browse APIs.

**Key files:**
- `src/lib/distribution.ts` — release lifecycle, ISRC/UPC helpers, DSP adapter stubs
- `src/lib/analytics.ts` — daily rollup helpers, geo tracking
- `src/lib/discovery.ts` — search index, trending snapshots
- `src/app/api/distribution/` — release CRUD + submit + rollback
- `src/app/api/analytics/` — audience, revenue, plays, engagement
- `src/app/api/discovery/` — search, browse, trending, recommendations
- `src/app/api/store/` — public store browse (beats, releases, artists)
- `src/app/api/play/` — play count increment + engagement event

**DSP Status:** adapter stubs exist; real Spotify/Apple Music API calls
are not wired yet. All statuses reflect actual DB state — never fake "Live".
