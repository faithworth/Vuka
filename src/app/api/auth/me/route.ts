export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { slugify } from '@/lib/utils';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

export async function GET() {
  let user = await getServerUser();
  if (!user) return NextResponse.json({ authenticated: false }, { status: 401 });

  let needsRefetch = false;

  // ── Heal 1: ADMIN_EMAIL always gets admin role ───────────────────────────
  if (
    ADMIN_EMAIL &&
    user.email === ADMIN_EMAIL &&
    !['admin', 'owner', 'super_admin'].includes(user.role)
  ) {
    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'admin' },
    });
    console.log(`[auth/me] Auto-promoted ${user.email} to admin`);
    needsRefetch = true;
  }

  // ── Heal 2: Has Artist record but role is wrong (fan/undefined) ──────────
  // This covers accounts that registered correctly but had role saved as 'fan'
  if (!needsRefetch && user.role === 'fan' && user.artist) {
    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'artist' },
    });
    console.log(`[auth/me] Healed artist role for ${user.email} (had Artist record, role was fan)`);
    needsRefetch = true;
  }

  // ── Heal 3: Has IndustryUser record but role is wrong ───────────────────
  if (!needsRefetch && user.role === 'fan' && user.industryUser) {
    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'industry' },
    });
    console.log(`[auth/me] Healed industry role for ${user.email} (had IndustryUser record, role was fan)`);
    needsRefetch = true;
  }

  // Refetch with updated role + relations if any heal ran
  if (needsRefetch) {
    user = await prisma.user.findUnique({
      where: { id: user.id },
      include: { artist: true, industryUser: true },
    }) ?? user;
  }

  // ── Heal 4: artist role but no Artist record ─────────────────────────────
  if ((user.role === 'artist' || user.role === 'producer') && !user.artist) {
    let slug = slugify(user.name);
    let suffix = 0;
    while (await prisma.artist.findUnique({ where: { slug } })) {
      suffix++;
      slug = `${slugify(user.name)}-${suffix}`;
    }
    await prisma.artist.create({
      data: { userId: user.id, name: user.name, slug, country: 'ZA', currency: 'ZAR' },
    });
    user = await prisma.user.findUnique({
      where: { id: user.id },
      include: { artist: true, industryUser: true },
    }) ?? user;
  }

  // ── Heal 5: industry role but no IndustryUser record ────────────────────
  if (user.role === 'industry' && !user.industryUser) {
    await prisma.industryUser.create({ data: { userId: user.id, companyName: '' } });
    user = await prisma.user.findUnique({
      where: { id: user.id },
      include: { artist: true, industryUser: true },
    }) ?? user;
  }

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isArtist: !!user.artist,
    artistSlug: user.artist?.slug ?? null,
    isIndustry: user.role === 'industry',
    industryUser: user.industryUser ?? null,
  });
}
