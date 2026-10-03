export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { getPresignedDownloadUrl } from '@/lib/r2';
import prisma from '@/lib/prisma';

// GET /api/admin/verification/[requestId]/document
// Admin-only. Redirects to a 5-minute presigned R2 URL for the ID document
// tied to this verification request. Nothing about the document's location
// is ever persisted as a public link — this route is the only way to view one.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const user = await getServerUser();
  if (!user || !['owner', 'super_admin', 'admin', 'moderator'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { requestId } = await params;
  const request = await prisma.verificationRequest.findUnique({
    where: { id: requestId },
    select: { idDocumentUrl: true },
  });
  if (!request?.idDocumentUrl) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // The artist form stores '{"front":"private/verification/...","back":"..."}'.
  // Older submissions may hold a single plain key (treated as the front).
  const side = req.nextUrl.searchParams.get('side') === 'back' ? 'back' : 'front';
  let key = '';
  try {
    const parsed = JSON.parse(request.idDocumentUrl);
    key = typeof parsed?.[side] === 'string' ? parsed[side] : '';
  } catch {
    key = side === 'front' ? request.idDocumentUrl : '';
  }
  if (!key) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Defense in depth: only verification objects may ever be exposed through
  // this admin document endpoint. Never sign arbitrary R2 keys from the DB.
  if (!key.startsWith('private/verification/') || key.includes('..')) {
    return NextResponse.json({ error: 'Invalid verification document reference' }, { status: 500 });
  }

  const signedUrl = await getPresignedDownloadUrl(key, 300); // 5 min
  return NextResponse.redirect(signedUrl);
}
