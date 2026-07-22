/**
 * GET  /api/admin/db-repair  — list all users + their current roles (requires CRON_SECRET)
 * POST /api/admin/db-repair  — fix a specific user's role (requires CRON_SECRET)
 *
 * Protected by CRON_SECRET (same as /api/migrate) so you can hit it even before
 * admin login is working. Never exposed to the public — requires the secret.
 *
 * Query / body params:
 *   GET  ?secret=<CRON_SECRET>
 *   POST ?secret=<CRON_SECRET>  body: { userId, role, ensureArtistRecord? }
 *
 * This is a ONE-TIME repair tool. Once roles are fixed it becomes a no-op.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { slugify } from '@/lib/utils';

const CRON_SECRET   = process.env.CRON_SECRET;
const ADMIN_EMAIL   = (process.env.ADMIN_EMAIL ?? '').toLowerCase().trim();

// This is a one-time repair tool with the power to grant admin/owner roles.
// It stays fully inert unless someone deliberately flips ENABLE_DB_REPAIR=true
// in the environment, so a leaked CRON_SECRET alone can't be used to escalate
// privileges once the repair has been run.
const REPAIR_ENABLED = process.env.ENABLE_DB_REPAIR === 'true';

function authorized(req: NextRequest): boolean {
  if (!REPAIR_ENABLED) return false;
  if (!CRON_SECRET) return false;
  const secret =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace('Bearer ', '');
  return secret === CRON_SECRET;
}

// ── GET — list all users ────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized — provide CRON_SECRET' }, { status: 401 });
  }

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isSuspended: true,
        createdAt: true,
        artist: { select: { id: true, slug: true, name: true } },
        industryUser: { select: { id: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Flag obvious mismatches for easy scanning
    const annotated = users.map(u => {
      const issues: string[] = [];

      // Artist record exists but role is not artist/producer
      if (u.artist && !['artist', 'producer', 'verified_artist', 'admin', 'owner', 'super_admin'].includes(u.role)) {
        issues.push(`has Artist record but role="${u.role}" — should be "artist"`);
      }

      // No artist record but role claims artist
      if (!u.artist && ['artist', 'producer', 'verified_artist'].includes(u.role)) {
        issues.push(`role="${u.role}" but no Artist record — Artist record needs to be created`);
      }

      // IndustryUser record but wrong role
      if (u.industryUser && u.role !== 'industry') {
        issues.push(`has IndustryUser record but role="${u.role}" — should be "industry"`);
      }

      // Admin email should be admin/owner
      if (u.email?.toLowerCase() === ADMIN_EMAIL && !['admin', 'owner', 'super_admin'].includes(u.role)) {
        issues.push(`email matches ADMIN_EMAIL but role="${u.role}" — should be "admin" or "owner"`);
      }

      return { ...u, issues };
    });

    const broken = annotated.filter(u => u.issues.length > 0);

    return NextResponse.json({
      total: users.length,
      broken: broken.length,
      adminEmail: ADMIN_EMAIL || '(not set)',
      users: annotated,
      hint: broken.length > 0
        ? 'POST to this endpoint with { userId, role } to fix individual users, or use ?fixAll=true to auto-fix all detected issues'
        : 'No issues detected',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST — fix a specific user or fixAll ───────────────────────────────────
export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized — provide CRON_SECRET' }, { status: 401 });
  }

  const fixAll = req.nextUrl.searchParams.get('fixAll') === 'true';

  if (fixAll) {
    return handleFixAll();
  }

  let body: { userId?: string; role?: string; ensureArtistRecord?: boolean } = {};
  try { body = await req.json(); } catch {}

  const { userId, role, ensureArtistRecord } = body;

  if (!userId || !role) {
    return NextResponse.json({ error: 'userId and role are required' }, { status: 400 });
  }

  const validRoles = ['fan', 'artist', 'producer', 'industry', 'admin', 'owner', 'super_admin', 'moderator', 'verified_artist'];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` }, { status: 400 });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role },
      include: { artist: true, industryUser: true },
    });

    const sideEffects: string[] = [];

    // Create Artist record if needed
    if ((role === 'artist' || role === 'producer' || ensureArtistRecord) && !updated.artist) {
      let slug = slugify(updated.name);
      let suffix = 0;
      while (await prisma.artist.findUnique({ where: { slug } })) {
        suffix++;
        slug = `${slugify(updated.name)}-${suffix}`;
      }
      await prisma.artist.create({
        data: { userId: updated.id, name: updated.name, slug, country: 'ZA', currency: 'ZAR' },
      });
      sideEffects.push(`Created Artist record with slug "${slug}"`);
    }

    // Create IndustryUser record if needed
    if (role === 'industry' && !updated.industryUser) {
      await prisma.industryUser.create({ data: { userId: updated.id, companyName: '' } });
      sideEffects.push('Created IndustryUser record');
    }

    return NextResponse.json({
      ok: true,
      userId: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      sideEffects,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── Auto-fix all detected issues ───────────────────────────────────────────
async function handleFixAll() {
  const users = await prisma.user.findMany({
    include: { artist: true, industryUser: true },
  });

  const results: { email: string; fixes: string[]; errors: string[] }[] = [];

  for (const u of users) {
    const fixes: string[] = [];
    const errors: string[] = [];

    try {
      // Fix: ADMIN_EMAIL user with wrong role
      if (u.email?.toLowerCase() === ADMIN_EMAIL && !['admin', 'owner', 'super_admin'].includes(u.role)) {
        await prisma.user.update({ where: { id: u.id }, data: { role: 'owner' } });
        fixes.push(`Role ${u.role} → owner (ADMIN_EMAIL match)`);
      }

      // Fix: has Artist record but wrong role (and not admin)
      if (
        u.artist &&
        !['artist', 'producer', 'verified_artist', 'admin', 'owner', 'super_admin', 'moderator'].includes(u.role)
      ) {
        await prisma.user.update({ where: { id: u.id }, data: { role: 'artist' } });
        fixes.push(`Role ${u.role} → artist (had Artist record)`);
      }

      // Fix: has IndustryUser record but wrong role (and not admin)
      if (
        u.industryUser &&
        !['industry', 'admin', 'owner', 'super_admin', 'moderator'].includes(u.role) &&
        !u.artist // artist takes priority if somehow both exist
      ) {
        await prisma.user.update({ where: { id: u.id }, data: { role: 'industry' } });
        fixes.push(`Role ${u.role} → industry (had IndustryUser record)`);
      }

      // Fix: role is artist/producer but no Artist record
      if (['artist', 'producer', 'verified_artist'].includes(u.role) && !u.artist) {
        let slug = slugify(u.name);
        let suffix = 0;
        while (await prisma.artist.findUnique({ where: { slug } })) {
          suffix++;
          slug = `${slugify(u.name)}-${suffix}`;
        }
        await prisma.artist.create({
          data: { userId: u.id, name: u.name, slug, country: 'ZA', currency: 'ZAR' },
        });
        fixes.push(`Created missing Artist record (slug: ${slug})`);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    if (fixes.length > 0 || errors.length > 0) {
      results.push({ email: u.email, fixes, errors });
    }
  }

  return NextResponse.json({
    ok: true,
    usersScanned: users.length,
    usersFixed: results.filter(r => r.fixes.length > 0).length,
    results,
  });
}
