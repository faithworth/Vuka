import Link from 'next/link';
import { Music2 } from 'lucide-react';

export const metadata = { title: 'Shipping Policy — Vuka Music', description: 'How physical merch orders are shipped and fulfilled on Vuka Music.' };

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-8">
    <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>{title}</h2>
    <div className="space-y-3 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{children}</div>
  </section>
);

export default function ShippingPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header className="px-6 py-4 flex items-center gap-3" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--sky)' }}><Music2 size={13} className="text-white" /></div>
          <span className="font-bold" style={{ color: 'var(--text)' }}>Vuka Music</span>
        </Link>
        <span style={{ color: 'var(--border)' }}>/</span>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Shipping Policy</span>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Shipping Policy</h1>
        <p className="text-sm mb-10" style={{ color: 'var(--text-muted)' }}>Last updated: September 2026 · Applies to physical merch purchases only.</p>

        <div className="p-5 rounded-2xl mb-8" style={{ background: 'rgba(56,182,232,0.08)', border: '1px solid rgba(56,182,232,0.25)' }}>
          <p className="font-bold mb-1" style={{ color: 'var(--sky)' }}>Vuka Music is not a fulfilment centre</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Every merch item on Vuka is fulfilled directly by the artist who sells it. We process the payment and pass your order details to the artist — they pack it, book the courier, and ship it to you.</p>
        </div>

        <div className="space-y-6 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          <div>
            <h2 className="text-base font-bold mb-2" style={{ color: 'var(--text)' }}>Who ships what</h2>
            <p>Digital items — beats, releases, samples, videos — are delivered instantly and are never shipped; this page doesn't apply to them. Physical merch (t-shirts, hoodies, and similar) is shipped by the artist you bought it from, not by Vuka Music centrally.</p>
          </div>

          <div>
            <h2 className="text-base font-bold mb-2" style={{ color: 'var(--text)' }}>Shipping fee</h2>
            <p>Each artist sets a flat shipping fee per item, shown as a separate line at checkout alongside the item price. This fee is a pass-through to cover the artist's courier cost — Vuka Music does not take a commission on it.</p>
          </div>

          <div>
            <h2 className="text-base font-bold mb-2" style={{ color: 'var(--text)' }}>Delivery address</h2>
            <p>You'll be asked for a delivery address and phone number when you check out for merch. Please double-check these before paying — Vuka Music cannot redirect a parcel once it's booked with a courier, and getting it corrected is between you and the artist.</p>
          </div>

          <div>
            <h2 className="text-base font-bold mb-2" style={{ color: 'var(--text)' }}>Courier &amp; tracking</h2>
            <p>Artists choose their own courier (for example Pudo, PostNet, or Courier Guy) and book the shipment themselves. Once an order ships, the artist marks it as shipped in their dashboard and you'll receive an email with a tracking reference, if one was provided. You can also check the order status any time from your Purchases page.</p>
          </div>

          <div>
            <h2 className="text-base font-bold mb-2" style={{ color: 'var(--text)' }}>Delivery times</h2>
            <p>Delivery windows depend on the artist's location, the courier they choose, and your delivery address — Vuka Music does not set or guarantee a delivery timeframe. If your order hasn't shipped within a reasonable time, contact the artist directly through Vuka Messages, or reach out to <a href="mailto:support@vukamusic.com" className="underline" style={{ color: 'var(--sky)' }}>support@vukamusic.com</a> and we'll follow up.</p>
          </div>

          <div>
            <h2 className="text-base font-bold mb-2" style={{ color: 'var(--text)' }}>Lost, damaged, or incorrect items</h2>
            <p>If your order arrives damaged, is significantly not as described, or never arrives, email <a href="mailto:support@vukamusic.com" className="underline" style={{ color: 'var(--sky)' }}>support@vukamusic.com</a> with your order reference and photos where relevant. See our <Link href="/legal/refunds" className="underline" style={{ color: 'var(--sky)' }}>Refund Policy</Link> for how merch disputes are handled.</p>
          </div>

          <div>
            <h2 className="text-base font-bold mb-2" style={{ color: 'var(--text)' }}>International orders</h2>
            <p>Merch shipping is currently intended for delivery within South Africa. If an artist is willing to ship internationally, that's arranged directly with them and isn't guaranteed or supported by Vuka Music.</p>
          </div>
        </div>

        <div className="mt-10 pt-8" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            <Link href="/legal/terms" className="underline" style={{ color: 'var(--sky)' }}>Terms of Service</Link>
            {' · '}<Link href="/legal/refunds" className="underline" style={{ color: 'var(--sky)' }}>Refund Policy</Link>
            {' · '}<Link href="/legal/acceptable-use" className="underline" style={{ color: 'var(--sky)' }}>Acceptable Use Policy</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
