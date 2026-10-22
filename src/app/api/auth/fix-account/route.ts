/**
 * POST /api/auth/fix-account
 *
 * Self-service account repair for users whose DB role was saved incorrectly.
 * Requires an authenticated Supabase session.
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { slugify } from '@/lib/utils';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  if (ADMIN_EMAIL && user.email === ADMIN_EMAIL) {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { role: 'admin' },
      include: { artist: true },
    });
    return NextResponse.json({ ok: true, role: updated.role, redirect: '/admin', message: 'Account promoted to admin' });
  }

  const body = await req.json().catch(() => ({}));
  const { role } = body as { role?: string };

  if (!role || !['artist', 'industry'].includes(role)) {
    return NextResponse.json({ error: 'role must be "artist" or "industry"' }, { status: 400 });
  }
  if (['admin', 'owner', 'super_admin'].includes(user.role)) {
    return NextResponse.json({ error: 'Cannot change admin role via this endpoint' }, { status: 403 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role },
    include: { artist: true, industryUser: true },
  });

  if (role === 'artist' && !updated.artist) {
    let slug = slugify(user.name);
    let suffix = 0;
    while (await prisma.artist.findUnique({ where: { slug } })) {
      suffix++;
      slug = `${slugify(user.name)}-${suffix}`;
    }
    await prisma.artist.create({
      data: { userId: user.id, name: user.name, slug, country: 'ZA', currency: 'ZAR' },
    });
  }

  if (role === 'industry') {
    await prisma.industryUser.upsert({
      where: { userId: user.id },
      create: { userId: user.id, companyName: '' },
      update: {},
    });
  }

  const redirect = role === 'industry' ? '/industry-dashboard' : '/dashboard';
  return NextResponse.json({ ok: true, role, redirect, message: `Role updated to ${role}` });
}
