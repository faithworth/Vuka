export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

const MAX_BODY_LEN = 2000;

// GET /api/social/posts?artistId=xxx OR ?artistSlug=xxx OR (no filter = own posts if authed)
export async function GET(req: NextRequest) {
  try {
    const artistId   = req.nextUrl.searchParams.get('artistId');
    const artistSlug = req.nextUrl.searchParams.get('artistSlug');
    const own        = req.nextUrl.searchParams.get('own') === 'true';
    const page  = parseInt(req.nextUrl.searchParams.get('page')  ?? '1');
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20'), 50);
    const skip  = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (artistId) {
      where.artistId   = artistId;
      where.isPublished = true;
    } else if (artistSlug) {
      const artist = await prisma.artist.findUnique({
        where: { slug: artistSlug },
        select: { id: true },
      });
      if (!artist) return NextResponse.json({ posts: [], total: 0, hasMore: false });
      where.artistId   = artist.id;
      where.isPublished = true;
    } else {
      // No explicit filter — if caller is an artist return their own posts (all statuses)
      // Otherwise return all public posts (discovery feed)
      const user = await getServerUser();
      if (user?.artist || own) {
        const artist = user?.artist
          ?? await prisma.artist.findUnique({ where: { userId: user!.id }, select: { id: true } });
        if (artist) {
          where.artistId = artist.id;
          // own posts: include unpublished drafts too
        } else {
          where.isPublished = true;
        }
      } else {
        where.isPublished = true;
      }
    }

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

    const artist = await prisma.artist.findUnique({
      where: { userId: user.id },
      select: { id: true, name: true, slug: true },
    });
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
      include: {
        artist: { select: { name: true, slug: true, photoUrl: true, isVerified: true } },
        _count: { select: { comments: true } },
      },
    });

    // Notify followers — capped at 500 in-band; larger audiences handled via worker
    const followers = await prisma.follow.findMany({
      where:  { artistId: artist.id },
      select: { userId: true },
      take:   500,
    });

    if (followers.length > 0) {
      await prisma.notification.createMany({
        data: followers.map((f) => ({
          userId:   f.userId,
          type:     'new_post',
          title:    `${artist.name} posted an update`,
          body:     text.slice(0, 80),
          linkType: 'post',
          linkId:   post.id,
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
