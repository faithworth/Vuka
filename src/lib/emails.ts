/**
 * VUKA — Emails (Phase 4 Final)
 * Fixes:
 *   - sendArtistSaleNotification: was showing "R0.00 (0%)" fee — now shows real 2%
 *   - Added sendNewMessageNotification (Phase 3 requirement)
 *   - Added sendMilestoneNotification for follower/sales milestones
 *   - All functions wrapped in try/catch at call sites — never throw blind
 */

import { Resend } from 'resend';

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  return new Resend(key);
}

const FROM = () => process.env.EMAIL_FROM || 'Vuka <onboarding@resend.dev>';
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://vuka.app';

const PLATFORM_FEE_RATE = 0.02; // 2% — must match transaction.ts and webhook routes

// ── Buyer purchase confirmation ──────────────────────────────

export async function sendPurchaseConfirmation({
  to, buyerName, itemName, itemType, licenseType, downloadUrl, amount, currency, licenseId, artworkUrl,
}: {
  to: string; buyerName: string; itemName: string; itemType: string; licenseType?: string;
  downloadUrl: string; amount: number; currency: string; licenseId: string; artworkUrl?: string;
}) {
  const subject = `Sharp! Your ${itemType} is ready — Vuka`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#0d0b14;color:#f0eafa;font-family:'DM Sans',sans-serif;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="font-size:32px;font-weight:900;background:linear-gradient(135deg,#38b6e8,#f59e0b);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin:0;">VUKA</h1>
    </div>
    <div style="background:#16121f;border:1px solid #2d2050;border-radius:16px;padding:32px;">
      ${artworkUrl ? `<img src="${artworkUrl}" style="width:120px;height:120px;border-radius:12px;object-fit:cover;display:block;margin:0 auto 24px;" />` : ''}
      <h2 style="font-size:24px;font-weight:700;margin:0 0 8px;text-align:center;">Sharp! It's yours 🎵</h2>
      <p style="color:#8b7daa;text-align:center;margin:0 0 24px;">Hey ${buyerName}, your purchase is confirmed.</p>
      <div style="background:#1e1828;border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#8b7daa;">Item</span><span style="font-weight:600;">${itemName}</span></div>
        ${licenseType ? `<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#8b7daa;">License</span><span style="font-weight:600;text-transform:capitalize;">${licenseType}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#8b7daa;">Amount</span><span style="font-weight:600;color:#10b981;">${currency} ${amount.toFixed(2)}</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:#8b7daa;">Reference</span><span style="font-weight:600;font-family:monospace;font-size:12px;">${licenseId.substring(0, 16).toUpperCase()}</span></div>
      </div>
      <a href="${downloadUrl}" style="display:block;background:linear-gradient(135deg,#38b6e8,#5b21b6);color:white;text-decoration:none;text-align:center;padding:16px 32px;border-radius:12px;font-weight:700;font-size:16px;margin-bottom:16px;">⬇️ Download Now</a>
      <p style="color:#8b7daa;font-size:13px;text-align:center;">Download link valid for 30 days · 10 downloads max</p>
      <p style="color:#8b7daa;font-size:13px;text-align:center;margin-top:8px;">Need to re-download? Visit <a href="${APP_URL()}/redownload" style="color:#38b6e8;">vuka.app/redownload</a></p>
    </div>
    <p style="color:#8b7daa;font-size:12px;text-align:center;margin-top:24px;">Vuka — Africa's independent music platform.</p>
  </div>
</body></html>`;
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

// ── Artist sale notification (FIXED: shows real 2% fee) ──────

export async function sendArtistSaleNotification({
  to, artistName, buyerName, itemName, licenseType, amount, currency, dashboardUrl,
}: {
  to: string; artistName: string; buyerName: string; itemName: string;
  licenseType?: string; amount: number; currency: string; dashboardUrl: string;
}) {
  const platformFee = Math.round(amount * PLATFORM_FEE_RATE * 100) / 100;
  const netAmount   = amount - platformFee;

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
          <div style="display:flex;justify-content:space-between;margin-bottom:12px;"><span style="color:#8b7daa;">Vuka Platform Fee (2%)</span><span style="color:#ef4444;">−${currency} ${platformFee.toFixed(2)}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="color:#f0eafa;font-weight:700;">You receive</span><span style="color:#10b981;font-weight:700;font-size:20px;">${currency} ${netAmount.toFixed(2)}</span></div>
        </div>
      </div>
      <p style="color:#8b7daa;font-size:12px;text-align:center;margin:0 0 16px;">Funds transferred to your bank within 24–48 hours after processing.</p>
      <a href="${dashboardUrl}" style="display:block;background:linear-gradient(135deg,#38b6e8,#5b21b6);color:white;text-decoration:none;text-align:center;padding:16px;border-radius:12px;font-weight:700;">View Payouts →</a>
    </div>
  </div>
</body></html>`;
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

// ── Fan support confirmation ──────────────────────────────────

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

// ── New message notification (Phase 3 — wired) ───────────────

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
      <a href="${inboxUrl}" style="display:block;background:linear-gradient(135deg,#38b6e8,#5b21b6);color:white;text-decoration:none;text-align:center;padding:16px;border-radius:12px;font-weight:700;">
        Open Messages →
      </a>
      <p style="color:#8b7daa;font-size:12px;text-align:center;margin-top:16px;">
        Manage notification preferences in <a href="${APP_URL()}/dashboard/settings" style="color:#38b6e8;">Settings</a>.
      </p>
    </div>
  </div>
</body></html>`;
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

// ── Milestone notification ────────────────────────────────────

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

// ── Admin: test email ─────────────────────────────────────────

export async function sendTestEmail(to: string) {
  return getResend().emails.send({
    from: FROM(),
    to,
    subject: 'Vuka — Email system is working ✓',
    html: `<div style="background:#0d0b14;color:#f0eafa;padding:40px;font-family:sans-serif;border-radius:16px;">
      <h1 style="color:#38b6e8;">Vuka Email Test</h1>
      <p>If you can read this, your Resend integration is working correctly.</p>
      <p style="color:#8b7daa;font-size:12px;">Sent at ${new Date().toISOString()}</p>
    </div>`,
  });
}
