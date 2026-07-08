// FIX HISTORY:
// - cursor defaulted to new Date() with lt (strict less-than), excluding
//   posts published in the same second as the request. Fixed via lte on
//   the initial (no-cursor) load.
// - Response shape now flat (matches the frontend Post interface) instead
//   of the nested FeedItem.payload shape.
// - Added a "discover" tab (public posts from artists you don't yet
//   follow) so the feed isn't empty for new accounts with zero follows —
//   this is the single biggest gap that made /feed look "broken" for
//   anyone who hadn't followed artists yet.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getDiscoverFeed } from '@/lib/social';

// GET /api/social/feed?tab=following|discover&cursor=ISO&limit=20
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tab = req.nextUrl.searchParams.get('tab') === 'discover' ? 'discover' : 'following';
    const cursorParam = req.nextUrl.searchParams.get('cursor') ?? undefined;
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20'), 50);

    if (tab === 'discover') {
      const result = await getDiscoverFeed(user.id, cursorParam, limit);
      return NextResponse.json(result);
    }

    // "following" tab — posts from artists this user follows
    const follows = await prisma.follow.findMany({
      where: { userId: user.id },
      select: { artistId: true },
    });
    const artistIds = follows.map((f) => f.artistId);

    if (artistIds.length === 0) {
      return NextResponse.json({ items: [], nextCursor: null, isEmpty: true });
    }

    const dateFilter = cursorParam ? { lt: new Date(cursorParam) } : { lte: new Date() };

    const posts = await prisma.artistPost.findMany({
      where: {
        artistId: { in: artistIds },
        isPublished: true,
        publishedAt: dateFilter,
      },
      include: {
        artist: { select: { id: true, name: true, slug: true, photoUrl: true, isVerified: true } },
      },
      orderBy: { publishedAt: 'desc' },
      take: limit,
    });

    const items = posts.map((p) => ({
      id: p.id,
      body: p.body,
      mediaUrls: p.mediaUrls,
      linkUrl: p.linkUrl,
      linkType: p.linkType,
      linkItemId: p.linkItemId,
      likeCount: p.likeCount,
      commentCount: p.commentCount,
      repostCount: p.repostCount,
      isPinned: p.isPinned,
      publishedAt: p.publishedAt.toISOString(),
      artist: {
        id: p.artist.id,
        name: p.artist.name,
        slug: p.artist.slug,
        photoUrl: p.artist.photoUrl,
        isVerified: p.artist.isVerified,
      },
    }));

    const nextCursor = items.length === limit ? items[items.length - 1].publishedAt : null;

    return NextResponse.json({ items, nextCursor });
  } catch (err) {
    console.error('[Feed] Error:', err);
    return NextResponse.json({ error: 'Failed to load feed' }, { status: 500 });
  }
}
