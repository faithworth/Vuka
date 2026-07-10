// FIX: src/app/api/creator/storefront/route.ts
//
// ROOT CAUSE of "Update failed":
// The storefront page sends: { tagline, bioLong, accentColor, showSupport, socialLinks, featuredBeatIds }
// But updateStorefront() in creator.ts only maps:
//   heroHeadline/headline → headline
//   heroSubtext/description → description
//   accentColor/theme → theme
//   sections, isPublic
//
// tagline, bioLong, showSupport, socialLinks, featuredBeatIds were ALL silently ignored,
// meaning the upsert wrote nothing, then returned empty data.
// The route then returned { storefront: {} } which the page interpreted as failure.
//
// FIX: Handle the mapping right here in the route so we don't need to touch creator.ts.
// Map: tagline→headline, bioLong→description, accentColor→theme,
//      showSupport/socialLinks/featuredBeatIds → stored in sections JSON.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { planAtLeast } from '@/lib/plans';

// GET — get caller's storefront (returns the page's expected shape)
export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const artist = await prisma.artist.findUnique({
      where: { id: user.artist.id },
      select: { planSlug: true, planExpiresAt: true },
    });
    const isLabel = planAtLeast(artist?.planSlug, artist?.planExpiresAt ?? null, 'label');

    const raw = await prisma.creatorStorefront.upsert({
      where:  { artistId: user.artist.id },
      create: { artistId: user.artist.id },
      update: {},
    });

    // Parse sections JSON to extract the extra fields we store there
    let sections: Record<string, any> = {};
    try {
      const parsed = Array.isArray(raw.sections) ? {} : (raw.sections as any);
      if (parsed && typeof parsed === 'object') sections = parsed;
    } catch {}

    // Return the shape the storefront page expects
    const storefront = {
      tagline:         raw.headline || '',
      bioLong:         raw.description || '',
      accentColor:     raw.theme && raw.theme.startsWith('#') ? raw.theme : '#38b6e8',
      showSupport:     sections.showSupport !== false,
      socialLinks:     sections.socialLinks || {},
      featuredBeatIds: sections.featuredBeatIds || [],
      // White-label: only meaningful (and only ever true) on the Label plan.
      // Always reported as false for non-Label so the dashboard toggle never
      // shows a stale "on" state the plan can't actually honor anymore.
      hideBranding:    isLabel ? sections.hideBranding === true : false,
      isLabelPlan:     isLabel,
    };

    return NextResponse.json({ storefront });
  } catch (err) {
    console.error('[creator/storefront] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

// PATCH — update storefront
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      tagline, bioLong, accentColor,
      showSupport, socialLinks, featuredBeatIds, hideBranding,
      // Legacy field names too
      headline, description, theme,
    } = body;

    // White-label toggle is Label-plan-only. Re-check fresh from the DB —
    // never trust the client's plan claim — and silently force it to false
    // for anyone below Label rather than erroring, so a downgraded artist's
    // dashboard doesn't break, it just quietly stops taking effect.
    const artist = await prisma.artist.findUnique({
      where: { id: user.artist.id },
      select: { planSlug: true, planExpiresAt: true },
    });
    const isLabel = planAtLeast(artist?.planSlug, artist?.planExpiresAt ?? null, 'label');
    const safeHideBranding = hideBranding !== undefined ? (isLabel ? !!hideBranding : false) : undefined;

    // Read existing sections so we can merge
    const existing = await prisma.creatorStorefront.findUnique({
      where: { artistId: user.artist.id },
    });
    let existingSections: Record<string, any> = {};
    try {
      const parsed = existing?.sections;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        existingSections = parsed as Record<string, any>;
      }
    } catch {}

    // Build the merged sections object for extra fields
    const newSections: Record<string, any> = {
      ...existingSections,
      ...(showSupport !== undefined && { showSupport }),
      ...(socialLinks !== undefined && { socialLinks }),
      ...(featuredBeatIds !== undefined && { featuredBeatIds }),
      ...(safeHideBranding !== undefined && { hideBranding: safeHideBranding }),
    };

    const updatedStorefront = await prisma.creatorStorefront.upsert({
      where:  { artistId: user.artist.id },
      create: {
        artistId:    user.artist.id,
        headline:    tagline ?? headline ?? '',
        description: bioLong ?? description ?? '',
        theme:       accentColor ?? theme ?? '#38b6e8',
        sections:    newSections,
      },
      update: {
        ...(tagline    !== undefined && { headline:    tagline }),
        ...(headline   !== undefined && { headline }),
        ...(bioLong    !== undefined && { description: bioLong }),
        ...(description !== undefined && { description }),
        ...(accentColor !== undefined && { theme: accentColor }),
        ...(theme       !== undefined && { theme }),
        sections:        newSections,
      },
    });

    // Return the same shape the GET endpoint returns
    let responseSections: Record<string, any> = {};
    try {
      const parsed = updatedStorefront.sections;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        responseSections = parsed as Record<string, any>;
      }
    } catch {}

    const storefront = {
      tagline:         updatedStorefront.headline || '',
      bioLong:         updatedStorefront.description || '',
      accentColor:     updatedStorefront.theme && updatedStorefront.theme.startsWith('#')
                         ? updatedStorefront.theme : '#38b6e8',
      showSupport:     responseSections.showSupport !== false,
      socialLinks:     responseSections.socialLinks || {},
      featuredBeatIds: responseSections.featuredBeatIds || [],
      hideBranding:    isLabel ? responseSections.hideBranding === true : false,
      isLabelPlan:     isLabel,
    };

    return NextResponse.json({ storefront });
  } catch (err: any) {
    console.error('[creator/storefront] PATCH error:', err?.message);
    return NextResponse.json({ error: 'Update failed' }, { status: 503 });
  }
}

// POST — alias for PATCH
export async function POST(req: NextRequest) {
  return PATCH(req);
}
