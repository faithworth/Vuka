export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const a = user.artist;
  let ob = await prisma.artistOnboarding.findUnique({ where: { artistId: a.id } });
  if (!ob) {
    // Auto-check current state
    const hasBankAccount = !!(await prisma.artistBankAccount.findFirst({ where: { artistId: a.id } }));
    const hasRelease     = !!(await prisma.release.findFirst({ where: { artistId: a.id } }));
    const hasProfile     = !!(a.bio || a.photoUrl);
    const hasSocials     = !!(a.instagramUrl || a.twitterUrl || a.facebookUrl || a.websiteUrl);
    ob = await prisma.artistOnboarding.create({
      data: {
        id: `ob_${Date.now()}`, artistId: a.id,
        hasProfile, hasRelease, hasBankAccount, hasSocials,
        completedAt: (hasProfile && hasRelease && hasBankAccount) ? new Date() : null,
      },
    });
  }
  const steps = [
    { key: 'hasProfile',     label: 'Complete your profile', desc: 'Add a bio and profile photo', done: ob.hasProfile, href: '/dashboard/profile' },
    { key: 'hasRelease',     label: 'Upload your first release', desc: 'Get your music live on Vuka', done: ob.hasRelease, href: '/dashboard/releases/new' },
    { key: 'hasBankAccount', label: 'Add your bank account', desc: 'So you can receive payouts', done: ob.hasBankAccount, href: '/dashboard/payouts' },
    { key: 'hasSocials',     label: 'Connect your socials', desc: 'Let fans find you everywhere', done: ob.hasSocials, href: '/dashboard/profile' },
  ];
  const doneCount = steps.filter(s => s.done).length;
  return NextResponse.json({ steps, doneCount, total: steps.length, dismissed: !!ob.dismissedAt, completed: !!ob.completedAt });
}

export async function POST(req: NextRequest) {
  const user = await requireArtist();
  if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { action } = await req.json();
  if (action === 'dismiss') {
    await prisma.artistOnboarding.upsert({
      where:  { artistId: user.artist.id },
      update: { dismissedAt: new Date() },
      create: { id: `ob_${Date.now()}`, artistId: user.artist.id, dismissedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }
  if (action === 'refresh') {
    const a = user.artist;
    const hasBankAccount = !!(await prisma.artistBankAccount.findFirst({ where: { artistId: a.id } }));
    const hasRelease     = !!(await prisma.release.findFirst({ where: { artistId: a.id } }));
    const hasProfile     = !!(a.bio || a.photoUrl);
    const hasSocials     = !!(a.instagramUrl || a.twitterUrl || a.facebookUrl || a.websiteUrl);
    const allDone        = hasProfile && hasRelease && hasBankAccount;
    await prisma.artistOnboarding.upsert({
      where:  { artistId: a.id },
      update: { hasProfile, hasRelease, hasBankAccount, hasSocials, completedAt: allDone ? new Date() : null },
      create: { id: `ob_${Date.now()}`, artistId: a.id, hasProfile, hasRelease, hasBankAccount, hasSocials, completedAt: allDone ? new Date() : null },
    });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
