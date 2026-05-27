// ============================================================
// PHASE 2 — src/app/api/licensing/beat/route.ts
// Beat license issuance and retrieval
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist, requireAuth } from '@/lib/auth';
import { issueBeatLicense, getBeatLicenses, getLicenseByPurchase } from '@/lib/licensing';

// GET — retrieve license for a purchase, or all licenses for an artist's beat
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const purchaseId = searchParams.get('purchaseId');
    const beatId     = searchParams.get('beatId');

    if (purchaseId) {
      const license = await getLicenseByPurchase(purchaseId);
      if (!license) return NextResponse.json({ error: 'License not found' }, { status: 404 });
      return NextResponse.json({ license });
    }

    if (beatId) {
      // Only the beat's artist can list all licenses
      if (!user.artist) return NextResponse.json({ error: 'Artist account required' }, { status: 403 });
      const licenses = await getBeatLicenses(beatId);
      return NextResponse.json({ licenses });
    }

    return NextResponse.json({ error: 'purchaseId or beatId required' }, { status: 400 });
  } catch (err) {
    console.error('[licensing/beat] GET error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}

// POST — issue a license for a confirmed purchase
// Called internally by transaction.ts after payment confirmation,
// but also available for admin re-issuance.
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { purchaseId, artistName, songTitle } = await req.json();
    if (!purchaseId) return NextResponse.json({ error: 'purchaseId required' }, { status: 400 });

    const result = await issueBeatLicense({
      purchaseId,
      buyerName: user.name,
      buyerEmail: user.email,
      artistName,
      songTitle,
    });

    return NextResponse.json({ ...result }, { status: 201 });
  } catch (err: any) {
    console.error('[licensing/beat] POST error:', err?.message);
    const code = err?.message?.includes('not confirmed') ? 409
               : err?.message?.includes('not found') ? 404
               : 503;
    return NextResponse.json({ error: err?.message || 'License issuance failed' }, { status: code });
  }
}
