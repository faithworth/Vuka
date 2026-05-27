// ============================================================
// PHASE 2 — src/app/api/licensing/verify/route.ts
// Public license verification — anyone can verify a license key
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { verifyLicense } from '@/lib/licensing';

// GET /api/licensing/verify?key=XXX
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');

  if (!key?.trim()) {
    return NextResponse.json({ error: 'License key required' }, { status: 400 });
  }

  try {
    const result = await verifyLicense(key.trim());
    const status = result.valid ? 200 : 404;
    return NextResponse.json(result, { status });
  } catch (err) {
    console.error('[licensing/verify] GET error:', err);
    return NextResponse.json({ error: 'Verification failed' }, { status: 503 });
  }
}
