/**
 * VUKA — Change Password (authenticated)  (Phase 10)
 * POST /api/auth/change-password
 *
 * Body: { newPassword: string; currentSessionId?: string }
 * Revokes all other sessions after success.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase_server';
import { revokeAllOtherSessions } from '@/lib/security/deviceSessions';
import { sendPasswordChangedEmail } from '@/lib/emails';
import { auditLog } from '@/lib/audit';
import { rateLimit, getClientIp } from '@/lib/rateLimit';

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? 'https://vuka.co.za';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limited = await rateLimit(
    user.id,
    { key: 'change_password', max: 5, windowMs: 3_600_000 },
    ip
  );
  if (limited) {
    return NextResponse.json({ error: 'Too many attempts. Please wait.' }, { status: 429 });
  }

  let newPassword = '';
  let currentSessionId: string | undefined;
  try {
    const body = await req.json();
    if (typeof body.newPassword === 'string') newPassword = body.newPassword;
    if (typeof body.currentSessionId === 'string') currentSessionId = body.currentSessionId;
  } catch { /* ignore */ }

  if (!newPassword) {
    return NextResponse.json({ error: 'New password is required.' }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }
  if (newPassword.length > 128) {
    return NextResponse.json({ error: 'Password is too long.' }, { status: 400 });
  }

  const supabase = await createServiceClient();

  // Find the Supabase user by email
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) {
    return NextResponse.json({ error: 'Failed to locate account.' }, { status: 500 });
  }

  const sbUser = list?.users?.find(
    u => u.email?.toLowerCase() === user.email?.toLowerCase()
  );
  if (!sbUser) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  }

  const { error: updateErr } = await supabase.auth.admin.updateUserById(
    sbUser.id,
    { password: newPassword }
  );
  if (updateErr) {
    return NextResponse.json(
      { error: updateErr.message ?? 'Failed to change password.' },
      { status: 400 }
    );
  }

  // Revoke all other sessions
  await revokeAllOtherSessions(user.id, currentSessionId);

  sendPasswordChangedEmail({
    to: user.email,
    displayName: user.name,
    securityUrl: `${APP_URL()}/settings/security`,
  }).catch(() => { /* non-blocking */ });

  auditLog.adminAction(
    'auth.password_changed', 'user', user.id, user.id,
    'Password changed from security settings'
  );

  return NextResponse.json({
    ok: true,
    message: 'Password changed. All other devices have been signed out.',
  });
}
