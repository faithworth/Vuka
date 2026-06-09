// ============================================================
// src/app/api/admin/plans/route.ts
// Admin: list all plan subscriptions, manually set/cancel plans.
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { PLANS } from '@/lib/plans';
import { auditLog } from '@/lib/audit';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const planFilter  = searchParams.get('plan')   || 'all';   // free|pro|label|all
  const statusFilter = searchParams.get('status') || 'all';  // active|cancelled|expired|all
  const q           = searchParams.get('q')       || '';
  const page        = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit       = 50;

  try {
    // Build artist filter — planSlug may not exist yet if migration hasn't run
    let artistWhere: any = {};
    let columnExists = true;

    try {
      // Quick probe: if this throws, planSlug column doesn't exist yet
      await prisma.$queryRaw`SELECT "planSlug" FROM "Artist" LIMIT 1`;
    } catch {
      columnExists = false;
    }

    if (columnExists && planFilter !== 'all') artistWhere.planSlug = planFilter;
    if (q) {
      artistWhere.OR = [
        { name:  { contains: q, mode: 'insensitive' } },
        { user:  { email: { contains: q, mode: 'insensitive' } } },
      ];
    }

    if (!columnExists) {
      // Column not yet added — return all artists with planSlug='free' fallback
      const artists = await prisma.artist.findMany({
        where: artistWhere,
        select: {
          id: true, name: true, slug: true,
          user: { select: { id: true, email: true, createdAt: true } },
          _count: { select: { beats: true, releases: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      });
      const total = await prisma.artist.count({ where: artistWhere });
      return NextResponse.json({
        artists: artists.map(a => ({ ...a, planSlug: 'free', planExpiresAt: null, planSubscriptions: [] })),
        total, page, pages: Math.ceil(total / limit),
        planCounts: { free: total, pro: 0, label: 0 },
        warning: 'Run the SQL migration to add planSlug column',
      });
    }

    const [artists, total] = await Promise.all([
      prisma.artist.findMany({
        where: artistWhere,
        select: {
          id: true,
          name: true,
          slug: true,
          planSlug: true,
          planExpiresAt: true,
          user: { select: { id: true, email: true, createdAt: true } },
          planSubscriptions: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          _count: { select: { beats: true, releases: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.artist.count({ where: artistWhere }),
    ]);

    // Summary counts
    const planCounts = await prisma.artist.groupBy({
      by: ['planSlug'],
      _count: { _all: true },
    });

    // Count users with artist role who have no Artist profile (incomplete setup)
    // Wrapped in try/catch — non-critical, page works fine if this fails
    let incompleteCount = 0;
    try {
      incompleteCount = await prisma.user.count({
        where: { role: 'artist', artist: { is: null } },
      });
    } catch { /* ignore — schema may vary */ }

    return NextResponse.json({
      artists,
      total,
      page,
      pages: Math.ceil(total / limit),
      planCounts: planCounts.reduce((acc: any, row) => {
        acc[row.planSlug] = row._count._all;
        return acc;
      }, {}),
      incompleteArtistCount: incompleteCount,
    });
  } catch (err: any) {
    console.error('[admin/plans] GET error:', err?.message);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

// POST — admin override: set_plan | cancel_plan | extend_plan
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { artistId, action, planSlug, months } = await req.json();
    if (!artistId || !action) {
      return NextResponse.json({ error: 'artistId and action required' }, { status: 400 });
    }

    const artist = await prisma.artist.findUnique({
      where: { id: artistId },
      select: { id: true, name: true, planSlug: true, planExpiresAt: true },
    });
    if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

    switch (action) {
      case 'set_plan': {
        const plan = PLANS.find(p => p.slug === planSlug);
        if (!plan) return NextResponse.json({ error: 'Invalid plan slug' }, { status: 400 });

        const now = new Date();
        // null = lifetime / never expires (owner promo, admin override with no expiry).
        // Only set an expiry when caller explicitly passes months > 0.
        let expiresAt: Date | null = null;
        if (plan.priceZAR > 0 && months && months > 0) {
          expiresAt = new Date(now);
          expiresAt.setMonth(expiresAt.getMonth() + months);
        }

        await prisma.artist.update({
          where: { id: artistId },
          data: { planSlug: plan.slug, planExpiresAt: expiresAt },
        });

        // Record the subscription. For lifetime grants, currentPeriodEnd is
        // set far in the future (10 years) so the record is always valid.
        if (plan.priceZAR > 0) {
          const periodEnd = expiresAt ?? (() => {
            const d = new Date(now);
            d.setFullYear(d.getFullYear() + 10);
            return d;
          })();

          await (prisma as any).artistPlanSubscription.create({
            data: {
              artistId,
              planSlug: plan.slug,
              status: 'active',
              amount: plan.priceZAR,
              currency: 'ZAR',
              billingInterval: 'monthly',
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
            },
          });
        }

        await auditLog.adminAction(
          'plan.admin_override',
          'Artist',
          artistId,
          admin.id,
          `Admin set plan to ${plan.slug} (expires ${expiresAt?.toISOString() ?? 'never'})`,
        );

        return NextResponse.json({ ok: true, planSlug: plan.slug, planExpiresAt: expiresAt });
      }

      case 'cancel_plan': {
        // Cancel immediately: drop to free
        await prisma.artist.update({
          where: { id: artistId },
          data: { planSlug: 'free', planExpiresAt: null },
        });

        // Mark active subs as cancelled
        await (prisma as any).artistPlanSubscription.updateMany({
          where: { artistId, status: 'active' },
          data: { status: 'cancelled', cancelledAt: new Date() },
        });

        await auditLog.adminAction(
          'plan.admin_cancel',
          'Artist',
          artistId,
          admin.id,
          `Admin force-cancelled plan from ${artist.planSlug}`,
        );

        return NextResponse.json({ ok: true });
      }

      case 'extend_plan': {
        const extMonths = months || 1;
        const base = artist.planExpiresAt && new Date(artist.planExpiresAt) > new Date()
          ? new Date(artist.planExpiresAt)
          : new Date();
        base.setMonth(base.getMonth() + extMonths);

        await prisma.artist.update({
          where: { id: artistId },
          data: { planExpiresAt: base },
        });

        await auditLog.adminAction(
          'plan.admin_extend',
          'Artist',
          artistId,
          admin.id,
          `Admin extended plan by ${extMonths} month(s) to ${base.toISOString()}`,
        );

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
