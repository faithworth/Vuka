// ============================================================
// PHASE 2 — src/app/api/creator/storefront/route.ts
// Creator storefront: get/update/publish artist storefront page
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { getOrCreateStorefront, updateStorefront } from '@/lib/creator';

// GET — get caller's storefront
export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const storefront = await getOrCreateStorefront(user.artist.id);
    return NextResponse.json({ storefront });
  } catch (err) {
    console.error('[creator/storefront] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

// PATCH — update storefront
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const storefront = await updateStorefront(user.artist.id, body);
    return NextResponse.json({ storefront });
  } catch (err: any) {
    console.error('[creator/storefront] PATCH error:', err?.message);
    return NextResponse.json({ error: 'Update failed' }, { status: 503 });
  }
}
