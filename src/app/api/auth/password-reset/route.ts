/**
 * VUKA — Password Reset Request  (Phase 10)
 * POST /api/auth/password-reset
 *
 * Body: { email: string }
 * Always returns 200 — prevents email enumeration.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createPasswordResetToken, getResetUrl } from '@/lib/security/passwordReset';
import { sendPasswordResetEmail } from '@/lib/emails';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);

  // Strict: 3 attempts per hour per IP
  const limited = await rateLimit(ip, RATE_LIMITS.password_reset, ip);
  if (limited) {
    return NextResponse.json(
      { error: 'Too many reset attempts. Please wait before trying again.' },
      { status: 429 }
    );
  }

  let email = '';
  try {
    const body = await req.json();
    if (typeof body.email === 'string') email = body.email.toLowerCase().trim();
  } catch { /* ignore */ }

  if (!email || !email.includes('@')) {
    return NextResponse.json({ ok: true }); // silent fail — prevent enumeration
  }

  const result = await createPasswordResetToken(email);

  if (result.ok && result.token) {
    const resetUrl = getResetUrl(result.token);
    sendPasswordResetEmail({
      to: email,
      displayName: result.name ?? 'there',
      resetUrl,
    }).catch(err => console.error('[password-reset] Email send failed:', err));
  }

  // Always return the same response
  return NextResponse.json({
    ok: true,
    message: 'If an account exists with that email, a reset link has been sent.',
  });
}
