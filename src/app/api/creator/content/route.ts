// ============================================================
// PHASE 2 — src/app/api/creator/content/route.ts
// Exclusive content: create, list, entitlement-gate access
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist, requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { checkContentEntitlement } from '@/lib/creator';

// GET — list content (fan view: gate by entitlement; artist view: all their content)
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const artistId  = searchParams.get('artistId');
    const contentId = searchParams.get('contentId');

    // Single content fetch with entitlement check
    if (contentId) {
      const content = await prisma.exclusiveContent.findUnique({
        where: { id: contentId },
        include: { artist: { select: { id: true, name: true, slug: true } } },
      });
      if (!content) return NextResponse.json({ error: 'Content not found' }, { status: 404 });
      if (!content.isPublished && content.artist.id !== user.artist?.id) {
        return NextResponse.json({ error: 'Content not available' }, { status: 404 });
      }

      const entitled = await checkContentEntitlement(user.id, contentId);
      return NextResponse.json({ content: entitled ? content : { ...content, fileUrl: '', body: '', externalUrl: '' }, entitled });
    }

    if (!artistId) return NextResponse.json({ error: 'artistId or contentId required' }, { status: 400 });

    // List for an artist — artist sees all their own, fans see published only
    const isOwner = user.artist?.id === artistId;
    const items = await prisma.exclusiveContent.findMany({
      where: {
        artistId,
        ...(isOwner ? {} : { isPublished: true }),
      },
      orderBy: { publishedAt: 'desc' },
      // Strip private fields for non-entitled fans
      select: {
        id: true, artistId: true, title: true, description: true,
        contentType: true, thumbnailUrl: true, isFreePreview: true,
        accessTierIds: true, isPublished: true, publishedAt: true,
        // Include body/fileUrl/externalUrl only for owner
        ...(isOwner ? { fileUrl: true, body: true, externalUrl: true } : {}),
      },
    });

    return NextResponse.json({ content: items });
  } catch (err) {
    console.error('[creator/content] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

// POST — create exclusive content (artist only)
export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      title, description, contentType, fileUrl,
      thumbnailUrl, externalUrl, body: textBody,
      accessTierIds, isFreePreview, isPublished,
    } = body;

    if (!title?.trim())    return NextResponse.json({ error: 'Title required' }, { status: 400 });
    if (!contentType)      return NextResponse.json({ error: 'contentType required' }, { status: 400 });

    const content = await prisma.exclusiveContent.create({
      data: {
        artistId: user.artist.id,
        title: title.trim(),
        description: description || '',
        contentType,
        fileUrl: fileUrl || '',
        thumbnailUrl: thumbnailUrl || '',
        externalUrl: externalUrl || '',
        body: textBody || '',
        accessTierIds: accessTierIds || [],
        isFreePreview: isFreePreview || false,
        isPublished: isPublished || false,
        publishedAt: isPublished ? new Date() : null,
      },
    });

    return NextResponse.json({ content }, { status: 201 });
  } catch (err: any) {
    console.error('[creator/content] POST error:', err?.message);
    return NextResponse.json({ error: 'Failed to create content' }, { status: 503 });
  }
}

// PATCH — update content (artist only)
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { contentId, ...updates } = body;
    if (!contentId) return NextResponse.json({ error: 'contentId required' }, { status: 400 });

    const content = await prisma.exclusiveContent.findFirst({
      where: { id: contentId, artistId: user.artist.id },
    });
    if (!content) return NextResponse.json({ error: 'Content not found' }, { status: 404 });

    const allowed = ['title','description','fileUrl','thumbnailUrl','externalUrl','body','accessTierIds','isFreePreview','isPublished'];
    const data: any = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) data[key] = updates[key];
    }

    // Set publishedAt when publishing for the first time
    if (data.isPublished && !content.isPublished) {
      data.publishedAt = new Date();
    }

    const updated = await prisma.exclusiveContent.update({ where: { id: contentId }, data });
    return NextResponse.json({ content: updated });
  } catch (err: any) {
    console.error('[creator/content] PATCH error:', err?.message);
    return NextResponse.json({ error: 'Update failed' }, { status: 503 });
  }
}

// DELETE — delete exclusive content (artist only)
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const contentId = searchParams.get('contentId');
    if (!contentId) return NextResponse.json({ error: 'contentId required' }, { status: 400 });

    const content = await prisma.exclusiveContent.findFirst({
      where: { id: contentId, artistId: user.artist.id },
    });
    if (!content) return NextResponse.json({ error: 'Content not found' }, { status: 404 });

    await prisma.exclusiveContent.delete({ where: { id: contentId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[creator/content] DELETE error:', err);
    return NextResponse.json({ error: 'Delete failed' }, { status: 503 });
  }
}
