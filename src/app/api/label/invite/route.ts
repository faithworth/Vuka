export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { requirePlanAtLeast } from '@/lib/planGates';

export async function POST(req: NextRequest) {
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gate = await requirePlanAtLeast(user.artist.id, 'label');
  if (!gate.ok) return gate.response;
  const label = await prisma.label.findUnique({ where: { ownerId: user.id } });
  if (!label) return NextResponse.json({ error: 'No label found' }, { status: 404 });
  const { artistSlug, revenueShare } = await req.json();
  if (!artistSlug) return NextResponse.json({ error: 'Artist slug required' }, { status: 400 });
  const share = parseFloat(revenueShare ?? 80);
  if (share < 0 || share > 100) return NextResponse.json({ error: 'Revenue share must be 0–100' }, { status: 400 });
  const artist = await prisma.artist.findUnique({ where: { slug: artistSlug } });
  if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
  const existing = await prisma.labelArtist.findUnique({ where: { labelId_artistId: { labelId: label.id, artistId: artist.id } } });
  if (existing) return NextResponse.json({ error: 'Artist already on roster or invited' }, { status: 409 });
  const invite = await prisma.labelArtist.create({
    data: { id: `la_${Date.now()}`, labelId: label.id, artistId: artist.id, revenueShare: share, status: 'pending', inviteToken: `inv_${Date.now()}_${Math.random().toString(36).slice(2,8)}` },
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://vukamusic.com';
  return NextResponse.json({ ok: true, inviteLink: `${appUrl}/label/accept?token=${invite.inviteToken}` });
}
