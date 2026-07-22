// PATCH/DELETE /api/cms/featured-artists/[id]
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { canAccessCms } from '@/lib/cms';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireAdmin();
    if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { tagline, blurb, isVisible } = await req.json();
    const data: Record<string, unknown> = {};
    if (tagline   !== undefined) data.tagline   = tagline.trim();
    if (blurb     !== undefined) data.blurb     = blurb.trim();
    if (isVisible !== undefined) data.isVisible = isVisible;
    const featured = await prisma.featuredArtist.update({
      where: { id: params.id }, data,
      include: { artist: { select: { id: true, slug: true, name: true, photoUrl: true, genreTags: true, city: true, isVerified: true } } },
    });
    return NextResponse.json({ featured });
  } catch (e) { return NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireAdmin();
    if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    await prisma.featuredArtist.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}
