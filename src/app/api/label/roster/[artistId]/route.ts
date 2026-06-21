export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
type P = { params: { artistId: string } };

export async function DELETE(_: NextRequest, { params }: P) {
  const user = await requireArtist();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const label = await prisma.label.findUnique({ where: { ownerId: user.id } });
  if (!label) return NextResponse.json({ error: 'No label' }, { status: 404 });
  await prisma.labelArtist.deleteMany({ where: { labelId: label.id, artistId: params.artistId } });
  return NextResponse.json({ ok: true });
}
