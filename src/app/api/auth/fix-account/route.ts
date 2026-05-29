/**
 * POST /api/auth/fix-account
 *
 * Self-service account repair for users whose DB role was saved incorrectly
 * (e.g. registered as artist but stored as fan due to the callback bug).
 *
 * Rules:
 * - Must be authenticated (valid Supabase session)
 * - ADMIN_EMAIL always gets role=admin, cannot be overridden
 * - For everyone else: only allows upgrading to artist or industry (not downgrading)
 * - If requesting artist role and no Artist record exists, creates it
 * - If requesting industry role and no IndustryUser record exists, creates it
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

  // Admin email always becomes admin — no body needed
  if (ADMIN_EMAIL && user.email === ADMIN_EMAIL) {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { role: 'admin' },
      include: { artist: true },
    });
    return NextResponse.json({
      ok: true,
      role: updated.role,
      redirect: '/admin',
      message: 'Account promoted to admin',
    });
  }

  const body = await req.json().catch(() => ({}));
  const { role } = body as { role?: string };

  if (!role || !['artist', 'industry'].includes(role)) {
    return NextResponse.json({ error: 'role must be "artist" or "industry"' }, { status: 400 });
  }

  // Don't allow downgrading an admin/owner
  if (['admin', 'owner', 'super_admin'].includes(user.role)) {
    return NextResponse.json({ error: 'Cannot change admin role via this endpoint' }, { status: 403 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role },
    include: { artist: true, industryUser: true },
  });

  // Ensure Artist record exists if role is artist
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

  // Ensure IndustryUser record exists if role is industry
  if (role === 'industry' && !updated.industryUser) {
    await prisma.industryUser.create({ data: { userId: user.id, companyName: '' } });
  }

  const redirect = role === 'industry' ? '/industry-dashboard' : '/dashboard';
  return NextResponse.json({ ok: true, role, redirect, message: `Role updated to ${role}` });
}
