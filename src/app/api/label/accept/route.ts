export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });
  const invite = await prisma.labelArtist.findUnique({ where: { inviteToken: token } });
  if (!invite) return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 });
  if (invite.artistId !== user.artist.id) return NextResponse.json({ error: 'This invite is not for your account' }, { status: 403 });
  if (invite.status !== 'pending') return NextResponse.json({ error: 'Invite already used' }, { status: 400 });
  const updated = await prisma.labelArtist.update({
    where: { id: invite.id },
    data: { status: 'active', joinedAt: new Date() },
  });
  return NextResponse.json({ ok: true, roster: updated });
}
