# VUKA — Phase 3 Handoff Document
## Social + Discovery + Analytics + Messaging + Moderation

---

## 1. COMPLETED SYSTEMS

### Social Engine (`src/lib/social.ts`)
- **Feed** — cursor-paginated activity feed from followed artists (posts + new beats + new releases + reposts, merged and sorted by date)
- **Follows** — `followArtist`, `unfollowArtist`, `getFollowStatus` with duplicate guards and notification dispatch
- **Likes** — `toggleLike` on beats, releases, posts, comments; `getBulkLikeStatus` for batch UI rendering
- **Saves** — `toggleSave`, `getUserSaves` with paginated retrieval by type
- **Reposts** — `repost` with dedup check, note support, counter increment
- **Comments** — `createComment`, `getComments` (threaded via `parentId`), `deleteComment` (soft-delete with ownership check)
- **Notifications** — `createNotification`, `getNotifications`, `markNotificationsRead`, `getUnreadCount`; notification preference upsert
- **Engagement tracking** — `incrementDailyRollup` helper used by all engagement events; updates `AnalyticsDailyRollup` atomically

### Discovery Engine (`src/lib/discovery.ts`)
- **Search** — full-text search over `SearchIndex` (beats, releases, artists) with entity type + genre filters, scored and paginated
- **Autocomplete** — fast title-prefix search returning top 5 per type
- **Trending** — `getTrending` with fresh-vs-stale snapshot logic; falls back to on-the-fly computation; supports `hourly|daily|weekly` × `beats|artists|releases|tags`
- **Recommendations** — collaborative-style beat recommendations based on followed-artist genres; excludes already-purchased beats; artist recommendations based on genre overlap
- **Category browsing** — `getBrowseCategories` for all 18 VUKA genres with beat/artist counts; `getBeatsByGenre` paginated with sort options
- **Artist discovery** — `discoverArtists` with genre/country filters, sort by plays/followers/new

### Messaging (`src/lib/messaging.ts`)
- **Conversations** — deterministic two-party dedup, inbox with unread counts, archive per-participant
- **Messages** — send with attachment validation (type + size), cursor-paginated history, auto-mark-read on retrieval
- **Anti-spam** — 20 messages/minute rate limit with `SpamSignal` tracking
- **Soft delete** — messages soft-deleted (body replaced with `[Message deleted]`), visible to mod
- **Moderation hook** — `flagMessage` for admin/automated flagging

### Analytics Engine (`src/lib/analytics.ts`)
- **Creator dashboard** — 30-day (configurable) rollup with totals + daily chart series for plays, revenue, followers, engagement
- **Audience analytics** — follower growth chart, top countries, member + purchaser counts
- **Revenue analytics** — monthly breakdown by source (beats/releases/subscriptions/tips/distribution), top-selling items, conversion rate
- **Engagement analytics** — daily likes/comments/reposts/shares chart, recent comment activity
- **Play tracking** — `recordPlay` increments daily rollup + geography; fire-and-forget (never breaks page load)
- **Page view tracking** — `recordPageView` with geography upsert
- **Platform analytics** — admin-level platform-wide totals, MoM revenue, top artists

### Moderation (`src/lib/moderation.ts`)
- **Abuse reports** — 10-category taxonomy, anti-spam rate limit (5 per 5 min), evidence attachments
- **Moderation queue** — FIFO paginated queue filtered by status/category
- **Report resolution** — `resolveAbuseReport` logs `ModerationAction`, applies content flags, handles suspension flow
- **Content flags** — `applyContentFlag` / `removeContentFlag` with live content deactivation (beat, release, post, comment)
- **DMCA** — extended `processDMCAReport` with automatic takedown on resolution + artist notification
- **Creator verification** — submit/review flow, notification on approve/reject, badge applied immediately on approval
- **Admin dashboard** — queue counts + recent actions + flagged content overview

### Background Worker (`src/lib/workers/jobs.ts`)
- **Search index sync** — full rebuild of `SearchIndex` from beats/releases/artists with score computation
- **Trending computation** — refreshes all 8 period×category combinations
- **Stale data cleanup** — prunes `SpamSignal`, old `PageView` rows, old `Notification` entries, excess `TrendingSnapshot` rows

---

## 2. MODIFIED FILES

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Added Phase 3 relations to `User` model (`sentMessages`, `notifications`, `notificationPrefs`, `engagementEvents`, `postComments`); added Phase 3 relations to `Artist` model (`posts`, `pageViews`, `dailyRollups`, `geoEvents`, `verificationRequest`, `searchIndex`) |

