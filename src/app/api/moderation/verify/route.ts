export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { submitVerificationRequest, reviewVerificationRequest, getVerificationRequestByArtist, listVerificationRequests } from '@/lib/moderation';
import prisma from '@/lib/prisma';

// GET /api/moderation/verify
// Admin (role in the allowed list) → the pending review queue (?status=pending|approved|rejected).
// Artist → their own verification request status, or null if never submitted.
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (['owner', 'super_admin', 'admin', 'moderator'].includes(user.role)) {
      const status = req.nextUrl.searchParams.get('status') || 'pending';
      const requests = await listVerificationRequests(status);
      return NextResponse.json({ requests });
    }

    const artist = await prisma.artist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!artist) return NextResponse.json({ error: 'Artist profile not found' }, { status: 404 });

    const request = await getVerificationRequestByArtist(artist.id);
    return NextResponse.json({ request });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to load verification status';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// POST /api/moderation/verify — artist submits verification request
export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const artist = await prisma.artist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!artist) return NextResponse.json({ error: 'Artist profile not found' }, { status: 404 });

    const body = await req.json();
    const request = await submitVerificationRequest(artist.id, {
      legalName:      body.legalName || body.artistName || user.name || '',
      idDocumentUrl:  body.idDocumentUrl || '',
      socialProofUrl: body.socialLinks || body.socialProofUrl || '',
      additionalInfo: body.notes || body.additionalInfo || '',
    });

    return NextResponse.json({ request }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to submit verification';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// PATCH /api/moderation/verify — admin approves/rejects verification
// Body: { requestId, decision: 'approved'|'rejected', adminNotes? }
export async function PATCH(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user || !['owner','super_admin','admin','moderator'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { requestId, decision, adminNotes } = await req.json();
    if (!requestId || !decision) {
      return NextResponse.json({ error: 'requestId and decision required' }, { status: 400 });
    }

    await reviewVerificationRequest(requestId, user.email, decision, adminNotes);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to review verification';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
