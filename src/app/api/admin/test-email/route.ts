/**
 * Admin email test endpoint — Phase 9
 * Tests any of the 16 email templates.
 * GET /api/admin/test-email?to=you@email.com&secret=SECRET&template=welcome
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  sendWelcome,
  sendVerifyEmail,
  sendMagicLink,
  sendNewDeviceAlert,
  sendReleaseSubmitted,
  sendReleaseApproved,
  sendReleaseRejected,
  sendReleaseLive,
  sendEarningsAvailable,
  sendPayoutRequested,
  sendPayoutApproved,
  sendPayoutProcessed,
  sendPayoutFailed,
  sendAccountSuspended,
  sendLoginAlert,
  sendBroadcast,
  sendTestEmail,
} from '@/lib/emails';

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://vuka.co.za';

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  const to = req.nextUrl.searchParams.get('to');
  const template = req.nextUrl.searchParams.get('template') || 'test';

  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!to) return NextResponse.json({ error: 'Missing ?to=' }, { status: 400 });

  const envChecks = {
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM || 'using default',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'NOT SET',
  };

  try {
    let result: any;
    const base = APP_URL();
    const now = new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' });

    switch (template) {
      case 'welcome':
        result = await sendWelcome({ to, displayName: 'Test Artist', verifyUrl: `${base}/verify?token=test` });
        break;
      case 'verify-email':
        result = await sendVerifyEmail({ to, displayName: 'Test Artist', verifyUrl: `${base}/verify?token=test` });
        break;
      case 'magic-link':
        result = await sendMagicLink({ to, displayName: 'Test Admin', magicUrl: `${base}/admin/auth?token=test`, isAdmin: true });
        break;
      case 'new-device-alert':
        result = await sendNewDeviceAlert({
          to, displayName: 'Test Artist',
          deviceName: 'Chrome on macOS', location: 'Johannesburg, ZA',
          ipAddress: '196.25.1.1', time: now,
          securityUrl: `${base}/dashboard/settings#sessions`,
        });
        break;
      case 'release-submitted':
        result = await sendReleaseSubmitted({
          to, artistName: 'Test Artist', releaseTitle: 'Test Single',
          releaseType: 'SINGLE', trackCount: 1,
          releaseUrl: `${base}/dashboard/releases/test-id`,
        });
        break;
      case 'release-approved':
        result = await sendReleaseApproved({
          to, artistName: 'Test Artist', releaseTitle: 'Test Single',
          releaseType: 'SINGLE',
          platforms: ['Spotify', 'Apple Music', 'YouTube Music', 'Boomplay', 'Audiomack'],
          expectedLiveDate: '5–7 business days',
          releaseUrl: `${base}/dashboard/releases/test-id`,
        });
        break;
      case 'release-rejected':
        result = await sendReleaseRejected({
          to, artistName: 'Test Artist', releaseTitle: 'Test Single',
          reason: 'Artwork does not meet minimum resolution of 3000×3000px. Please re-upload a higher resolution image.',
          releaseUrl: `${base}/dashboard/releases/test-id`,
          fixGuideUrl: `${base}/help/artwork-requirements`,
        });
        break;
      case 'release-live':
        result = await sendReleaseLive({
          to, artistName: 'Test Artist', releaseTitle: 'Test Single',
          platforms: ['Spotify', 'Apple Music', 'YouTube Music', 'Boomplay', 'Audiomack', 'Deezer'],
          shareUrl: `${base}/releases/test-id`,
          releaseUrl: `${base}/dashboard/releases/test-id`,
        });
        break;
      case 'earnings-available':
        result = await sendEarningsAvailable({
          to, artistName: 'Test Artist', period: 'May 2026',
          grossAmount: 1250.50, netAmount: 1187.98, currency: 'ZAR',
          topTrack: 'Groove & Flow (feat. DJ Maphorisa)',
          totalStreams: 48312,
          earningsUrl: `${base}/dashboard/earnings`,
        });
        break;
      case 'payout-requested':
        result = await sendPayoutRequested({
          to, artistName: 'Test Artist', amount: 500, currency: 'ZAR',
          payoutMethod: 'Bank Transfer (FNB)', referenceNumber: 'VKA-2026-001234',
          payoutsUrl: `${base}/dashboard/payouts`,
        });
        break;
      case 'payout-approved':
        result = await sendPayoutApproved({
          to, artistName: 'Test Artist', amount: 500, currency: 'ZAR',
          payoutMethod: 'Bank Transfer (FNB)', referenceNumber: 'VKA-2026-001234',
          processingDays: 2,
          payoutsUrl: `${base}/dashboard/payouts`,
        });
        break;
      case 'payout-processed':
        result = await sendPayoutProcessed({
          to, artistName: 'Test Artist', amount: 500, currency: 'ZAR',
          payoutMethod: 'Bank Transfer (FNB)', referenceNumber: 'VKA-2026-001234',
          bankLast4: '4521',
          payoutsUrl: `${base}/dashboard/payouts`,
        });
        break;
      case 'payout-failed':
        result = await sendPayoutFailed({
          to, artistName: 'Test Artist', amount: 500, currency: 'ZAR',
          reason: 'Invalid account number. The account number provided does not match the branch code on file.',
          referenceNumber: 'VKA-2026-001234',
          payoutsUrl: `${base}/dashboard/payouts/account`,
        });
        break;
      case 'account-suspended':
        result = await sendAccountSuspended({
          to, displayName: 'Test Artist',
          reason: 'Violation of Vuka Terms of Service — Section 4.2: Distribution of unlicensed content.',
          appealUrl: `${base}/appeal?ref=SUSP-001`,
          suspendedUntil: '30 June 2026',
        });
        break;
      case 'new-login-alert':
        result = await sendLoginAlert({
          to, displayName: 'Test Artist',
          deviceName: 'Firefox on Windows 11', location: 'Cape Town, ZA',
          time: now,
          securityUrl: `${base}/dashboard/settings#sessions`,
        });
        break;
      case 'broadcast':
        result = await sendBroadcast({
          to, displayName: 'Test Artist',
          subject: 'Vuka Platform Update — New Feature Available',
          title: '🎉 New Feature: Pre-Save Campaigns',
          body: `We've just launched Pre-Save Campaigns!\n\nYou can now create a pre-save link for any upcoming release and share it with fans before your drop date.\n\nFans who pre-save will automatically have your release in their library on release day.`,
          ctaLabel: 'Try Pre-Save Campaigns →',
          ctaUrl: `${base}/dashboard/releases/new`,
        });
        break;
      case 'test':
      default:
        result = await sendTestEmail(to);
    }

    return NextResponse.json({
      success: true,
      template,
      envChecks,
      result,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      template,
      envChecks,
      error: err.message,
    }, { status: 500 });
  }
}

// POST: send bulk test of all 16 templates at once
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { to } = body;
  if (!to) return NextResponse.json({ error: 'Missing to' }, { status: 400 });

  const templates = [
    'welcome', 'verify-email', 'magic-link', 'new-device-alert',
    'release-submitted', 'release-approved', 'release-rejected', 'release-live',
    'earnings-available', 'payout-requested', 'payout-approved', 'payout-processed',
    'payout-failed', 'account-suspended', 'new-login-alert', 'broadcast',
  ];

  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://vuka.co.za';
  const results: Record<string, string> = {};

  for (const t of templates) {
    try {
      const url = new URL(`${base}/api/admin/test-email`);
      url.searchParams.set('to', to);
      url.searchParams.set('secret', process.env.ADMIN_SECRET!);
      url.searchParams.set('template', t);
      await fetch(url.toString());
      results[t] = 'sent';
    } catch {
      results[t] = 'failed';
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  return NextResponse.json({ success: true, results });
}
