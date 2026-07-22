
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { requirePlanAtLeast } from '@/lib/planGates';
type P = { params: Promise<{ artistId: string }> };

export async function DELETE(_: NextRequest, { params }: P) {
  const { artistId } = await params;
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gate = await requirePlanAtLeast(user.artist.id, 'label');
  if (!gate.ok) return gate.response;
  const label = await prisma.label.findUnique({ where: { ownerId: user.id } });
  if (!label) return NextResponse.json({ error: 'No label' }, { status: 404 });
  await prisma.labelArtist.deleteMany({ where: { labelId: label.id, artistId } });
  return NextResponse.json({ ok: true });
}
