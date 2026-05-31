// FIX: Feed was silently returning 0 items because:
// 1. cursor defaulted to new Date() with lt (strict less-than), so posts
//    published in the same second as the request were excluded.
// 2. The FeedItem shape (nested .payload) didn't match what feed/page.tsx expected
//    (flat fields like .body, .likeCount etc). Page was filtering everything out
//    with: raw.filter(p => p?.artist?.slug) — FeedItem has .artistSlug not .artist.slug.
//
// Fix: use lte for the initial load (no cursor), keep lt for pagination cursor,
// and flatten the response to match what the frontend expects.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const cursorParam = req.nextUrl.searchParams.get('cursor');
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20'), 50);

    // Who does this user follow?
    const follows = await prisma.follow.findMany({
      where: { userId: user.id },
      select: { artistId: true },
    });
    const artistIds = follows.map((f) => f.artistId);

    if (artistIds.length === 0) {
      return NextResponse.json({ items: [], nextCursor: null });
    }

    // Build the date filter:
    // - First load (no cursor): use lte so posts published RIGHT NOW are included.
    // - Pagination (cursor present): use lt so we don't re-fetch the last item.
    const dateFilter = cursorParam
      ? { lt: new Date(cursorParam) }
      : { lte: new Date() };

    const posts = await prisma.artistPost.findMany({
      where: {
        artistId: { in: artistIds },
        isPublished: true,
        publishedAt: dateFilter,
      },
      include: {
        artist: {
          select: { id: true, name: true, slug: true, photoUrl: true, isVerified: true },
        },
      },
      orderBy: { publishedAt: 'desc' },
      take: limit,
    });

    // Return flat shape that feed/page.tsx expects (Post interface)
    const items = posts.map((p) => ({
      id:           p.id,
      body:         p.body,
      mediaUrls:    p.mediaUrls,
      linkUrl:      p.linkUrl,
      linkType:     p.linkType,
      linkItemId:   p.linkItemId,
      likeCount:    p.likeCount,
      commentCount: p.commentCount,
      repostCount:  p.repostCount,
      isPinned:     p.isPinned,
      publishedAt:  p.publishedAt.toISOString(),
      artist: {
        id:         p.artist.id,
        name:       p.artist.name,
        slug:       p.artist.slug,
        photoUrl:   p.artist.photoUrl,
        isVerified: p.artist.isVerified,
      },
    }));

    const nextCursor =
      items.length === limit ? items[items.length - 1].publishedAt : null;

    return NextResponse.json({ items, nextCursor });
  } catch (err) {
    console.error('[Feed] Error:', err);
    return NextResponse.json({ error: 'Failed to load feed' }, { status: 500 });
  }
}
