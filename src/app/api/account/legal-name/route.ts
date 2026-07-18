// src/app/api/account/legal-name/route.ts
// Lets an authenticated artist/producer set their legalName once, after the
// fact — covers Google OAuth signups, which skip the registration form
// entirely and never get a chance to provide it. Never overwrites an
// existing legalName; this is a one-time backfill, not a settings field.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const schema = z.object({
  legalName: z.string().min(2).max(150).trim(),
});

export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid legal name' }, { status: 400 });
  }

  if (user.legalName) {
    // Already on file — don't let this endpoint silently overwrite it.
    // Legal name changes should go through support, not a self-serve API.
    return NextResponse.json({ error: 'Legal name is already on file. Contact support to change it.' }, { status: 409 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { legalName: parsed.data.legalName },
    select: { id: true, legalName: true },
  });

  return NextResponse.json({ ok: true, legalName: updated.legalName });
}
