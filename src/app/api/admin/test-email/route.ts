// Admin-only endpoint to test email configuration
// Usage: GET /api/admin/test-email?to=you@email.com&secret=YOUR_ADMIN_SECRET
import { NextRequest, NextResponse } from 'next/server';
import { sendPurchaseConfirmation } from '@/lib/emails';

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  const to = req.nextUrl.searchParams.get('to');

  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!to) return NextResponse.json({ error: 'Missing to email' }, { status: 400 });

  // Check env
  const checks = {
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM || 'noreply@vuka.app (default)',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'NOT SET',
  };

  try {
    const result = await sendPurchaseConfirmation({
      to,
      buyerName: 'Test User',
      itemName: 'Test Beat',
      itemType: 'beat',
      licenseType: 'basic',
      downloadUrl: `${process.env.NEXT_PUBLIC_APP_URL}/download/test-token-123`,
      amount: 99,
      currency: 'ZAR',
      licenseId: 'TEST-LICENSE-001',
    });
    return NextResponse.json({ success: true, checks, result });
  } catch (err: any) {
    return NextResponse.json({ success: false, checks, error: err.message });
  }
}
