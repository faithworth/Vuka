import Link from 'next/link';
import { Music2 } from 'lucide-react';

export const metadata = { title: 'Terms of Service — Vuka Music', description: 'Vuka Music platform terms of service.' };

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-8">
    <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>{title}</h2>
    <div className="space-y-3 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{children}</div>
  </section>
);

export default function TermsPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header className="px-6 py-4 flex items-center gap-3" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--sky)' }}><Music2 size={13} className="text-white" /></div>
          <span className="font-bold" style={{ color: 'var(--text)' }}>Vuka Music</span>
        </Link>
        <span style={{ color: 'var(--border)' }}>/</span>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Terms of Service</span>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Terms of Service</h1>
        <p className="text-sm mb-10" style={{ color: 'var(--text-muted)' }}>Last updated: September 2026 · Governing law: Republic of South Africa</p>

        <Section title="1. About Vuka Music">
          <p>Vuka Music ("we", "us", "the platform") is a digital-content and creator-services platform operated by Vuka Music Platform (Pty) Ltd (Registration pending, CIPC), Republic of South Africa.</p>
          <p><strong style={{ color: 'var(--text)' }}>Vuka Music is the seller of record for everything sold through vukamusic.com</strong> — digital content (beats, releases, videos, samples), physical merchandise, event tickets, memberships, and marketplace services booked through the platform. When you buy something on Vuka Music, you are entering into a sale agreement with Vuka Music Platform (Pty) Ltd, not directly with the artist or professional whose work or service you're buying. Artists and industry professionals are creators and royalty recipients under these Terms, not the contracting seller.</p>
          <p>By creating an account or making a purchase, you confirm you are at least 18 years old and agree to these Terms in full.</p>
        </Section>

        <Section title="2. User Accounts">
          <p>You are responsible for keeping your credentials secure. You may not share, sell, or transfer your account. We reserve the right to suspend or terminate any account found to be in violation of these Terms.</p>
          <p>Artists must provide accurate information about themselves and the content they upload. Impersonation of another artist or person is prohibited.</p>
          <p>Vuka Music may ask an artist to verify their identity (legal name and a government ID document). This is separate from the sale relationship described in Section 1 — it exists to confirm you're a real, identifiable person, to unlock the verified badge on your profile, and to support anti-fraud and copyright-dispute review. It is not a condition of being paid; see Section 5.</p>
        </Section>

        <Section title="3. Content & Intellectual Property">
          <p>Artists retain full copyright ownership of all music, beats, media, and creative work uploaded to or delivered through Vuka Music. By uploading content or offering a service, you grant Vuka Music the right to display, stream, and promote it, and to sell, license, and deliver it to buyers as the seller of record described in Section 1 — Vuka Music sells on your behalf and under your ownership, it does not acquire your copyright.</p>
          <p>You warrant that you own or have the right to sell all content and services you offer through the platform. Content that infringes third-party copyright, contains unlicensed samples, or violates any applicable law is prohibited and will be removed.</p>
          <p>Buyers receive a licence from Vuka Music to use purchased content, on the terms of the licence tier selected at checkout. Licences are non-transferable and do not grant ownership of the underlying copyright, which the artist keeps.</p>
        </Section>

        <Section title="4. Exclusive Licences">
          <p>When a buyer purchases an Exclusive Licence, Vuka Music permanently removes that beat or content from sale. The artist may not re-list, re-sell, or grant any further licences for that specific work to any other party. This is a binding commitment enforced at the platform level.</p>
          <p>Exclusive licence purchases are final. No refunds are issued once the exclusive lock has been applied.</p>
        </Section>

        <Section title="5. Payments, Artist Royalties & Payouts">
          <p>All prices are displayed in South African Rand (ZAR). Buyers pay Vuka Music directly via Paystack for domestic transactions. International payment options may be added in future.</p>
          <p>Artists and industry professionals earn a royalty on each sale of their content, service order, or listing — the applicable royalty rate depends on your plan (see below) and is disclosed before you list anything for sale. This royalty is a payment from Vuka Music to you as the creator, distinct from the sale Vuka Music makes to the buyer.</p>
          <p>Free accounts earn a royalty starting at 90% of the sale price (10% platform share), rising automatically as lifetime sales grow — to 91% at R2,000 lifetime gross, and to 91.5% permanently above R10,000. Pro plan (R170 every 2 months) earns a flat 92%. Label plan (R549 every 2 months) earns a flat 95%. No platform share is deducted from crowdfunding or event sales.</p>
          <p>Royalties accumulate in your Vuka Music balance and are paid out automatically every Monday to your verified bank account, once your balance clears the R50 minimum — the way a label pays its roster, not an on-demand withdrawal. You can view your accumulated balance and payout history in your dashboard at any time; there is no manual "request a payout" step.</p>
          <p>Vuka Music does not store payment card information. All payment data is handled by Paystack in accordance with PCI DSS standards.</p>
        </Section>

        <Section title="6. No Refund Policy">
          <p>All sales of digital goods on Vuka Music are final. As the seller of record, Vuka Music does not offer refunds once a purchase is confirmed and download access has been granted. This policy is consistent with the Electronic Communications and Transactions Act 25 of 2002 (ECT Act), which permits sellers to exclude the right of return for digital goods delivered immediately upon purchase.</p>
          <p>If you believe you were charged incorrectly or did not receive access to your purchase, contact us at support@vukamusic.com within 7 days and we will investigate. See our <Link href="/legal/refunds" className="underline" style={{ color: 'var(--sky)' }}>Refund Policy</Link> for merch and marketplace-service orders, which are handled differently.</p>
        </Section>

        <Section title="7. Marketplace Services">
          <p>Mixing, mastering, features, and similar professional services listed under Vuka Music's marketplace are sold by Vuka Music as fixed-fee catalog products, on the same seller-of-record basis as everything else in these Terms — you are booking the service through Vuka Music, and the artist or professional performs and delivers the work as the creator earning a royalty on that booking, per Section 5.</p>
        </Section>

        <Section title="8. Prohibited Conduct">
          <p>You may not: (a) upload content you do not own; (b) use automated tools to scrape, download, or rip content; (c) attempt to circumvent download protection or DRM measures; (d) resell or redistribute purchased digital files; (e) upload malware, spam, or illegal content; (f) harass, threaten, or abuse other users.</p>
        </Section>

        <Section title="9. DMCA & Takedowns">
          <p>Vuka Music respects intellectual property rights. If you believe your work has been uploaded without authorisation, submit a DMCA notice at <Link href="/legal/dmca" className="underline" style={{ color: 'var(--sky)' }}>/legal/dmca</Link>. We will investigate and act within 72 hours of receiving a valid notice.</p>
        </Section>

        <Section title="10. Limitation of Liability">
          <p>To the maximum extent permitted by South African law, Vuka Music's liability for any claim arising from use of the platform is limited to the amount you paid in the 30 days preceding the claim. We are not liable for loss of profits, data loss, or consequential damages.</p>
        </Section>

        <Section title="11. Governing Law">
          <p>These Terms are governed by the laws of the Republic of South Africa. Any disputes shall be submitted to the jurisdiction of the South African courts.</p>
        </Section>

        <Section title="12. Changes to Terms">
          <p>We may update these Terms at any time. Continued use of the platform after changes are posted constitutes acceptance. We will notify registered users of material changes by email.</p>
        </Section>

        <div className="mt-10 pt-8" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Questions? Email <a href="mailto:support@vukamusic.com" className="underline" style={{ color: 'var(--sky)' }}>support@vukamusic.com</a>
            {' · '}<Link href="/legal/privacy" className="underline" style={{ color: 'var(--sky)' }}>Privacy Policy</Link>
            {' · '}<Link href="/legal/refunds" className="underline" style={{ color: 'var(--sky)' }}>Refund Policy</Link>
            {' · '}<Link href="/legal/dmca" className="underline" style={{ color: 'var(--sky)' }}>DMCA</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
