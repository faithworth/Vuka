// src/app/api/admin/plans/route.ts
// Admin: list artists + plan info, set/cancel/extend plans.
// GET uses $queryRawUnsafe so it works with any Prisma client version.
// POST uses $executeRaw for mutations on planSlug/planExpiresAt.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { PLANS } from '@/lib/plans';
import { auditLog } from '@/lib/audit';
import prisma, { queryRaw, executeRaw } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const planFilter = searchParams.get('plan') || 'all';
  const q          = searchParams.get('q')    || '';
  const page       = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit      = 50;
  const offset     = (page - 1) * limit;

  try {
    const conditions: string[] = [];
    const params: any[]        = [];
    let   pi                   = 1;

    if (planFilter !== 'all') {
      conditions.push(`a."planSlug" = $${pi}`);
      params.push(planFilter);
      pi++;
    }
    if (q) {
      conditions.push(`(a.name ILIKE $${pi} OR u.email ILIKE $${pi})`);
      params.push(`%${q}%`);
      pi++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows, countRows, planCountRows] = await Promise.all([
      queryRaw<any>(`
        SELECT
          a.id, a.name, a.slug, a."planSlug", a."planExpiresAt", a."createdAt",
          u.id    AS "userId",
          u.email AS "userEmail",
          u."createdAt" AS "userCreatedAt",
          (SELECT COUNT(*) FROM "Beat"    b WHERE b."artistId" = a.id)::int AS beats,
          (SELECT COUNT(*) FROM "Release" r WHERE r."artistId" = a.id)::int AS releases
        FROM "Artist" a
        JOIN "User" u ON u.id = a."userId"
        ${where}
        ORDER BY a."createdAt" DESC
        LIMIT ${limit} OFFSET ${offset}
      `, ...params),
      queryRaw<any>(`
        SELECT COUNT(*)::int AS total
        FROM "Artist" a
        JOIN "User" u ON u.id = a."userId"
        ${where}
      `, ...params),
      queryRaw<any>(`
        SELECT "planSlug", COUNT(*)::int AS cnt FROM "Artist" GROUP BY "planSlug"
      `),
    ]);

    const total = countRows[0]?.total ?? 0;

    // Load recent subscription history per artist (best-effort)
    let subsByArtist: Record<string, any[]> = {};
    try {
      const artistIds = rows.map(r => r.id);
      if (artistIds.length > 0) {
        const placeholders = artistIds.map((_: any, i: number) => `$${i + 1}`).join(',');
        const subs = await queryRaw<any>(`
          SELECT * FROM "artist_plan_subscriptions"
          WHERE "artistId" IN (${placeholders})
          ORDER BY "createdAt" DESC
        `, ...artistIds);
        for (const s of subs) {
          if (!subsByArtist[s.artistId]) subsByArtist[s.artistId] = [];
          if (subsByArtist[s.artistId].length < 5) subsByArtist[s.artistId].push(s);
        }
      }
    } catch { /* table may not exist yet */ }

    const artists = rows.map(r => ({
      id:           r.id,
      name:         r.name,
      slug:         r.slug,
      planSlug:     r.planSlug ?? 'free',
      planExpiresAt: r.planExpiresAt ?? null,
      user:         { id: r.userId, email: r.userEmail, createdAt: r.userCreatedAt },
      planSubscriptions: subsByArtist[r.id] ?? [],
      _count:       { beats: r.beats ?? 0, releases: r.releases ?? 0 },
    }));

    const planCounts = planCountRows.reduce((acc: any, row: any) => {
      acc[row.planSlug ?? 'free'] = row.cnt;
      return acc;
    }, {});

    let incompleteCount = 0;
    try {
      const [ic] = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*)::int AS cnt FROM "User"
        WHERE role = 'artist'
          AND id NOT IN (SELECT "userId" FROM "Artist")
      `;
      incompleteCount = ic?.cnt ?? 0;
    } catch { /* non-critical */ }

    return NextResponse.json({ artists, total, page, pages: Math.ceil(total / limit), planCounts, incompleteArtistCount: incompleteCount });
  } catch (err: any) {
    console.error('[admin/plans] GET error:', err?.message);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

// POST — set_plan | cancel_plan | extend_plan
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { artistId, action, planSlug, months } = await req.json();
    if (!artistId || !action)
      return NextResponse.json({ error: 'artistId and action required' }, { status: 400 });

    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, name, "planSlug", "planExpiresAt" FROM "Artist" WHERE id = ${artistId} LIMIT 1
    `;
    if (!rows.length) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    const artist = rows[0];

    switch (action) {
      case 'set_plan': {
        const plan = PLANS.find(p => p.slug === planSlug);
        if (!plan) return NextResponse.json({ error: 'Invalid plan slug' }, { status: 400 });

        const now = new Date();
        let expiresAt: Date | null = null;
        if (plan.priceZAR > 0 && months && months > 0) {
          expiresAt = new Date(now);
          expiresAt.setMonth(expiresAt.getMonth() + months);
        }

        await prisma.$executeRaw`
          UPDATE "Artist" SET "planSlug" = ${plan.slug}, "planExpiresAt" = ${expiresAt} WHERE id = ${artistId}
        `;

        if (plan.priceZAR > 0) {
          const periodEnd = expiresAt ?? new Date(now.getFullYear() + 10, now.getMonth(), now.getDate());
          try {
            await prisma.$executeRaw`
              INSERT INTO "artist_plan_subscriptions"
                (id, "artistId", "planSlug", status, amount, currency, "billingInterval",
                 "currentPeriodStart", "currentPeriodEnd", "createdAt", "updatedAt")
              VALUES
                (gen_random_uuid()::text, ${artistId}, ${plan.slug}, 'active', ${plan.priceZAR},
                 'ZAR', 'monthly', ${now}, ${periodEnd}, ${now}, ${now})
            `;
          } catch { /* table may not exist — non-fatal */ }
        }

        await auditLog.adminAction('plan.admin_override', 'Artist', artistId, admin.id,
          `Admin set plan to ${plan.slug} (expires ${expiresAt?.toISOString() ?? 'never'})`);
        return NextResponse.json({ ok: true, planSlug: plan.slug, planExpiresAt: expiresAt });
      }

      case 'cancel_plan': {
        await prisma.$executeRaw`
          UPDATE "Artist" SET "planSlug" = 'free', "planExpiresAt" = NULL WHERE id = ${artistId}
        `;
        try {
          await prisma.$executeRaw`
            UPDATE "artist_plan_subscriptions"
            SET status = 'cancelled', "cancelledAt" = ${new Date()}, "updatedAt" = ${new Date()}
            WHERE "artistId" = ${artistId} AND status = 'active'
          `;
        } catch { /* non-fatal */ }

        await auditLog.adminAction('plan.admin_cancel', 'Artist', artistId, admin.id,
          `Admin cancelled plan from ${artist.planSlug}`);
        return NextResponse.json({ ok: true });
      }

      case 'extend_plan': {
        const extMonths = months || 1;
        const base = artist.planExpiresAt && new Date(artist.planExpiresAt) > new Date()
          ? new Date(artist.planExpiresAt) : new Date();
        base.setMonth(base.getMonth() + extMonths);

        await prisma.$executeRaw`
          UPDATE "Artist" SET "planExpiresAt" = ${base} WHERE id = ${artistId}
        `;
        await auditLog.adminAction('plan.admin_extend', 'Artist', artistId, admin.id,
          `Admin extended plan by ${extMonths} month(s) to ${base.toISOString()}`);
        return NextResponse.json({ ok: true, planExpiresAt: base });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[admin/plans] POST error:', err?.message);
    return NextResponse.json({ error: 'Action failed' }, { status: 503 });
  }
}