---

## 3. CREATED FILES

### Library
| File | Description |
|------|-------------|
| `src/lib/social.ts` | Social engine — feed, follows, likes, saves, reposts, comments, notifications |
| `src/lib/discovery.ts` | Discovery — search, autocomplete, trending, recommendations, browse, artist discovery |
| `src/lib/messaging.ts` | Messaging — conversations, send/receive, anti-spam, soft-delete, archive |
| `src/lib/analytics.ts` | Analytics — creator/audience/revenue/engagement/play/geography/platform |
| `src/lib/moderation.ts` | Moderation — reports, queue, DMCA, content flags, verification |
| `src/lib/workers/jobs.ts` | Background jobs — search sync, trending compute, cleanup |

### API Routes

**Social**
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/social/notifications` | GET, PATCH, POST | Get/mark notifications; manage preferences |
| `/api/social/saves` | GET, POST | Get saved items; toggle save |
| `/api/social/reposts` | POST | Repost a piece of content |
| `/api/social/comments` | GET, POST, DELETE | Comments on posts/beats/releases |
| `/api/social/likes` | GET, POST | Bulk like status; toggle like |
| `/api/social/feed` | GET | Cursor-paginated activity feed |
| `/api/social/follow` | GET, POST, DELETE | Follow status; follow; unfollow |
| `/api/social/posts` | GET, POST | List artist posts; create post |
| `/api/social/posts/[id]` | PATCH, DELETE | Edit/pin/delete a post |

**Discovery**
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/discovery/search` | GET | Full-text search + autocomplete mode |
| `/api/discovery/trending` | GET | Trending snapshots by period + category |
| `/api/discovery/recommendations` | GET | Personalised beat/artist recommendations |
| `/api/discovery/browse` | GET | Genre categories or genre-filtered beats |
| `/api/discovery/artists` | GET | Paginated artist discovery with filters |

**Analytics**
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/analytics/creator` | GET | Creator dashboard (plays, revenue, followers) |
| `/api/analytics/audience` | GET | Audience + geography breakdown |
| `/api/analytics/revenue` | GET | Revenue breakdown + top items |
| `/api/analytics/engagement` | GET | Engagement chart + recent comments |
| `/api/analytics/plays` | GET, POST | Record plays (POST) + pixel tracking (GET) |
| `/api/analytics/platform` | GET | Admin platform-wide analytics |

**Messages**
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/messages/conversations` | GET, POST, PATCH | Inbox; open/create conversation; archive |
| `/api/messages/[id]` | GET, POST, DELETE | Message history; send; soft-delete message |

**Moderation**
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/moderation/reports` | POST | Submit abuse report |
| `/api/moderation/reports/[id]` | PATCH | Admin resolve report |
| `/api/moderation/queue` | GET | Admin moderation queue |
| `/api/moderation/dmca` | PATCH | Admin process DMCA |
| `/api/moderation/verify` | POST, PATCH | Submit/review verification |
| `/api/moderation/admin` | GET | Admin moderation dashboard |

**Workers**
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/workers/cron` | GET | Scheduled jobs (search sync, trending, cleanup) |

---

## 4. MIGRATIONS ADDED

```
prisma/migrations/phase3_social_engine/migration.sql
```

Contains `CREATE TABLE IF NOT EXISTS` statements for all 14 new Phase 3 models. Idempotent — safe to run multiple times.

**To apply:**
```bash
npx prisma migrate dev --name phase3_social_engine
# or on production:
npx prisma migrate deploy
```

**New tables:**
`EngagementEvent`, `ArtistPost`, `PostComment`, `Notification`, `NotificationPreference`, `MessageConversation`, `Message`, `TrendingSnapshot`, `SearchIndex`, `AnalyticsDailyRollup`, `GeographyEvent`, `PageView`, `AbuseReport`, `ModerationAction`, `ContentFlag`, `VerificationRequest`, `SpamSignal`

---

## 5. UNRESOLVED ISSUES

