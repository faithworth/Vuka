
/**
 * VUKA — Email System (Phase 9 Complete)
 * All 16 templates from spec + existing templates retained.
 *
 * Templates:
 *  1.  welcome             - New registration
 *  2.  verify-email        - Email verification
 *  3.  magic-link          - Magic link login
 *  4.  new-device-alert    - Login from new device
 *  7.  release-rejected    - Admin rejects with reason
 *  8.  release-live        - Release goes live
 *  9.  earnings-available  - Monthly earnings posted
 *  10. payout-requested    - Artist requests payout
 *  11. payout-approved     - Admin approves payout
 *  12. payout-processed    - Payment sent
 *  13. payout-failed       - Payment failed with reason
 *  14. account-suspended   - Account suspended with reason
 *  15. new-login-alert     - Successful login notification
 *  16. broadcast           - Admin broadcast (generic)
 *
 * Legacy (kept, untouched):
 *  - sendPurchaseConfirmation
 *  - sendArtistSaleNotification
 *  - sendSupportFanConfirmation
 *  - sendNewMessageNotification
 *  - sendMilestoneNotification
 *  - sendTestEmail
 *  - sendWelcomeArtist   (alias mapped → sendWelcome)
 *  - sendRedownloadLinks
 *  - sendSupportArtistNotification
 */

import { Resend } from 'resend';
import { platformFee as calcFee, getPlan } from './plans';

// ── Config ────────────────────────────────────────────────────

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  return new Resend(key);
}

const FROM = () => process.env.EMAIL_FROM || 'Vuka <noreply@mail.vukamusic.com>';
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://vukamusic.com';

// ── Shared layout wrapper ─────────────────────────────────────

function layout(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Vuka</title>
</head>
<body style="margin:0;padding:0;background:#0A0A0A;color:#F5F5F5;font-family:'DM Sans',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0A;min-height:100vh;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Logo -->
        <tr>
          <td align="center" style="padding-bottom:32px;">
            <span style="font-size:28px;font-weight:900;letter-spacing:-1px;background:linear-gradient(135deg,#A0E87C,#E8C87C);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">VUKA</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#111111;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td align="center" style="padding-top:24px;">
            <p style="color:#6B6B6B;font-size:12px;margin:0;">
              Vuka · Africa's Independent Music Platform<br/>
              <a href="${APP_URL()}/legal/privacy" style="color:#6B6B6B;">Privacy</a> &nbsp;·&nbsp;
              <a href="${APP_URL()}/legal/terms" style="color:#6B6B6B;">Terms</a> &nbsp;·&nbsp;
              <a href="${APP_URL()}/dashboard/settings" style="color:#6B6B6B;">Unsubscribe</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function card(content: string): string {
  return `<div style="padding:40px 32px;">${content}</div>`;
}

function btn(href: string, label: string, variant: 'primary' | 'danger' | 'secondary' = 'primary'): string {
  const bg =
    variant === 'primary'
      ? 'linear-gradient(135deg,#A0E87C,#6BB84A)'
      : variant === 'danger'
      ? '#FF4D4D'
      : '#1A1A1A';
  const color = variant === 'secondary' ? '#A0E87C' : '#0A0A0A';
  return `<a href="${href}" style="display:block;background:${bg};color:${color};text-decoration:none;text-align:center;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;margin-top:24px;">${label}</a>`;
}

function row(label: string, value: string, highlight = false): string {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:#A0A0A0;font-size:14px;">${label}</td>
    <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);text-align:right;font-weight:${highlight ? 700 : 400};color:${highlight ? '#A0E87C' : '#F5F5F5'};font-size:14px;">${value}</td>
  </tr>`;
}

function infoTable(rows: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#1A1A1A;border-radius:8px;padding:0 16px;margin:20px 0;">${rows}</table>`;
}

function heading(text: string): string {
  return `<h2 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#F5F5F5;">${text}</h2>`;
}

function sub(text: string): string {
  return `<p style="color:#A0A0A0;margin:0 0 24px;font-size:15px;line-height:1.6;">${text}</p>`;
}

function icon(emoji: string): string {
  return `<div style="font-size:48px;text-align:center;margin-bottom:20px;line-height:1;">${emoji}</div>`;
}

// ═══════════════════════════════════════════════════════════════
// 1. WELCOME — New registration
// ═══════════════════════════════════════════════════════════════

