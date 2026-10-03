export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';

// Artist stores social links as a single `socialLinks` JSON object
// (e.g. { instagram, twitter, youtube, website, ... }), not individual
// columns — true if at least one platform has a non-empty value, so this
// stays correct no matter which platforms the profile/storefront pages add.
function hasAnySocialLink(socialLinks: unknown): boolean {
  if (!socialLinks || typeof socialLinks !== 'object') return false;
  return Object.values(socialLinks as Record<string, unknown>).some(
    v => typeof v === 'string' && v.trim().length > 0
  );
}

// Live status of each setup step. The payout step counts as done when the artist
// has a bank account OR a PayPal email OR a Paystack recipient saved.
async function liveStatus(a: any) {
  const [bank, release] = await Promise.all([
    prisma.artistBankAccount.findFirst({ where: { artistId: a.id }, select: { id: true } }),
    prisma.release.findFirst({ where: { artistId: a.id }, select: { id: true } }),
  ]);
  const hasPayoutMethod =
    !!bank ||
    String(a.paypalEmail ?? '').trim().length > 0 ||
    String(a.paystackRecipient ?? '').trim().length > 0;
  return {
    hasProfile:     !!(a.bio || a.photoUrl),
    hasRelease:     !!release,
    hasBankAccount: hasPayoutMethod,
    hasSocials:     hasAnySocialLink(a.socialLinks),
  };
}

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
    const hasSocials     = hasAnySocialLink(a.socialLinks);
    // BUGFIX: this previously omitted hasSocials from the completion check,
    // so the wizard could mark itself "completed" (and disappear from the
    // dashboard) while the socials step was still unchecked and visibly
    // showing as incomplete. All four displayed steps must be done.
    const allDone = hasProfile && hasRelease && hasBankAccount && hasSocials;
    ob = await prisma.artistOnboarding.create({
      data: {
        id: `ob_${Date.now()}`, artistId: a.id,
        hasProfile, hasRelease, hasBankAccount, hasSocials,
        completedAt: allDone ? new Date() : null,
      },
    });
  }
  // The stored onboarding row is only a snapshot from first load. Re-check live so a
  // step ticks off as soon as it's done (e.g. a release uploaded after the row existed).
  const live = await liveStatus(a);
  const snapshot = ob;
  if (snapshot && (Object.keys(live) as (keyof typeof live)[]).some(k => snapshot[k] !== live[k])) {
    const allLive = Object.values(live).every(Boolean);
    ob = await prisma.artistOnboarding.update({
      where: { artistId: a.id },
      data: { ...live, completedAt: allLive ? (snapshot.completedAt ?? new Date()) : null },
    });
  }
  const steps = [
    // Profile editing lives entirely on the Settings page now — the old
    // standalone /dashboard/profile editor has been removed since it
    // duplicated (and lagged behind) the working Settings form.
    { key: 'hasProfile',     label: 'Complete your profile', desc: 'Add a bio and profile photo', done: ob.hasProfile, href: '/dashboard/settings' },
    { key: 'hasRelease',     label: 'Upload your first release', desc: 'Get your music live on Vuka Music', done: ob.hasRelease, href: '/dashboard/releases/new' },
    { key: 'hasBankAccount', label: 'Choose your payout settings', desc: 'Add PayPal or a bank account so you can get paid', done: ob.hasBankAccount, href: '/dashboard/settings' },
    { key: 'hasSocials',     label: 'Connect your socials', desc: 'Let fans find you everywhere', done: ob.hasSocials, href: '/dashboard/settings' },
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
    const hasSocials     = hasAnySocialLink(a.socialLinks);
    // BUGFIX: same fix as above — hasSocials must be part of "all done".
    const allDone = hasProfile && hasRelease && hasBankAccount && hasSocials;
    await prisma.artistOnboarding.upsert({
      where:  { artistId: a.id },
      update: { hasProfile, hasRelease, hasBankAccount, hasSocials, completedAt: allDone ? new Date() : null },
      create: { id: `ob_${Date.now()}`, artistId: a.id, hasProfile, hasRelease, hasBankAccount, hasSocials, completedAt: allDone ? new Date() : null },
    });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
