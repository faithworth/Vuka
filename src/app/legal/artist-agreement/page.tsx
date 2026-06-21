// src/app/legal/artist-agreement/page.tsx
// Plain-English Artist Agreement — the one-pager that makes established
// artists comfortable signing up. Reviewed by artist before creating account.
import Link from 'next/link';

export default function ArtistAgreementPage() {
  return (
    <div className="min-h-screen py-16 px-4" style={{ background:'var(--bg)' }}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-10">
          <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color:'var(--gold)' }}>Vuka Music</p>
          <h1 className="text-4xl font-black mb-3" style={{ color:'var(--text)' }}>Artist Agreement</h1>
          <p className="text-sm" style={{ color:'var(--text-muted)' }}>Plain English. No legal gymnastics. Last updated June 2026.</p>
        </div>

        <div className="space-y-8" style={{ color:'var(--text-muted)', lineHeight:'1.75', fontSize:'0.9375rem' }}>

          <section>
            <h2 className="text-lg font-black mb-2" style={{ color:'var(--text)' }}>You own your music. Always.</h2>
            <p>When you upload music to Vuka, you keep 100% of your rights. We do not claim ownership of your recordings, compositions, or artwork — not now, not ever. You can remove your music at any time, sell it anywhere else simultaneously, and leave the platform without owing us anything for future sales.</p>
          </section>

          <section>
            <h2 className="text-lg font-black mb-2" style={{ color:'var(--text)' }}>What we take — and how it reduces as you grow</h2>
            <p>Vuka charges one platform fee on each confirmed sale. There are no separate fees for crowdfunding, events, or keeping your music discoverable. The fee is:</p>
            <div className="mt-3 rounded-2xl overflow-hidden" style={{ border:'1px solid var(--border)' }}>
              {[
                ['Free plan — R0–R2,000 lifetime sales', '10% platform fee (you keep 90%)'],
                ['Free plan — R2,001–R10,000 lifetime', '9% platform fee (you keep 91%)'],
                ['Free plan — R10,001+ lifetime', '8.5% platform fee (you keep 91.5%)'],
                ['Pro plan — R249/month', '8% platform fee (you keep 92%)'],
                ['Label plan — R999/month', '5% platform fee (you keep 95%)'],
              ].map(([plan, fee], i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3.5" style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <span className="text-sm" style={{ color:'var(--text)' }}>{plan}</span>
                  <span className="text-sm font-bold" style={{ color:'var(--gold)' }}>{fee}</span>
                </div>
              ))}
            </div>
            <p className="mt-3">The Free tier fee reduces automatically as your lifetime sales grow — no subscription required, no form to fill in.</p>
          </section>

          <section>
            <h2 className="text-lg font-black mb-2" style={{ color:'var(--text)' }}>How you get paid</h2>
            <p>Your earnings accumulate in your Vuka wallet after each confirmed sale. You request a withdrawal whenever you want — minimum R50, processed within 1–3 business days via your registered South African bank account. We use Paystack and Flutterwave to process payments; both are PCI-DSS compliant.</p>
          </section>

          <section>
            <h2 className="text-lg font-black mb-2" style={{ color:'var(--text)' }}>What you can sell on Vuka</h2>
            <p>Singles, EPs, albums, instrumentals/beats (with licensing), exclusive content behind a membership paywall, event tickets, and crowdfunding campaigns. All sold directly to fans — no middlemen between you and your money.</p>
          </section>

          <section>
            <h2 className="text-lg font-black mb-2" style={{ color:'var(--text)' }}>Content rules</h2>
            <p>You confirm that you own or have licensed all content you upload, that it does not infringe anyone else's rights, and that it complies with South African law. Vuka uses ACRCloud-style content identification to flag potential copyright matches; if a match is found, we'll notify you before taking any action. Uploading content you don't own may result in removal and account suspension.</p>
          </section>

          <section>
            <h2 className="text-lg font-black mb-2" style={{ color:'var(--text)' }}>If you use Split Sheets</h2>
            <p>If you create a split sheet for a release or beat, you confirm that all listed collaborators have agreed to the revenue share in advance. Vuka distributes according to the percentages you set — we're not responsible for disputes between collaborators.</p>
          </section>

          <section>
            <h2 className="text-lg font-black mb-2" style={{ color:'var(--text)' }}>POPIA compliance</h2>
            <p>Vuka is compliant with the Protection of Personal Information Act (POPIA). We collect only the information needed to run your account and process payments. We do not sell your personal data to third parties. You can request a copy of your data or ask for deletion at any time by emailing accounts@vuka.co.za.</p>
          </section>

          <section>
            <h2 className="text-lg font-black mb-2" style={{ color:'var(--text)' }}>Ending the relationship</h2>
            <p>You can close your account at any time. Any pending earnings will be paid out to your registered bank account within 14 days of closure. Music you've sold remains accessible to buyers who purchased it. We may suspend accounts that violate our content rules, but we'll always tell you why and give you a chance to respond.</p>
          </section>

          <section>
            <h2 className="text-lg font-black mb-2" style={{ color:'var(--text)' }}>Governing law</h2>
            <p>This agreement is governed by the laws of the Republic of South Africa. Any disputes will be resolved in South African courts.</p>
          </section>

          <section>
            <h2 className="text-lg font-black mb-2" style={{ color:'var(--text)' }}>Questions?</h2>
            <p>Email us at <a href="mailto:accounts@vuka.co.za" className="underline" style={{ color:'var(--sky)' }}>accounts@vuka.co.za</a>. We're a small team and we reply personally.</p>
          </section>
        </div>

        <div className="mt-12 flex gap-4">
          <Link href="/auth/register" className="inline-flex items-center px-6 py-3 rounded-xl font-bold text-sm text-white" style={{ background:'linear-gradient(135deg,#d4a000,#b38600)' }}>
            Create Artist Account
          </Link>
          <Link href="/" className="inline-flex items-center px-6 py-3 rounded-xl font-bold text-sm" style={{ background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text)' }}>
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
