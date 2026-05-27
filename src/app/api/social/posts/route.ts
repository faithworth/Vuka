export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

const MAX_BODY_LEN = 2000;

// GET /api/social/posts?artistId=xxx&page=1&limit=20
export async function GET(req: NextRequest) {
  try {
    const artistId = req.nextUrl.searchParams.get('artistId');
    const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1');
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20'), 50);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { isPublished: true };
    if (artistId) where.artistId = artistId;

    const [posts, total] = await Promise.all([
      prisma.artistPost.findMany({
        where,
        include: {
          artist: { select: { name: true, slug: true, photoUrl: true, isVerified: true } },
          _count: { select: { comments: true } },
        },
        orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.artistPost.count({ where }),
    ]);

    return NextResponse.json({ posts, total, hasMore: skip + posts.length < total });
  } catch (err) {
    console.error('[Posts] GET error:', err);
    return NextResponse.json({ error: 'Failed to load posts' }, { status: 500 });
  }
}

// POST /api/social/posts — create a post (artist only)
export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const artist = await prisma.artist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!artist) return NextResponse.json({ error: 'Artist profile required' }, { status: 403 });

    const body = await req.json();
    const { body: text, mediaUrls = [], linkUrl = '', linkType = '', linkItemId = '' } = body;

    if (!text?.trim()) return NextResponse.json({ error: 'Post body required' }, { status: 400 });
    if (text.length > MAX_BODY_LEN) return NextResponse.json({ error: 'Post too long' }, { status: 400 });

    const post = await prisma.artistPost.create({
      data: {
        artistId: artist.id,
        body: text.trim(),
        mediaUrls,
        linkUrl,
        linkType,
        linkItemId,
      },
    });

    // Notify followers (fan-out — for large follow counts this should be queued)
    const followers = await prisma.follow.findMany({
      where: { artistId: artist.id },
      select: { userId: true },
      take: 500, // cap notification fan-out at 500 in-band; rest via worker
    });

    if (followers.length > 0) {
      const artistData = await prisma.artist.findUnique({
        where: { id: artist.id },
        select: { name: true, slug: true },
      });
      await prisma.notification.createMany({
        data: followers.map((f) => ({
          userId: f.userId,
          type: 'new_post',
          actorId: user.id,
          actorName: artistData?.name ?? '',
          targetType: 'post',
          targetId: post.id,
          title: `${artistData?.name} posted an update`,
          body: text.slice(0, 80),
          actionUrl: `/artist/${artistData?.slug}`,
        })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({ post }, { status: 201 });
  } catch (err) {
    console.error('[Posts] POST error:', err);
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
  }
}
