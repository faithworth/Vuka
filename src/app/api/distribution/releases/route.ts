// ============================================================
// PHASE 2 — src/app/api/distribution/releases/route.ts
// Artist: create/list distribution releases
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { generateISRC, generateUPC } from '@/lib/distribution';
import { slugify } from '@/lib/utils';

// GET — list artist's distribution releases
export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const releases = await prisma.distributionRelease.findMany({
      where: { artistId: user.artist.id },
      include: {
        tracks: { orderBy: { trackNumber: 'asc' } },
        dspDeliveries: { orderBy: { dsp: 'asc' } },
        _count: { select: { tracks: true, dspDeliveries: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ releases });
  } catch (err) {
    console.error('[distribution/releases] GET error:', err);
    return NextResponse.json({ releases: [], error: 'Database error' }, { status: 503 });
  }
}

// POST — create new distribution release
export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      title,
      artistName,
      featuredArtists,
      releaseType,
      primaryGenre,
      secondaryGenre,
      language,
      labelName,
      distributor,
      copyrightHolder,
      copyrightYear,
      pLine,
      cLine,
      targetDSPs,
      platforms,
      artworkUrl,
      scheduledDate,
      originalReleaseDate,
      catalogNumber,
      price,
      minPrice,
      payWhatYouWant,
    } = body;

    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    if (!artistName?.trim()) return NextResponse.json({ error: 'Artist name is required' }, { status: 400 });

    // Generate UPC
    const upc = generateUPC();

    const release = await prisma.distributionRelease.create({
      data: {
        artistId: user.artist.id,
        title: title.trim(),
        artistName: artistName.trim(),
        featuredArtists: featuredArtists || [],
        releaseType: releaseType || 'single',
        primaryGenre: primaryGenre || '',
        secondaryGenre: secondaryGenre || '',
        language: language || 'en',
        upc,
        labelName: labelName || '',
        distributor: distributor || 'Vuka',
        copyrightHolder: copyrightHolder || user.artist.name,
        copyrightYear: copyrightYear ? parseInt(copyrightYear) : new Date().getFullYear(),
        pLine: pLine || `${new Date().getFullYear()} ${user.artist.name}`,
        cLine: cLine || `${new Date().getFullYear()} ${user.artist.name}`,
        targetDSPs: targetDSPs || ['vuka'],
        platforms: platforms || targetDSPs || ['vuka'],
        artworkUrl: artworkUrl || '',
        scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
        originalReleaseDate: originalReleaseDate ? new Date(originalReleaseDate) : null,
        catalogNumber: catalogNumber || '',
        status: 'draft',
        price: parseFloat(price) || 0,
        minPrice: parseFloat(minPrice) || 0,
        payWhatYouWant: payWhatYouWant === true,
        statusHistory: [{ status: 'draft', timestamp: new Date().toISOString(), notes: 'Created' }],
      },
    });

    return NextResponse.json({ release }, { status: 201 });
  } catch (err: any) {
    console.error('[distribution/releases] POST error:', err?.message, err?.code, err?.meta);
    return NextResponse.json({ error: 'Failed to create release' }, { status: 503 });
  }
}

// PATCH — update release metadata (only allowed in draft/metadata_review)
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { releaseId, ...updates } = body;
    if (!releaseId) return NextResponse.json({ error: 'releaseId required' }, { status: 400 });

    const release = await prisma.distributionRelease.findFirst({
      where: { id: releaseId, artistId: user.artist.id },
    });
    if (!release) return NextResponse.json({ error: 'Release not found' }, { status: 404 });

    // Only allow edits in early stages
    const editableStatuses = ['draft', 'metadata_review', 'failed'];
    if (!editableStatuses.includes(release.status)) {
      return NextResponse.json(
        { error: `Cannot edit a release in "${release.status}" status` },
        { status: 409 }
      );
    }

    // Whitelist editable fields
    const allowed = [
      'title','artistName','featuredArtists','releaseType',
      'primaryGenre','secondaryGenre','language',
      'labelName','distributor','copyrightHolder','copyrightYear',
      'pLine','cLine','targetDSPs','scheduledDate',
      'originalReleaseDate','catalogNumber','artworkUrl',
      'price','minPrice','payWhatYouWant',
    ];
    const data: any = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        if (key === 'scheduledDate' || key === 'originalReleaseDate') {
          data[key] = updates[key] ? new Date(updates[key]) : null;
        } else if (key === 'copyrightYear') {
          data[key] = updates[key] ? parseInt(updates[key]) : null;
        } else {
          data[key] = updates[key];
        }
      }
    }

    const updated = await prisma.distributionRelease.update({
      where: { id: releaseId },
      data,
      include: { tracks: { orderBy: { trackNumber: 'asc' } } },
    });

    return NextResponse.json({ release: updated });
  } catch (err: any) {
    console.error('[distribution/releases] PATCH error:', err?.message);
    return NextResponse.json({ error: 'Update failed' }, { status: 503 });
  }
}
