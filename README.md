# Vuka — 04 Social + Marketplace

**What lives here:**
Feed, posts, comments, likes, reposts, follows, notifications,
direct messaging, marketplace services/orders/disputes, moderation,
industry hub, wishlists.

**Key files:**
- `src/lib/social.ts` — post creation, fan engagement, milestone detection
- `src/lib/messaging.ts` — conversation threading, read receipts
- `src/lib/moderation.ts` — abuse reports, content flags, verification
- `src/lib/marketplace.ts` — order lifecycle, escrow, dispute resolution
- `src/app/api/social/` — feed, posts, comments, likes, reposts, notifications
- `src/app/api/messages/` — conversations + message send/read
- `src/app/api/marketplace/` — services, orders, deliver/complete/dispute/review
- `src/app/api/moderation/` — reports, queue, admin actions, verification
- `src/app/api/industry/` — industry browse, services, deals, inquiries
