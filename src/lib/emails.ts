import { Resend } from "resend";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}
const FROM = () => process.env.EMAIL_FROM || "noreply@vuka.app";

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
      <h1 style="font-size:32px;font-weight:900;background:linear-gradient(135deg,#a78bfa,#7c3aed,#f59e0b);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin:0;">VUKA</h1>
    </div>
    <div style="background:#16121f;border:1px solid #2d2050;border-radius:16px;padding:32px;">
      ${artworkUrl ? `<img src="${artworkUrl}" style="width:120px;height:120px;border-radius:12px;object-fit:cover;display:block;margin:0 auto 24px;" />` : ""}
      <h2 style="font-size:24px;font-weight:700;margin:0 0 8px;text-align:center;">Sharp! It's yours 🎵</h2>
      <p style="color:#8b7daa;text-align:center;margin:0 0 24px;">Hey ${buyerName}, your purchase is confirmed.</p>
      <div style="background:#1e1828;border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#8b7daa;">Item</span><span style="font-weight:600;">${itemName}</span></div>
        ${licenseType ? `<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#8b7daa;">License</span><span style="font-weight:600;text-transform:capitalize;">${licenseType}</span></div>` : ""}
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#8b7daa;">Amount</span><span style="font-weight:600;color:#10b981;">${currency} ${amount.toFixed(2)}</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:#8b7daa;">Reference</span><span style="font-weight:600;font-family:monospace;font-size:12px;">${licenseId.substring(0, 16).toUpperCase()}</span></div>
      </div>
      <a href="${downloadUrl}" style="display:block;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:white;text-decoration:none;text-align:center;padding:16px 32px;border-radius:12px;font-weight:700;font-size:16px;margin-bottom:16px;">⬇️ Download Now</a>
      <p style="color:#8b7daa;font-size:13px;text-align:center;">Download link valid for 30 days · 5 downloads max</p>
      <p style="color:#8b7daa;font-size:13px;text-align:center;margin-top:8px;">Need to re-download later? Visit <a href="${process.env.NEXT_PUBLIC_APP_URL}/redownload" style="color:#a78bfa;">vuka.app/redownload</a></p>
    </div>
    <p style="color:#8b7daa;font-size:12px;text-align:center;margin-top:24px;">Vuka — Rise. No middleman. No cuts. Just music.</p>
  </div>
</body></html>`;
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

export async function sendArtistSaleNotification({
  to, artistName, buyerName, itemName, licenseType, amount, currency, dashboardUrl,
}: {
  to: string; artistName: string; buyerName: string; itemName: string; licenseType?: string;
  amount: number; currency: string; dashboardUrl: string;
}) {
  const feeAmount = amount * 0.01;
  const netAmount = amount - feeAmount;
  const subject = `💰 You just made a sale — ${buyerName} bought ${itemName}`;
  const html = `<!DOCTYPE html><html>
