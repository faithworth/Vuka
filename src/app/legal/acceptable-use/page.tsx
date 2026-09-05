import Link from 'next/link';
import { Music2 } from 'lucide-react';

export const metadata = { title: 'Acceptable Use Policy — Vuka Music', description: 'Rules for artists, fans, and industry users on the Vuka Music platform.' };

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-8">
    <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>{title}</h2>
    <div className="space-y-3 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{children}</div>
  </section>
);

export default function AcceptableUsePage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header className="px-6 py-4 flex items-center gap-3" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--sky)' }}><Music2 size={13} className="text-white" /></div>
          <span className="font-bold" style={{ color: 'var(--text)' }}>Vuka Music</span>
        </Link>
        <span style={{ color: 'var(--border)' }}>/</span>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Acceptable Use Policy</span>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Acceptable Use Policy</h1>
        <p className="text-sm mb-10" style={{ color: 'var(--text-muted)' }}>Last updated: September 2026 · Applies to all users of vukamusic.com — artists, fans, labels, and industry professionals.</p>

        <Section title="1. Who this applies to">
          <p>This policy applies to every account on Vuka Music: independent artists and labels whose music, merch, and services are sold through the platform by Vuka Music, fans and buyers, and industry professionals (managers, engineers, producers) whose services are booked through Vuka Music's marketplace. It sits alongside our <Link href="/legal/terms" className="underline" style={{ color: 'var(--sky)' }}>Terms of Service</Link> — this page focuses specifically on conduct and content rules.</p>
        </Section>

        <Section title="2. Account conduct">
          <p>You are responsible for keeping your login credentials secure and may not share, sell, or transfer your account to another person. Impersonating another artist, label, or individual is prohibited. We reserve the right to suspend or terminate any account found in violation of this policy, with notice and an opportunity to respond except in cases of fraud, abuse, or legal risk to the platform.</p>
        </Section>

        <Section title="3. Content rules">
          <p>Artists must own or hold a valid licence for everything they upload — music, beats, stems, artwork, and merchandise designs. Content that infringes third-party copyright, contains unlicensed samples, or violates South African law will be removed; repeated infringement results in account suspension. See our <Link href="/legal/dmca" className="underline" style={{ color: 'var(--sky)' }}>DMCA process</Link> for takedown requests.</p>
          <p>Prohibited content includes: malware or malicious files disguised as media; spam or bulk unsolicited messaging; illegal content under South African law; content that harasses, threatens, or targets an individual; and hate speech or content promoting violence.</p>
        </Section>

        <Section title="4. Prohibited conduct">
          <p>You may not: use automated tools to scrape, download, or rip content from the platform; attempt to circumvent download protection, licensing gates, or exclusive-content paywalls; resell or redistribute purchased digital files outside the licence terms you bought; manipulate reviews, streams, or sales figures; or attempt to defraud other users, including fake marketplace orders or chargeback abuse on digital goods you actually received (see our <Link href="/legal/refunds" className="underline" style={{ color: 'var(--sky)' }}>Refund Policy</Link>).</p>
        </Section>

        <Section title="5. Marketplace-specific conduct">
          <p>Marketplace services (mixing, mastering, vocal features, and similar) are sold by Vuka Music as fixed-fee catalog products, the same as everything else on the platform — the professional performs and delivers the work as the creator earning a royalty on the booking, not as the contracting seller. Professionals must deliver what was described in the listing, within the stated delivery window, or communicate delays proactively. Buyers must provide accurate requirements at the time of ordering. Disputes are raised through the order itself and reviewed case by case — see the order status flow in your dashboard.</p>
        </Section>

        <Section title="6. Enforcement">
          <p>Violations may result in content removal, order cancellation, temporary suspension, or permanent account termination depending on severity. We will tell you what rule was broken and give you a chance to respond, except where immediate action is needed to prevent fraud, legal exposure, or harm to other users.</p>
        </Section>

        <div className="mt-10 pt-8" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Questions? Email <a href="mailto:support@vukamusic.com" className="underline" style={{ color: 'var(--sky)' }}>support@vukamusic.com</a>
            {' · '}<Link href="/legal/terms" className="underline" style={{ color: 'var(--sky)' }}>Terms of Service</Link>
            {' · '}<Link href="/legal/refunds" className="underline" style={{ color: 'var(--sky)' }}>Refund Policy</Link>
            {' · '}<Link href="/legal/shipping" className="underline" style={{ color: 'var(--sky)' }}>Shipping Policy</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
