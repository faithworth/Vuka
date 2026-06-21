export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: 'Sign in to vote' }, { status: 401 });
  const { nominationId } = await req.json();
  if (!nominationId) return NextResponse.json({ error: 'Missing nominationId' }, { status: 400 });

  const nomination = await prisma.awardNomination.findUnique({
    where: { id: nominationId },
    include: { category: { include: { award: true } } },
  });
  if (!nomination) return NextResponse.json({ error: 'Nomination not found' }, { status: 404 });
  if (nomination.category.award.status !== 'voting_open')
    return NextResponse.json({ error: 'Voting is not open for this award' }, { status: 400 });

  const existing = await prisma.awardVote.findUnique({
    where: { nominationId_userId: { nominationId, userId: user.id } },
  });
  if (existing) {
    // Toggle off
    await prisma.$transaction([
      prisma.awardVote.delete({ where: { id: existing.id } }),
      prisma.awardNomination.update({ where: { id: nominationId }, data: { voteCount: { decrement: 1 } } }),
    ]);
    await updateFinalScore(nominationId);
    return NextResponse.json({ ok: true, voted: false });
  }

  await prisma.$transaction([
    prisma.awardVote.create({
      data: { id: `av_${Date.now()}`, nominationId, userId: user.id },
    }),
    prisma.awardNomination.update({ where: { id: nominationId }, data: { voteCount: { increment: 1 } } }),
  ]);
  await updateFinalScore(nominationId);
  return NextResponse.json({ ok: true, voted: true });
}

// finalScore = 70% fan votes (normalised) + 30% analytics score
async function updateFinalScore(nominationId: string) {
  const nom = await prisma.awardNomination.findUnique({ where: { id: nominationId } });
  if (!nom) return;
  // Pull platform analytics for this artist
  const rollup = await prisma.analyticsDailyRollup.aggregate({
    _sum: { plays: true, revenue: true },
    where: { artistId: nom.artistId },
  });
  const plays   = rollup._sum.plays   ?? 0;
  const revenue = rollup._sum.revenue ?? 0;
  // Normalise analytics to 0–100 range (soft cap at 100k plays, R50k revenue)
  const analyticsScore = Math.min(100,
    (plays / 100_000) * 50 + (revenue / 50_000) * 50
  );
  const finalScore = nom.voteCount * 0.7 + analyticsScore * 0.3;
  await prisma.awardNomination.update({
    where: { id: nominationId },
    data: { analyticsScore, finalScore },
  });
}