### Architecture
1. **Notification fan-out at scale** — `posts/route.ts` caps fan-out at 500 followers inline. Artists with >500 followers need an async job queue (BullMQ / Inngest / pg_cron) to fan out notifications without blocking the request.
2. **Search is basic prefix-match** — `SearchIndex` uses Prisma's `contains` (ILIKE). For production-grade full-text search, integrate **Typesense** or **Algolia** and point `search()` + `autocomplete()` at their SDKs. The `SearchIndex` table still serves as the sync source.
3. **Play debouncing** — `recordPlay` has no client-side debounce. The same user can increment play counts on repeated short listens. A 30-second minimum listen threshold should be enforced (client sends play event after N seconds).
4. **Real-time messaging** — `getMessages` is REST-polled. Production messaging needs WebSocket or SSE (Supabase Realtime, Pusher, or Ably) for live delivery.
5. **Message spam is per-server-memory** — `checkMessageSpam` uses the DB which is correct, but the `SpamSignal` window query can be slow under load. Add a Redis cache layer for the rate limiter.
6. **Geography country detection** — country is passed from the client, which is spoofable. For accuracy, derive it server-side from the request IP using `@vercel/edge` geo headers or a MaxMind lookup.
7. **Email notifications** — `Notification.emailSent` flag exists but no email dispatch is wired in Phase 3. Wire `createNotification` into `emails.ts` (Phase 1) for `purchases`, `messages`, and `milestones`.
8. **Push notifications** — `NotificationPreference.pushToken` column exists but push delivery (FCM/APNs) is not implemented.
9. **Trending delta** — `TrendingItem.delta` (rank change vs previous snapshot) is always `0`. Implement by comparing rank vs the previous snapshot of the same period+category before writing.

### Security
10. **Message attachment URLs** — attachment `url` fields are user-supplied strings. They must be validated to be Cloudflare R2 presigned URLs from your own bucket before accepting (prevent SSRF / URL poisoning).
11. **Moderation `account_suspended` action** — `resolveAbuseReport` logs the action but does not actually ban the Supabase auth user. Wire into Supabase Admin API (`supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: 'none' | '24h' | 'forever' })`).

---

## 6. REMAINING ARCHITECTURE TASKS

These are intentionally deferred to **Phase 4**:

- **Real-time layer** — WebSocket/SSE for live messages and notification badges
- **Push notification pipeline** — FCM (Android) + APNs (iOS) via `web-push` or Firebase Admin SDK
- **Email notification dispatch** — trigger emails from `createNotification` for high-priority types
- **Queue infrastructure** — BullMQ or Inngest for: notification fan-out, search index incremental sync, trending recompute, play event batching
- **Full-text search upgrade** — Typesense/Algolia integration using `SearchIndex` as the data source
- **Milestone detection worker** — detect and notify on follower milestones (100, 1K, 10K), sales milestones, stream milestones
- **Feed algorithm improvements** — weighted ranking (not pure chronological); boost pinned posts; demote seen content
- **Playlist / collection system** — user-curated beat/release playlists (distinct from saves)
- **Artist collaboration features** — co-credit on beats, split royalties between artists
- **Front-end pages** — `/feed`, `/discover`, `/messages`, `/trending`, analytics dashboard UI, moderation admin UI
- **Vercel Cron config** — add to `vercel.json`:
  ```json
  { "crons": [
    { "path": "/api/workers/cron?job=search_sync&secret=XXX", "schedule": "0 * * * *" },
    { "path": "/api/workers/cron?job=trending&secret=XXX", "schedule": "*/15 * * * *" },
    { "path": "/api/workers/cron?job=cleanup&secret=XXX", "schedule": "0 3 * * *" }
  ]}
  ```

---

## 7. EXACT HANDOFF STATE FOR PHASE 4

### What exists and works
All Phase 1 (auth, payments, beats, releases, admin), Phase 2 (creator economy, distribution, marketplace, licensing, payouts), and Phase 3 systems are implemented and API-ready.

### Environment variables needed (new in Phase 3)
```
CRON_SECRET=<random-secret>          # protects /api/workers/cron
# All Phase 1/2 env vars carry forward unchanged
```

### Database state
Run `npx prisma migrate deploy` with `phase3_social_engine` migration to create all 17 new tables.

### Phase 4 entry points
Phase 4 should pick up at these integration points:
1. `createNotification()` in `social.ts` — wire email + push delivery
2. `syncSearchIndex()` in `workers/jobs.ts` — upgrade to Typesense sync
3. `getUserFeed()` in `social.ts` — add algorithmic ranking layer
4. `sendMessage()` in `messaging.ts` — add real-time delivery via Supabase Realtime
5. `resolveAbuseReport()` moderation — wire Supabase auth ban for `account_suspended`
6. All analytics routes — build the front-end dashboard (React charts using `recharts`)