export async function sendWelcome({
  to,
  displayName,
  verifyUrl,
}: {
  to: string;
  displayName: string;
  verifyUrl: string;
}) {
  const subject = `Welcome to Vuka, ${displayName} 🎵`;
  const html = layout(
    card(`
      ${icon('🎵')}
      <div style="text-align:center;">
        ${heading(`Sharp, ${displayName}! Welcome to Vuka.`)}
        ${sub('You\'re joining Africa\'s independent music platform. Verify your email to unlock your dashboard and start distributing.')}
        ${btn(verifyUrl, 'Verify Email →')}
        <p style="color:#6B6B6B;font-size:12px;margin-top:16px;">Link expires in 24 hours. If you didn't sign up, ignore this email.</p>
      </div>
    `)
  );
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

// Legacy alias
export const sendWelcomeArtist = ({
  to,
  artistName,
  dashboardUrl,
}: {
  to: string;
  artistName: string;
  dashboardUrl: string;
}) =>
  sendWelcome({ to, displayName: artistName, verifyUrl: dashboardUrl });

// ═══════════════════════════════════════════════════════════════
// 2. VERIFY EMAIL
// ═══════════════════════════════════════════════════════════════

export async function sendVerifyEmail({
  to,
  displayName,
  verifyUrl,
}: {
  to: string;
  displayName: string;
  verifyUrl: string;
}) {
  const subject = `Verify your Vuka email address`;
  const html = layout(
    card(`
      ${icon('✉️')}
      <div style="text-align:center;">
        ${heading('Confirm your email')}
        ${sub(`Hey ${displayName}, click the button below to verify your email address and activate your account.`)}
        ${btn(verifyUrl, 'Verify Email Address →')}
        <p style="color:#6B6B6B;font-size:12px;margin-top:16px;">
          Or copy this link: <span style="font-family:monospace;color:#A0E87C;font-size:11px;">${verifyUrl}</span>
        </p>
        <p style="color:#6B6B6B;font-size:12px;margin-top:8px;">Link expires in 24 hours.</p>
      </div>
    `)
  );
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

// ═══════════════════════════════════════════════════════════════
// 3. MAGIC LINK
// ═══════════════════════════════════════════════════════════════

export async function sendMagicLink({
  to,
  displayName,
  magicUrl,
  isAdmin = false,
}: {
  to: string;
  displayName: string;
  magicUrl: string;
  isAdmin?: boolean;
}) {
  const subject = isAdmin
    ? `Vuka Admin — Your sign-in link`
    : `Your Vuka sign-in link`;
  const html = layout(
    card(`
      ${icon(isAdmin ? '🔐' : '⚡')}
      <div style="text-align:center;">
        ${heading(isAdmin ? 'Admin Sign-In Link' : 'Your Magic Link')}
        ${sub(
          isAdmin
            ? `Hey ${displayName}, here is your one-time admin sign-in link. It expires in 10 minutes and can only be used once.`
            : `Hey ${displayName}, click the button below to sign in — no password needed.`
        )}
        ${btn(magicUrl, isAdmin ? '🔐 Sign In to Admin →' : '⚡ Sign In to Vuka →')}
        <p style="color:#6B6B6B;font-size:12px;margin-top:16px;">
          ${isAdmin ? 'This link expires in 10 minutes and is IP-bound.' : 'This link expires in 15 minutes. If you didn\'t request this, ignore it safely.'}
        </p>
      </div>
    `)
  );
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

// ═══════════════════════════════════════════════════════════════
// 4. NEW DEVICE ALERT
// ═══════════════════════════════════════════════════════════════

export async function sendNewDeviceAlert({
  to,
  displayName,
  deviceName,
  location,
  ipAddress,
  time,
  securityUrl,
}: {
  to: string;
  displayName: string;
  deviceName: string;
  location: string;
  ipAddress: string;
  time: string;
  securityUrl: string;
}) {
  const subject = `New login to your Vuka account — ${location}`;
  const html = layout(
    card(`
      ${icon('🔔')}
      ${heading('New device sign-in detected')}
      ${sub(`Hey ${displayName}, a new device just signed in to your Vuka account. If this was you, no action needed.`)}
      ${infoTable(`
        ${row('Device', deviceName)}
        ${row('Location', location)}
        ${row('IP Address', `<span style="font-family:monospace">${ipAddress}</span>`)}
        ${row('Time', time)}
      `)}
      <p style="color:#A0A0A0;font-size:14px;">If you don't recognise this login, secure your account immediately.</p>
      ${btn(securityUrl, '🔒 Secure My Account', 'danger')}
    `)
  );
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

// Alias for backward compat
export const sendNewLoginAlert = sendNewDeviceAlert;

// ═══════════════════════════════════════════════════════════════
// 5. RELEASE SUBMITTED
// ═══════════════════════════════════════════════════════════════

export async function sendReleaseSubmitted({
  to,
  artistName,
  releaseTitle,
  releaseType,
  trackCount,
  releaseUrl,
}: {
  to: string;
  artistName: string;
  releaseTitle: string;
  releaseType: string;
  trackCount: number;
  releaseUrl: string;
}) {
  const subject = `"${releaseTitle}" submitted for review — Vuka`;
  const html = layout(
    card(`
      ${icon('📤')}
      ${heading('Release submitted!')}
      ${sub(`Sharp, ${artistName}! Your ${releaseType.toLowerCase()} is now in the review queue. We'll notify you once it's approved.`)}
      ${infoTable(`
        ${row('Release', `<strong>${releaseTitle}</strong>`)}
        ${row('Type', releaseType)}
        ${row('Tracks', String(trackCount))}
        ${row('Status', '<span style="color:#E8C87C;">Pending Review</span>')}
        ${row('Expected Review', '2–5 business days')}
      `)}
      ${btn(releaseUrl, 'View Release →', 'secondary')}
    `)
  );
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

// ═══════════════════════════════════════════════════════════════
// 6. RELEASE APPROVED
// ═══════════════════════════════════════════════════════════════

export async function sendReleaseApproved({
  to,
  artistName,
  releaseTitle,
  releaseType,
  platforms,
  expectedLiveDate,
  releaseUrl,
}: {
  to: string;
  artistName: string;
  releaseTitle: string;
  releaseType: string;
  platforms: string[];
  expectedLiveDate: string;
  releaseUrl: string;
}) {
  const subject = `✅ "${releaseTitle}" approved — distribution starting`;
  const platformList = platforms.slice(0, 8).join(', ') + (platforms.length > 8 ? ` +${platforms.length - 8} more` : '');
  const html = layout(
    card(`
      ${icon('✅')}
      ${heading('Release approved!')}
      ${sub(`Sharp, ${artistName}! "${releaseTitle}" has been approved and distribution is starting now.`)}
      ${infoTable(`
        ${row('Release', `<strong>${releaseTitle}</strong>`)}
        ${row('Type', releaseType)}
        ${row('Platforms', platformList)}
        ${row('Expected Live', `<span style="color:#A0E87C;">${expectedLiveDate}</span>`)}
      `)}
      ${btn(releaseUrl, 'Track Distribution →')}
    `)
  );
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

// ═══════════════════════════════════════════════════════════════
// 7. RELEASE REJECTED
// ═══════════════════════════════════════════════════════════════

export async function sendReleaseRejected({
  to,
  artistName,
  releaseTitle,
  reason,
  fixGuideUrl,
  releaseUrl,
}: {
  to: string;
  artistName: string;
  releaseTitle: string;
  reason: string;
  fixGuideUrl?: string;
  releaseUrl: string;
}) {
  const subject = `Action needed: "${releaseTitle}" needs changes`;
  const html = layout(
    card(`
      ${icon('⚠️')}
      ${heading(`"${releaseTitle}" needs attention`)}
      ${sub(`Hey ${artistName}, unfortunately your release couldn't be approved as submitted. Here's what needs to change:`)}
      <div style="background:#1A1A1A;border-left:3px solid #FF4D4D;border-radius:0 8px 8px 0;padding:16px 20px;margin:20px 0;">
        <p style="color:#A0A0A0;font-size:12px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;">Reason for rejection</p>
        <p style="color:#F5F5F5;margin:0;font-size:15px;line-height:1.6;">${reason}</p>
      </div>
      <p style="color:#A0A0A0;font-size:14px;">Fix the issues and resubmit — your release will be re-reviewed within 1–2 business days.</p>
      ${btn(releaseUrl, 'Edit & Resubmit →')}
      ${fixGuideUrl ? btn(fixGuideUrl, 'View Fix Guide', 'secondary') : ''}
    `)
  );
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

// ═══════════════════════════════════════════════════════════════
// 7B. RELEASE TAKEN DOWN (post-publish moderation)
// ═══════════════════════════════════════════════════════════════
// Vuka publishes instantly with no pre-review queue, so this is sent only
// when an admin removes an already-live release for a guideline violation
// (distinct from sendReleaseRejected, which assumes a pre-publish review).

export async function sendReleaseTakenDown({
  to,
  artistName,
  releaseTitle,
  reason,
  releaseUrl,
}: {
  to: string;
  artistName: string;
  releaseTitle: string;
  reason: string;
  releaseUrl: string;
}) {
  const subject = `"${releaseTitle}" has been unpublished`;
  const html = layout(
    card(`
      ${icon('⚠️')}
      ${heading(`"${releaseTitle}" was unpublished`)}
      ${sub(`Hey ${artistName}, our team removed this release from the Vuka store.`)}
      <div style="background:#1A1A1A;border-left:3px solid #FF4D4D;border-radius:0 8px 8px 0;padding:16px 20px;margin:20px 0;">
        <p style="color:#A0A0A0;font-size:12px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;">Reason</p>
        <p style="color:#F5F5F5;margin:0;font-size:15px;line-height:1.6;">${reason}</p>
      </div>
      <p style="color:#A0A0A0;font-size:14px;">Existing fans who already purchased keep their downloads. Make any needed changes and you can republish from your dashboard.</p>
      ${btn(releaseUrl, 'Review & Republish →')}
    `)
  );
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

// ═══════════════════════════════════════════════════════════════
// 8. RELEASE LIVE
// ═══════════════════════════════════════════════════════════════

export async function sendReleaseLive({
  to,
  artistName,
  releaseTitle,
  shareUrl,
  releaseUrl,
}: {
  to: string;
  artistName: string;
  releaseTitle: string;
  shareUrl: string;
  releaseUrl: string;
  /** @deprecated Vuka sells directly — it no longer distributes to DSPs. Kept optional for callers mid-migration. */
  platforms?: string[];
}) {
  const subject = `🎉 "${releaseTitle}" is LIVE!`;
  const html = layout(
    card(`
      ${icon('🎉')}
      <div style="text-align:center;">
        ${heading(`"${releaseTitle}" is LIVE!`)}
        ${sub(`Sharp, ${artistName}! Your music is now live on Vuka and ready for fans to buy. Share it with the world!`)}
        ${btn(shareUrl, '🔗 Share My Release')}
        ${btn(releaseUrl, 'View Analytics →', 'secondary')}
      </div>
    `)
  );
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

// ═══════════════════════════════════════════════════════════════
// 9. EARNINGS AVAILABLE
// ═══════════════════════════════════════════════════════════════

export async function sendEarningsAvailable({
  to,
  artistName,
  period,
  grossAmount,
  netAmount,
  currency,
  topTrack,
  totalStreams,
  earningsUrl,
}: {
  to: string;
  artistName: string;
  period: string;
  grossAmount: number;
  netAmount: number;
  currency: string;
  topTrack?: string;
  totalStreams: number;
  earningsUrl: string;
}) {
  const subject = `💰 Your ${period} earnings are ready — ${currency} ${netAmount.toFixed(2)}`;
  const html = layout(
    card(`
      ${icon('💰')}
      ${heading(`Your ${period} earnings are ready`)}
      ${sub(`Sharp, ${artistName}! Your royalty report for ${period} has been processed.`)}
      <div style="background:#1A1A1A;border-radius:8px;padding:24px;margin:20px 0;text-align:center;">
        <p style="color:#A0A0A0;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px;">Available to Withdraw</p>
        <p style="font-size:40px;font-weight:900;color:#A0E87C;margin:0;font-family:monospace;">${currency} ${netAmount.toFixed(2)}</p>
      </div>
      ${infoTable(`
        ${row('Period', period)}
        ${row('Gross Earnings', `${currency} ${grossAmount.toFixed(2)}`)}
        ${row('Platform Fee', `−${currency} ${(grossAmount - netAmount).toFixed(2)}`)}
        ${row('Net Earnings', `${currency} ${netAmount.toFixed(2)}`, true)}
        ${row('Total Streams', totalStreams.toLocaleString())}
        ${topTrack ? row('Top Track', topTrack) : ''}
      `)}
      ${btn(earningsUrl, 'View Earnings & Request Payout →')}
    `)
  );
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

// ═══════════════════════════════════════════════════════════════
// 10. PAYOUT REQUESTED
// ═══════════════════════════════════════════════════════════════

export async function sendPayoutRequested({
  to,
  artistName,
  amount,
  currency,
  payoutMethod,
  referenceNumber,
  payoutsUrl,
}: {
  to: string;
  artistName: string;
  amount: number;
  currency: string;
  payoutMethod: string;
  referenceNumber: string;
  payoutsUrl: string;
}) {
  const subject = `Payout request received — ${currency} ${amount.toFixed(2)}`;
  const html = layout(
    card(`
      ${icon('🏦')}
      ${heading('Payout request received')}
      ${sub(`Hey ${artistName}, we've received your payout request. Admin will review and approve within 1–3 business days.`)}
      ${infoTable(`
        ${row('Amount', `${currency} ${amount.toFixed(2)}`, true)}
        ${row('Method', payoutMethod)}
        ${row('Reference', `<span style="font-family:monospace;font-size:12px;">${referenceNumber}</span>`)}
        ${row('Status', '<span style="color:#E8C87C;">Pending Approval</span>')}
      `)}
      ${btn(payoutsUrl, 'View Payout Status →', 'secondary')}
    `)
  );
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

// ═══════════════════════════════════════════════════════════════
// 11. PAYOUT APPROVED
// ═══════════════════════════════════════════════════════════════

export async function sendPayoutApproved({
  to,
  artistName,
  amount,
  currency,
  payoutMethod,
  referenceNumber,
  processingDays,
  payoutsUrl,
}: {
  to: string;
  artistName: string;
  amount: number;
  currency: string;
  payoutMethod: string;
  referenceNumber: string;
  processingDays: number;
  payoutsUrl: string;
}) {
  const subject = `✅ Payout approved — ${currency} ${amount.toFixed(2)} is on its way`;
  const html = layout(
    card(`
      ${icon('✅')}
      ${heading('Payout approved!')}
      ${sub(`Sharp, ${artistName}! Your payout has been approved and is now being processed.`)}
      ${infoTable(`
        ${row('Amount', `${currency} ${amount.toFixed(2)}`, true)}
        ${row('Method', payoutMethod)}
        ${row('Reference', `<span style="font-family:monospace;font-size:12px;">${referenceNumber}</span>`)}
        ${row('Status', '<span style="color:#A0E87C;">Processing</span>')}
        ${row('Expected Arrival', `${processingDays} business day${processingDays > 1 ? 's' : ''}`)}
      `)}
      ${btn(payoutsUrl, 'View Payout History →', 'secondary')}
    `)
  );
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

// ═══════════════════════════════════════════════════════════════
// 12. PAYOUT PROCESSED (Payment sent)
// ═══════════════════════════════════════════════════════════════

export async function sendPayoutProcessed({
  to,
  artistName,
  amount,
  currency,
  payoutMethod,
  referenceNumber,
  bankLast4,
  payoutsUrl,
}: {
  to: string;
  artistName: string;
  amount: number;
  currency: string;
  payoutMethod: string;
  referenceNumber: string;
  bankLast4?: string;
  payoutsUrl: string;
}) {
  const subject = `💸 Payment sent — ${currency} ${amount.toFixed(2)}`;
  const html = layout(
    card(`
      ${icon('💸')}
      ${heading('Your payment has been sent!')}
      ${sub(`Sharp, ${artistName}! Your payout of ${currency} ${amount.toFixed(2)} has been sent to your account.`)}
      ${infoTable(`
        ${row('Amount Sent', `${currency} ${amount.toFixed(2)}`, true)}
        ${row('Method', payoutMethod)}
        ${bankLast4 ? row('Account', `••••${bankLast4}`) : ''}
        ${row('Reference', `<span style="font-family:monospace;font-size:12px;">${referenceNumber}</span>`)}
        ${row('Status', '<span style="color:#A0E87C;">Completed ✓</span>')}
      `)}
      <p style="color:#A0A0A0;font-size:13px;">Allow 1–2 business days for funds to reflect in your account, depending on your bank.</p>
      ${btn(payoutsUrl, 'View Payout History →', 'secondary')}
    `)
  );
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

// ═══════════════════════════════════════════════════════════════
// 13. PAYOUT FAILED
// ═══════════════════════════════════════════════════════════════

export async function sendPayoutFailed({
  to,
  artistName,
  amount,
  currency,
  reason,
  referenceNumber,
  payoutsUrl,
}: {
  to: string;
  artistName: string;
  amount: number;
  currency: string;
  reason: string;
  referenceNumber: string;
  payoutsUrl: string;
}) {
  const subject = `⚠️ Payout failed — action needed`;
  const html = layout(
    card(`
      ${icon('⚠️')}
      ${heading('Payout could not be processed')}
      ${sub(`Hey ${artistName}, we were unable to process your payout of ${currency} ${amount.toFixed(2)}. Your funds are safe and have been returned to your balance.`)}
      <div style="background:#1A1A1A;border-left:3px solid #FF4D4D;border-radius:0 8px 8px 0;padding:16px 20px;margin:20px 0;">
        <p style="color:#A0A0A0;font-size:12px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;">Reason</p>
        <p style="color:#F5F5F5;margin:0;font-size:15px;line-height:1.6;">${reason}</p>
      </div>
      ${infoTable(`
        ${row('Amount', `${currency} ${amount.toFixed(2)}`)}
        ${row('Reference', `<span style="font-family:monospace;font-size:12px;">${referenceNumber}</span>`)}
        ${row('Status', '<span style="color:#FF4D4D;">Failed</span>')}
        ${row('Funds', '<span style="color:#A0E87C;">Returned to balance ✓</span>')}
      `)}
      <p style="color:#A0A0A0;font-size:14px;">Please update your payout account details and try again, or contact support.</p>
      ${btn(payoutsUrl, 'Update Payout Account →', 'danger')}
    `)
  );
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

// ═══════════════════════════════════════════════════════════════
// 14. ACCOUNT SUSPENDED
// ═══════════════════════════════════════════════════════════════

export async function sendAccountSuspended({
  to,
  displayName,
  reason,
  appealUrl,
  suspendedUntil,
}: {
  to: string;
  displayName: string;
  reason: string;
  appealUrl: string;
  suspendedUntil?: string;
}) {
  const subject = `Important: Your Vuka account has been suspended`;
  const html = layout(
    card(`
      ${icon('🚫')}
      ${heading('Account suspended')}
      ${sub(`Hey ${displayName}, your Vuka account has been suspended${suspendedUntil ? ` until ${suspendedUntil}` : ''}. Your content has been unpublished.`)}
      <div style="background:#1A1A1A;border-left:3px solid #FF4D4D;border-radius:0 8px 8px 0;padding:16px 20px;margin:20px 0;">
        <p style="color:#A0A0A0;font-size:12px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;">Reason</p>
        <p style="color:#F5F5F5;margin:0;font-size:15px;line-height:1.6;">${reason}</p>
      </div>
      ${suspendedUntil ? `<p style="color:#A0A0A0;font-size:14px;">Your account will be automatically reinstated on <strong>${suspendedUntil}</strong>.</p>` : ''}
      <p style="color:#A0A0A0;font-size:14px;">If you believe this is a mistake, you may submit an appeal below. Appeals are reviewed within 3 business days.</p>
      ${btn(appealUrl, 'Submit an Appeal', 'secondary')}
    `)
  );
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

// ═══════════════════════════════════════════════════════════════
// 15. NEW LOGIN ALERT (successful login notification)
// ═══════════════════════════════════════════════════════════════

export async function sendLoginAlert({
  to,
  displayName,
  deviceName,
  location,
  time,
  securityUrl,
}: {
  to: string;
  displayName: string;
  deviceName: string;
  location: string;
  time: string;
  securityUrl: string;
}) {
  const subject = `New sign-in to your Vuka account`;
  const html = layout(
    card(`
      ${icon('🔑')}
      ${heading('Successful sign-in')}
      ${sub(`Hey ${displayName}, your Vuka account was just signed into. If this was you, you're all good.`)}
      ${infoTable(`
        ${row('Device', deviceName)}
        ${row('Location', location)}
        ${row('Time', time)}
      `)}
      <p style="color:#A0A0A0;font-size:14px;">Wasn't you? Secure your account immediately.</p>
      ${btn(securityUrl, 'Review Active Sessions', 'secondary')}
    `)
  );
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

// ═══════════════════════════════════════════════════════════════
// 16. BROADCAST (Admin generic message to users)
// ═══════════════════════════════════════════════════════════════

export async function sendBroadcast({
  to,
  displayName,
  subject,
  title,
  body,
  ctaLabel,
  ctaUrl,
}: {
  to: string;
  displayName: string;
  subject: string;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  const html = layout(
    card(`
      ${icon('📢')}
      ${heading(title)}
      ${sub(`Hey ${displayName},`)}
      <div style="color:#F5F5F5;font-size:15px;line-height:1.8;margin-bottom:24px;">${body.replace(/\n/g, '<br/>')}</div>
      ${ctaLabel && ctaUrl ? btn(ctaUrl, ctaLabel) : ''}
      <p style="color:#6B6B6B;font-size:12px;margin-top:24px;">This is a message from the Vuka team.</p>
    `)
  );
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

// ═══════════════════════════════════════════════════════════════
// LEGACY TEMPLATES — kept verbatim, unchanged
// ═══════════════════════════════════════════════════════════════

export async function sendPurchaseConfirmation({
  to, buyerName, itemName, itemType, licenseType, downloadUrl, amount, currency, licenseId, artworkUrl, licenseUrl,
}: {
  to: string; buyerName: string; itemName: string; itemType: string; licenseType?: string;
  downloadUrl: string; amount: number; currency: string; licenseId: string; artworkUrl?: string; licenseUrl?: string;
}) {
  const isFree = amount === 0;
  const subject = isFree
    ? `Your free download is ready — Vuka`
    : `Purchase confirmed — ${itemName}`;

  const html = layout(card(`
    ${artworkUrl ? `<div style="text-align:center;margin-bottom:32px;"><img src="${artworkUrl}" style="width:100px;height:100px;border-radius:12px;object-fit:cover;display:inline-block;" /></div>` : `${icon('🎵')}`}
    <div style="text-align:center;margin-bottom:32px;">
      ${heading(`Sharp, ${buyerName}! It's yours.`)}
      ${sub(isFree ? 'Your free download is ready. Enjoy the music.' : 'Your payment is confirmed. Your download is ready below.')}
    </div>
    ${infoTable(`
      ${row('Item', `<strong>${itemName}</strong>`)}
      ${licenseType ? row('License', `<span style="text-transform:capitalize;">${licenseType}</span>`) : ''}
      ${row('Amount', isFree ? '<span style="color:#A0E87C;">Free</span>' : `<span style="color:#A0E87C;">${currency} ${amount.toFixed(2)}</span>`, true)}
      ${row('Reference', `<span style="font-family:monospace;font-size:12px;letter-spacing:0.5px;">${licenseId.substring(0, 16).toUpperCase()}</span>`)}
    `)}
    ${btn(downloadUrl, '⬇ Download Now')}
    ${licenseUrl ? `<div style="margin-top:12px;">${btn(licenseUrl, '📄 Download License PDF', 'secondary')}</div>` : ''}
    <p style="color:#6B6B6B;font-size:12px;text-align:center;margin-top:20px;line-height:1.6;">
      Link valid for 30 days · 10 downloads max<br/>
      Need it again? <a href="${APP_URL()}/redownload" style="color:#A0E87C;text-decoration:none;">Re-download portal →</a>
    </p>
  `));

  return getResend().emails.send({ from: FROM(), to, subject, html });
}

export async function sendTicketConfirmation({
  to, buyerName, eventTitle, eventVenue, eventCity, eventStartDate, ticketName, quantity, amount, currency, ticketUrls,
}: {
  to: string; buyerName: string; eventTitle: string; eventVenue: string; eventCity: string;
  eventStartDate: Date; ticketName: string; quantity: number; amount: number; currency: string; ticketUrls: string[];
}) {
  const dateStr = eventStartDate.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = eventStartDate.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  const subject = `Your ticket${quantity > 1 ? 's are' : ' is'} ready — ${eventTitle}`;

  const ticketLinks = ticketUrls.map((url, i) =>
    `<div style="margin-top:12px;">${btn(url, quantity > 1 ? `🎟 View Ticket ${i + 1}` : '🎟 View Your Ticket')}</div>`
  ).join('');

  const html = layout(card(`
    ${icon('🎟')}
    <div style="text-align:center;margin-bottom:32px;">
      ${heading(`Sharp, ${buyerName}! You're going.`)}
      ${sub(`Your ${quantity > 1 ? `${quantity} tickets are` : 'ticket is'} confirmed for ${eventTitle}.`)}
    </div>
    ${infoTable(`
      ${row('Event', `<strong>${eventTitle}</strong>`)}
      ${row('When', `${dateStr} · ${timeStr}`)}
      ${row('Where', `${eventVenue}${eventCity ? `, ${eventCity}` : ''}`)}
      ${row('Ticket type', ticketName)}
      ${row('Quantity', String(quantity))}
      ${row('Paid', amount === 0 ? '<span style="color:#A0E87C;">Free</span>' : `<span style="color:#A0E87C;">${currency} ${amount.toFixed(2)}</span>`, true)}
    `)}
    ${ticketLinks}
    <p style="color:#6B6B6B;font-size:12px;text-align:center;margin-top:20px;line-height:1.6;">
      Each ticket has its own unique QR code — one scan per code, one person per ticket.<br/>
      Screenshot or save it before the event. Doors staff scan it once at the gate; it can't be reused or shared.
    </p>
  `));

  return getResend().emails.send({ from: FROM(), to, subject, html });
}

export async function sendArtistSaleNotification({
  to, artistName, buyerName, itemName, licenseType, amount, currency, dashboardUrl, planSlug,
}: {
  to: string; artistName: string; buyerName: string; itemName: string;
  licenseType?: string; amount: number; currency: string; dashboardUrl: string;
  planSlug?: string;
}) {
  const plan       = getPlan(planSlug);
  const feeAmt     = calcFee(amount, planSlug);
  const netAmount  = amount - feeAmt;
  const feePct     = plan.platformFeePct;
  const subject = `💰 New sale — ${buyerName} bought ${itemName}`;
  const html = `<!DOCTYPE html><html>
<body style="background:#0d0b14;color:#f0eafa;font-family:'DM Sans',sans-serif;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <h1 style="font-size:32px;font-weight:900;background:linear-gradient(135deg,#38b6e8,#f59e0b);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-align:center;">VUKA</h1>
    <div style="background:#16121f;border:1px solid #2d2050;border-radius:16px;padding:32px;margin-top:24px;">
      <div style="font-size:48px;text-align:center;margin-bottom:16px;">💰</div>
      <h2 style="text-align:center;margin:0 0 8px;">Sharp, ${artistName}!</h2>
      <p style="color:#8b7daa;text-align:center;margin:0 0 24px;">${buyerName} just bought your music.</p>
      <div style="background:#1e1828;border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#8b7daa;">Item</span><span>${itemName}</span></div>
        ${licenseType ? `<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#8b7daa;">License</span><span style="text-transform:capitalize;">${licenseType}</span></div>` : ''}
        <div style="border-top:1px solid #2d2050;padding-top:12px;margin-top:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#8b7daa;">Sale Price</span><span>${currency} ${amount.toFixed(2)}</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:12px;"><span style="color:#8b7daa;">Vuka Platform Fee (${feePct}%)</span><span style="color:#ef4444;">−${currency} ${feeAmt.toFixed(2)}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="color:#f0eafa;font-weight:700;">You receive</span><span style="color:#10b981;font-weight:700;font-size:20px;">${currency} ${netAmount.toFixed(2)}</span></div>
        </div>
      </div>
      <a href="${dashboardUrl}" style="display:block;background:linear-gradient(135deg,#38b6e8,#5b21b6);color:white;text-decoration:none;text-align:center;padding:16px;border-radius:12px;font-weight:700;">View Payouts →</a>
    </div>
  </div>
</body></html>`;
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

export async function sendSupportFanConfirmation({
  to, fanName, artistName, amount, currency, tier, message,
}: {
  to: string; fanName: string; artistName: string; amount: number; currency: string; tier: string; message?: string;
}) {
  const subject = `You just made someone's day ♥ — Vuka`;
  const html = `<!DOCTYPE html><html>
<body style="background:#0d0b14;color:#f0eafa;font-family:'DM Sans',sans-serif;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <h1 style="font-size:32px;font-weight:900;background:linear-gradient(135deg,#38b6e8,#f59e0b);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-align:center;">VUKA</h1>
    <div style="background:#16121f;border:1px solid #2d2050;border-radius:16px;padding:32px;margin-top:24px;">
      <div style="font-size:48px;text-align:center;margin-bottom:16px;">♥</div>
      <h2 style="text-align:center;">You made someone's day, ${fanName}</h2>
      <p style="color:#8b7daa;text-align:center;margin:8px 0 24px;">Your support means the world to ${artistName}.</p>
      <div style="background:#1e1828;border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#8b7daa;">Artist</span><span>${artistName}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#8b7daa;">Amount</span><span style="color:#f59e0b;font-weight:700;">${currency} ${amount.toFixed(2)}</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:#8b7daa;">Tier earned</span><span style="color:#38b6e8;font-weight:700;">${tier}</span></div>
      </div>
      ${message ? `<div style="background:#1e1828;border-left:3px solid #38b6e8;padding:16px;border-radius:0 12px 12px 0;"><p style="color:#8b7daa;font-size:13px;margin:0 0 8px;">Your message:</p><p style="font-style:italic;">"${message}"</p></div>` : ''}
    </div>
  </div>
</body></html>`;
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

export async function sendCampaignBackerConfirmation({
  to, backerName, artistName, campaignTitle, amount, currency, tierTitle, message,
}: {
  to: string; backerName: string; artistName: string; campaignTitle: string; amount: number; currency: string; tierTitle?: string; message?: string;
}) {
  const subject = `You just backed ${campaignTitle} ♥ — Vuka`;
  const html = `<!DOCTYPE html><html>
<body style="background:#0d0b14;color:#f0eafa;font-family:'DM Sans',sans-serif;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <h1 style="font-size:32px;font-weight:900;background:linear-gradient(135deg,#38b6e8,#f59e0b);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-align:center;">VUKA</h1>
    <div style="background:#16121f;border:1px solid #2d2050;border-radius:16px;padding:32px;margin-top:24px;">
      <div style="font-size:48px;text-align:center;margin-bottom:16px;">🎯</div>
      <h2 style="text-align:center;">Thanks for backing, ${backerName}</h2>
      <p style="color:#8b7daa;text-align:center;margin:8px 0 24px;">You just helped fund "${campaignTitle}" by ${artistName}.</p>
      <div style="background:#1e1828;border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#8b7daa;">Campaign</span><span>${campaignTitle}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#8b7daa;">Pledge</span><span style="color:#f59e0b;font-weight:700;">${currency} ${amount.toFixed(2)}</span></div>
        ${tierTitle ? `<div style="display:flex;justify-content:space-between;"><span style="color:#8b7daa;">Tier</span><span style="color:#38b6e8;font-weight:700;">${tierTitle}</span></div>` : ''}
      </div>
      ${message ? `<div style="background:#1e1828;border-left:3px solid #38b6e8;padding:16px;border-radius:0 12px 12px 0;"><p style="color:#8b7daa;font-size:13px;margin:0 0 8px;">Your message:</p><p style="font-style:italic;">"${message}"</p></div>` : ''}
    </div>
  </div>
</body></html>`;
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

export async function sendNewMessageNotification({
  to, name, preview, inboxUrl,
}: {
  to: string; name: string; preview: string; inboxUrl: string;
}) {
  const subject = `💬 You have a new message on Vuka`;
  const html = `<!DOCTYPE html><html>
<body style="background:#0d0b14;color:#f0eafa;font-family:'DM Sans',sans-serif;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <h1 style="font-size:32px;font-weight:900;background:linear-gradient(135deg,#38b6e8,#f59e0b);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-align:center;margin:0 0 32px;">VUKA</h1>
    <div style="background:#16121f;border:1px solid #2d2050;border-radius:16px;padding:32px;">
      <div style="font-size:40px;text-align:center;margin-bottom:16px;">💬</div>
      <h2 style="text-align:center;margin:0 0 8px;">Hey ${name}, you got a message</h2>
      <div style="background:#1e1828;border-radius:12px;padding:16px;margin:24px 0;color:#8b7daa;font-style:italic;">
        "${preview.slice(0, 120)}${preview.length > 120 ? '…' : ''}"
      </div>
      <a href="${inboxUrl}" style="display:block;background:linear-gradient(135deg,#38b6e8,#5b21b6);color:white;text-decoration:none;text-align:center;padding:16px;border-radius:12px;font-weight:700;">Open Messages →</a>
      <p style="color:#8b7daa;font-size:12px;text-align:center;margin-top:16px;">Manage notification preferences in <a href="${APP_URL()}/dashboard/settings" style="color:#38b6e8;">Settings</a>.</p>
    </div>
  </div>
</body></html>`;
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

export async function sendMilestoneNotification({
  to, artistName, milestone, value, dashboardUrl,
}: {
  to: string; artistName: string; milestone: string; value: number; dashboardUrl: string;
}) {
  const subject = `🎉 Milestone reached — ${milestone}`;
  const html = `<!DOCTYPE html><html>
<body style="background:#0d0b14;color:#f0eafa;font-family:'DM Sans',sans-serif;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <h1 style="font-size:32px;font-weight:900;background:linear-gradient(135deg,#38b6e8,#f59e0b);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-align:center;">VUKA</h1>
    <div style="background:#16121f;border:1px solid #2d2050;border-radius:16px;padding:32px;margin-top:24px;text-align:center;">
      <div style="font-size:56px;margin-bottom:16px;">🎉</div>
      <h2 style="margin:0 0 8px;">Sharp, ${artistName}!</h2>
      <p style="color:#8b7daa;margin:0 0 24px;">You just hit a milestone:</p>
      <div style="background:linear-gradient(135deg,#38b6e8,#5b21b6);border-radius:12px;padding:24px;margin-bottom:24px;">
        <p style="font-size:20px;font-weight:700;margin:0;">${milestone}</p>
        <p style="font-size:36px;font-weight:900;margin:8px 0 0;">${value.toLocaleString()}</p>
      </div>
      <a href="${dashboardUrl}" style="display:inline-block;background:#1e1828;color:#38b6e8;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:700;">View Dashboard →</a>
    </div>
  </div>
</body></html>`;
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

export async function sendTestEmail(to: string) {
  return getResend().emails.send({
    from: FROM(),
    to,
    subject: 'Vuka — Email system is working ✓',
    html: layout(card(`
      ${icon('✅')}
      <div style="text-align:center;">
        ${heading('Email Test Successful')}
        ${sub('If you can read this, your Resend integration is working correctly.')}
        <p style="color:#6B6B6B;font-size:12px;margin-top:16px;">Sent at ${new Date().toISOString()}</p>
      </div>
    `)),
  });
}

export async function sendRedownloadLinks({
  to, buyerName, purchases,
}: {
  to: string; buyerName: string;
  purchases: { itemName: string; downloadUrl: string; licenseUrl?: string; licenseType?: string }[];
}) {
  const subject = `Your Vuka download links`;

  const purchaseRows = purchases.map((p, i) => `
    <tr>
      <td style="padding:20px 0;${i > 0 ? 'border-top:1px solid rgba(255,255,255,0.06);' : ''}">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:middle;">
              <p style="margin:0;font-size:15px;font-weight:600;color:#F5F5F5;">${p.itemName}</p>
              ${p.licenseType ? `<p style="margin:2px 0 0;font-size:12px;text-transform:capitalize;color:#A0A0A0;">${p.licenseType} License</p>` : ''}
            </td>
            <td style="text-align:right;vertical-align:middle;white-space:nowrap;padding-left:16px;">
              <a href="${p.downloadUrl}" style="display:inline-block;background:linear-gradient(135deg,#A0E87C,#6BB84A);color:#0A0A0A;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:700;font-size:13px;letter-spacing:0.3px;">&#8659; Download</a>
              ${p.licenseUrl ? `<a href="${p.licenseUrl}" style="display:inline-block;background:#1A1A1A;color:#A0E87C;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:700;font-size:13px;letter-spacing:0.3px;margin-left:8px;">📄 License</a>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  const html = layout(card(`
    ${icon('📦')}
    <div style="text-align:center;margin-bottom:32px;">
      ${heading(`Here are your downloads, ${buyerName}`)}
      ${sub('All your confirmed purchases are listed below. Each link is valid for 30 days.')}
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1A1A1A;border-radius:12px;padding:0 24px;">
      ${purchaseRows}
    </table>
    <p style="color:#6B6B6B;font-size:12px;text-align:center;margin-top:24px;line-height:1.6;">
      Links expire after 30 days or 10 downloads.<br/>
      Need help? <a href="${APP_URL()}/support" style="color:#A0E87C;text-decoration:none;">Contact support →</a>
    </p>
  `));

  return getResend().emails.send({ from: FROM(), to, subject, html });
}


export async function sendSupportArtistNotification({
  to, artistName, fanName, amount, currency, message, tier,
}: {
  to: string; artistName: string; fanName: string;
  amount: number; currency: string; message?: string; tier: string;
  goalTitle?: string; goalPercent?: number;
}) {
  const subject = `♥ ${fanName} just supported you on Vuka`;
  const html = `<!DOCTYPE html><html>
<body style="background:#0d0b14;color:#f0eafa;font-family:'DM Sans',sans-serif;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <h1 style="font-size:32px;font-weight:900;background:linear-gradient(135deg,#38b6e8,#f59e0b);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-align:center;">VUKA</h1>
    <div style="background:#16121f;border:1px solid #2d2050;border-radius:16px;padding:32px;margin-top:24px;text-align:center;">
      <div style="font-size:48px;margin-bottom:16px;">♥</div>
      <h2 style="margin:0 0 8px;">Sharp, ${artistName}!</h2>
      <p style="color:#8b7daa;margin:0 0 24px;">${fanName} just sent you support.</p>
      <div style="background:#1e1828;border-radius:12px;padding:20px;text-align:left;margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#8b7daa;">From</span><span>${fanName}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#8b7daa;">Amount</span><span style="color:#f59e0b;font-weight:700;">${currency} ${amount.toFixed(2)}</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:#8b7daa;">Tier</span><span style="color:#38b6e8;">${tier}</span></div>
      </div>
      ${message ? `<div style="background:#1e1828;border-left:3px solid #f59e0b;padding:16px;border-radius:0 12px 12px 0;text-align:left;"><p style="color:#8b7daa;font-size:13px;margin:0 0 8px;">Their message:</p><p style="font-style:italic;margin:0;">"${message}"</p></div>` : ''}
    </div>
  </div>
</body></html>`;
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

// ═══════════════════════════════════════════════════════════════
// Phase 10 — SECURITY EMAILS
// 2FA enable/disable · Password reset · Session alerts
// ═══════════════════════════════════════════════════════════════

export async function sendPasswordResetEmail({
  to,
  displayName,
  resetUrl,
}: {
  to: string;
  displayName: string;
  resetUrl: string;
}) {
  const subject = 'Reset your Vuka password';
  const html = layout(
    card(
      icon('🔐') +
      heading('Password Reset Request') +
      sub(`Hi ${displayName}, we received a request to reset your Vuka password.`) +
      sub('This link expires in <strong>1 hour</strong>. If you did not request this, you can safely ignore it — your password will not change.') +
      btn(resetUrl, 'Reset My Password', 'primary') +
      `<p style="color:#555;font-size:11px;margin-top:16px;text-align:center;word-break:break-all;">${resetUrl}</p>`
    )
  );
  try {
    return getResend().emails.send({ from: FROM(), to, subject, html });
  } catch (e) {
    console.error('[email] sendPasswordResetEmail:', e);
  }
}

export async function sendPasswordChangedEmail({
  to,
  displayName,
  securityUrl,
}: {
  to: string;
  displayName: string;
  securityUrl: string;
}) {
  const subject = 'Your Vuka password was changed';
  const html = layout(
    card(
      icon('🔑') +
      heading('Password Changed') +
      sub(`Hi ${displayName}, your Vuka password was successfully updated.`) +
      sub('All other devices have been signed out. If you did not make this change, reset your password immediately.') +
      btn(securityUrl, 'Review Account Security', 'danger')
    )
  );
  try {
    return getResend().emails.send({ from: FROM(), to, subject, html });
  } catch (e) {
    console.error('[email] sendPasswordChangedEmail:', e);
  }
}

export async function send2FAEnabledEmail({
  to,
  displayName,
  securityUrl,
}: {
  to: string;
  displayName: string;
  securityUrl: string;
}) {
  const subject = 'Two-factor authentication enabled — Vuka';
  const html = layout(
    card(
      icon('✅') +
      heading('2FA Enabled') +
      sub(`Hi ${displayName}, two-factor authentication is now active on your account.`) +
      sub('You will be asked for a 6-digit code from your authenticator app each time you sign in. Store your backup codes somewhere safe.') +
      btn(securityUrl, 'View Security Settings', 'secondary')
    )
  );
  try {
    return getResend().emails.send({ from: FROM(), to, subject, html });
  } catch (e) {
    console.error('[email] send2FAEnabledEmail:', e);
  }
}

export async function send2FADisabledEmail({
  to,
  displayName,
  securityUrl,
}: {
  to: string;
  displayName: string;
  securityUrl: string;
}) {
  const subject = '⚠️ Two-factor authentication disabled — Vuka';
  const html = layout(
    card(
      icon('⚠️') +
      heading('2FA Disabled') +
      sub(`Hi ${displayName}, two-factor authentication has been turned off on your Vuka account.`) +
      sub('If you did not make this change, your account may be compromised. Secure it immediately.') +
      btn(securityUrl, 'Secure My Account', 'danger')
    )
  );
  try {
    return getResend().emails.send({ from: FROM(), to, subject, html });
  } catch (e) {
    console.error('[email] send2FADisabledEmail:', e);
  }
}

export async function sendSessionRevokedEmail({
  to,
  displayName,
  deviceName,
  securityUrl,
}: {
  to: string;
  displayName: string;
  deviceName: string;
  securityUrl: string;
}) {
  const subject = 'A device was signed out of your Vuka account';
  const html = layout(
    card(
      icon('🚪') +
      heading('Device Signed Out') +
      sub(`Hi ${displayName}, the device <strong style="color:#F0F0F0">${deviceName}</strong> was signed out of your Vuka account.`) +
      sub('If you did not do this, review your account security immediately.') +
      btn(securityUrl, 'Review Security', 'secondary')
    )
  );
  try {
    return getResend().emails.send({ from: FROM(), to, subject, html });
  } catch (e) {
    console.error('[email] sendSessionRevokedEmail:', e);
  }
}

export async function sendAllSessionsRevokedEmail({
  to,
  displayName,
  securityUrl,
}: {
  to: string;
  displayName: string;
  securityUrl: string;
}) {
  const subject = 'All devices signed out of your Vuka account';
  const html = layout(
    card(
      icon('🔒') +
      heading('All Devices Signed Out') +
      sub(`Hi ${displayName}, all devices have been signed out of your Vuka account.`) +
      sub('You will need to sign in again on all your devices. If you did not request this, contact support immediately.') +
      btn(`${APP_URL()}/auth/login`, 'Sign In Again', 'primary')
    )
  );
  try {
    return getResend().emails.send({ from: FROM(), to, subject, html });
  } catch (e) {
    console.error('[email] sendAllSessionsRevokedEmail:', e);
  }
}