<body style="background:#0d0b14;color:#f0eafa;font-family:'DM Sans',sans-serif;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <h1 style="font-size:32px;font-weight:900;background:linear-gradient(135deg,#a78bfa,#7c3aed,#f59e0b);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-align:center;">VUKA</h1>
    <div style="background:#16121f;border:1px solid #2d2050;border-radius:16px;padding:32px;margin-top:24px;">
      <div style="font-size:48px;text-align:center;margin-bottom:16px;">💰</div>
      <h2 style="text-align:center;margin:0 0 8px;">Sharp, ${artistName}!</h2>
      <p style="color:#8b7daa;text-align:center;margin:0 0 24px;">${buyerName} just bought your music.</p>
      <div style="background:#1e1828;border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#8b7daa;">Item</span><span>${itemName}</span></div>
        ${licenseType ? `<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#8b7daa;">License</span><span style="text-transform:capitalize;">${licenseType}</span></div>` : ""}
        <div style="border-top:1px solid #2d2050;padding-top:12px;margin-top:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#8b7daa;">Sale Price</span><span>${currency} ${amount.toFixed(2)}</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:12px;"><span style="color:#8b7daa;">Vuka Fee (1%)</span><span style="color:#ef4444;">-${currency} ${feeAmount.toFixed(2)}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="color:#f0eafa;font-weight:700;">You receive</span><span style="color:#10b981;font-weight:700;font-size:20px;">${currency} ${netAmount.toFixed(2)}</span></div>
        </div>
      </div>
      <p style="color:#8b7daa;font-size:12px;text-align:center;margin:0 0 16px;">Funds will be transferred to your bank account within 24-48 hours</p>
      <a href="${dashboardUrl}" style="display:block;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:white;text-decoration:none;text-align:center;padding:16px;border-radius:12px;font-weight:700;">View Your Payouts →</a>
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
    <h1 style="font-size:32px;font-weight:900;background:linear-gradient(135deg,#a78bfa,#7c3aed,#f59e0b);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-align:center;">VUKA</h1>
    <div style="background:#16121f;border:1px solid #2d2050;border-radius:16px;padding:32px;margin-top:24px;">
      <div style="font-size:48px;text-align:center;margin-bottom:16px;">♥</div>
      <h2 style="text-align:center;">You made someone's day, ${fanName}</h2>
      <p style="color:#8b7daa;text-align:center;margin:8px 0 24px;">Your support means the world to ${artistName}.</p>
      <div style="background:#1e1828;border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#8b7daa;">Artist</span><span>${artistName}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#8b7daa;">Amount</span><span style="color:#f59e0b;font-weight:700;">${currency} ${amount.toFixed(2)}</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:#8b7daa;">Tier earned</span><span style="color:#a78bfa;font-weight:700;">${tier}</span></div>
      </div>
      ${message ? `<div style="background:#1e1828;border-left:3px solid #7c3aed;padding:16px;border-radius:0 12px 12px 0;"><p style="color:#8b7daa;font-size:13px;margin:0 0 8px;">Your message:</p><p style="font-style:italic;">"${message}"</p></div>` : ""}
    </div>
  </div>
</body></html>`;
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

export async function sendSupportArtistNotification({
  to, artistName, fanName, amount, currency, tier, message, goalTitle, goalPercent,
}: {
  to: string; artistName: string; fanName: string; amount: number; currency: string;
  tier: string; message?: string; goalTitle?: string; goalPercent?: number;
}) {
  const subject = `♥ ${fanName} just supported you — ${currency}${amount}`;
  const html = `<!DOCTYPE html><html>
<body style="background:#0d0b14;color:#f0eafa;font-family:'DM Sans',sans-serif;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <h1 style="font-size:32px;font-weight:900;background:linear-gradient(135deg,#a78bfa,#7c3aed,#f59e0b);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-align:center;">VUKA</h1>
    <div style="background:#16121f;border:1px solid #2d2050;border-radius:16px;padding:32px;margin-top:24px;">
      <h2 style="text-align:center;">Your riders are showing up, ${artistName} ♥</h2>
      <div style="background:#1e1828;border-radius:12px;padding:20px;margin:24px 0;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#8b7daa;">Fan</span><span>${fanName}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#8b7daa;">Amount</span><span style="color:#f59e0b;font-weight:700;">${currency} ${amount.toFixed(2)}</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:#8b7daa;">Tier</span><span style="color:#a78bfa;">${tier}</span></div>
      </div>
      ${message ? `<div style="background:#1e1828;border-left:3px solid #7c3aed;padding:16px;border-radius:0 12px 12px 0;margin-bottom:24px;"><p style="font-style:italic;">"${message}"</p></div>` : ""}
      ${goalTitle ? `<div style="background:#1e1828;border-radius:12px;padding:16px;"><p style="color:#8b7daa;font-size:13px;margin:0 0 8px;">Goal: ${goalTitle}</p><div style="background:#2d2050;border-radius:100px;height:8px;"><div style="background:linear-gradient(90deg,#7c3aed,#a78bfa);border-radius:100px;height:8px;width:${goalPercent || 0}%;"></div></div><p style="color:#a78bfa;font-size:13px;margin:8px 0 0;">${goalPercent?.toFixed(0)}% funded</p></div>` : ""}
    </div>
  </div>
</body></html>`;
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

export async function sendWelcomeArtist({ to, name, slug }: { to: string; name: string; slug: string }) {
  const profileUrl = `${process.env.NEXT_PUBLIC_APP_URL}/artist/${slug}`;
  const subject = `Vuka — your store is live. Rise.`;
  const html = `<!DOCTYPE html><html>
<body style="background:#0d0b14;color:#f0eafa;font-family:'DM Sans',sans-serif;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <h1 style="font-size:48px;font-weight:900;background:linear-gradient(135deg,#a78bfa,#7c3aed,#f59e0b);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-align:center;margin:0 0 8px;">VUKA</h1>
    <p style="color:#8b7daa;text-align:center;font-size:16px;margin:0 0 32px;font-style:italic;">Rise.</p>
    <div style="background:#16121f;border:1px solid #2d2050;border-radius:16px;padding:32px;">
      <h2 style="margin:0 0 8px;">You're live, ${name} 🚀</h2>
      <p style="color:#8b7daa;margin:0 0 24px;">Your Vuka store is ready for the world. Share your link and start earning.</p>
      <div style="background:#1e1828;border:1px solid #2d2050;border-radius:12px;padding:16px;margin-bottom:24px;text-align:center;">
        <p style="color:#8b7daa;font-size:13px;margin:0 0 8px;">Your store link</p>
        <a href="${profileUrl}" style="color:#a78bfa;font-weight:700;font-size:18px;text-decoration:none;">${profileUrl}</a>
      </div>
      <div style="margin-bottom:24px;">
        <h3 style="font-size:16px;margin:0 0 12px;">Get started:</h3>
        <div style="display:flex;gap:8px;margin-bottom:8px;"><span style="color:#7c3aed;font-weight:700;">1.</span><span>Upload your first beat or release</span></div>
        <div style="display:flex;gap:8px;margin-bottom:8px;"><span style="color:#7c3aed;font-weight:700;">2.</span><span>Connect Stripe for payouts</span></div>
        <div style="display:flex;gap:8px;"><span style="color:#7c3aed;font-weight:700;">3.</span><span>Share your link on Instagram, WhatsApp, everywhere</span></div>
      </div>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="display:block;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:white;text-decoration:none;text-align:center;padding:16px;border-radius:12px;font-weight:700;">Go to Your Hustle →</a>
    </div>
    <p style="color:#8b7daa;font-size:12px;text-align:center;margin-top:24px;">No label. No 30% cut. No waiting. Just your music, your money.</p>
  </div>
</body></html>`;
  return getResend().emails.send({ from: FROM(), to, subject, html });
}

export async function sendRedownloadLinks({
  to, purchases,
}: {
  to: string;
  purchases: Array<{ itemName: string; downloadUrl: string; date: string; licenseId: string }>;
}) {
  const subject = `Your Vuka downloads — ${to}`;
  const purchaseRows = purchases.map((p) => `
    <div style="background:#1e1828;border-radius:12px;padding:16px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div><p style="margin:0;font-weight:600;">${p.itemName}</p><p style="margin:4px 0 0;color:#8b7daa;font-size:12px;">${p.date}</p></div>
        <a href="${p.downloadUrl}" style="background:linear-gradient(135deg,#7c3aed,#5b21b6);color:white;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;">Download</a>
      </div>
    </div>`).join("");
  const html = `<!DOCTYPE html><html>
<body style="background:#0d0b14;color:#f0eafa;font-family:'DM Sans',sans-serif;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <h1 style="font-size:32px;font-weight:900;background:linear-gradient(135deg,#a78bfa,#7c3aed,#f59e0b);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-align:center;">VUKA</h1>
    <div style="background:#16121f;border:1px solid #2d2050;border-radius:16px;padding:32px;margin-top:24px;">
      <h2>Your downloads</h2>
      <p style="color:#8b7daa;margin:8px 0 24px;">Here are fresh download links for all your purchases.</p>
      ${purchaseRows}
      <p style="color:#8b7daa;font-size:13px;margin-top:16px;">Links expire in 30 days from issue. If you need help, reply to this email.</p>
    </div>
  </div>
</body></html>`;
  return getResend().emails.send({ from: FROM(), to, subject, html });
}
