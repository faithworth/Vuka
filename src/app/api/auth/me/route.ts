export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { slugify } from '@/lib/utils';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

export async function GET() {
  let user = await getServerUser();
  if (!user) return NextResponse.json({ authenticated: false }, { status: 401 });

  // ── Auto-heal: ADMIN_EMAIL always becomes admin ──────────────────────────
  if (
    ADMIN_EMAIL &&
    user.email === ADMIN_EMAIL &&
    !['admin', 'owner', 'super_admin'].includes(user.role)
  ) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { role: 'admin' },
      include: { artist: true, industryUser: true },
    });
    console.log(`[auth/me] Auto-promoted ${user.email} to admin`);
  }

  // ── Auto-heal: artist role but missing Artist record ────────────────────
  if (
    (user.role === 'artist' || user.role === 'producer') &&
    !user.artist
  ) {
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

  // ── Auto-heal: industry role but missing IndustryUser record ────────────
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
