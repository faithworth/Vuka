// src/app/api/admin/distribution/route.ts
// Vuka is a direct-to-fan sales platform — DSP distribution has been removed.
// This endpoint is intentionally disabled. Artists upload music directly and
// sell to fans; no DSP delivery pipeline exists.

import { NextRequest, NextResponse } from 'next/server';

const GONE = {
  error: 'DSP distribution has been removed from Vuka.',
  message:
    'Vuka is a direct-to-fan platform. Artists upload releases and sell directly to fans. ' +
    'No DSP delivery pipeline exists.',
};

export async function GET(_req: NextRequest) {
  return NextResponse.json(GONE, { status: 410 });
}

export async function POST(_req: NextRequest) {
  return NextResponse.json(GONE, { status: 410 });
}
