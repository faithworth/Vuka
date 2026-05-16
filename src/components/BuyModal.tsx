'use client';
import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { formatCurrency } from '@/lib/utils';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

const LICENSES = [
  {
    key: 'basic',
    name: 'Basic License',
    rights: ['Non-exclusive', 'Up to 5,000 streams', '2 music videos', 'Non-profit performances'],
  },
  {
    key: 'premium',
    name: 'Premium License',
    rights: ['Non-exclusive', 'Up to 500K streams', 'Unlimited videos', 'Commercial performances', 'Radio rights'],
  },
  {
    key: 'exclusive',
    name: 'Exclusive License',
    rights: ['EXCLUSIVE — no one else can buy', 'Unlimited streams', 'Full commercial use', 'Sync/TV/Film', '50% songwriter credit'],
    highlight: true,
  },
];

interface Beat {
  id: string; title: string; artworkUrl: string;
  basicPrice: number; premiumPrice: number; exclPrice: number;
  artist: { name: string };
}

interface BuyModalProps {
  beat?: Beat;
  release?: { id: string; title: string; artworkUrl: string; price: number; minPrice: number; payWhatWant: boolean; artist: { name: string } };
  onClose: () => void;
}

export function BuyModal({ beat, release, onClose }: BuyModalProps) {
  const [license, setLicense] = useState('basic');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'stripe' | 'payfast'>('stripe');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const prices: Record<string, number> = beat
    ? { basic: beat.basicPrice, premium: beat.premiumPrice, exclusive: beat.exclPrice }
    : {};
  const price = beat ? prices[license] : (parseFloat(customAmount) || release!.price);

  async function handleBuy() {
    if (!email || !name) { setError('Please enter your name and email'); return; }
    setLoading(true);
    setError('');
    try {
      if (payMethod === 'stripe') {
        const res = await fetch('/api/checkout/stripe/create-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemType: beat ? 'beat' : 'release',
            itemId: beat ? beat.id : release!.id,
            licenseType: beat ? license : undefined,
            customAmount: release?.payWhatWant ? parseFloat(customAmount) : undefined,
            buyerEmail: email,
            buyerName: name,
            currency: 'ZAR',
          }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Error'); return; }
        window.location.href = data.url;
      } else {
        // PayFast
        const res = await fetch('/api/checkout/payfast/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemType: beat ? 'beat' : 'release',
            itemId: beat ? beat.id : release!.id,
            licenseType: beat ? license : undefined,
            customAmount: release?.payWhatWant ? parseFloat(customAmount) : undefined,
            buyerEmail: email,
            buyerName: name,
          }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Error'); return; }
        // Build and submit form
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = data.actionUrl;
        Object.entries(data.formData).forEach(([k, v]) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = k;
          input.value = String(v);
          form.appendChild(input);
        });
        document.body.appendChild(form);
        form.submit();
      }
    } catch (e) {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  const item = beat || release!;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }} onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          {item.artworkUrl ? (
            <img src={item.artworkUrl} className="w-16 h-16 rounded-xl object-cover" alt="" />
          ) : (
            <div className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl" style={{ background: 'var(--surface2)' }}>🎵</div>
          )}
          <div className="flex-1">
            <h3 className="font-bold text-lg" style={{ color: 'var(--text)' }}>{item.title}</h3>
            <p style={{ color: 'var(--text-muted)' }}>{item.artist.name}</p>
          </div>
          <button onClick={onClose} className="text-2xl" style={{ color: 'var(--text-muted)' }}>×</button>
        </div>

        {/* License picker (beats only) */}
        {beat && (
          <div className="mb-6 space-y-2">
            {LICENSES.map((l) => (
              <button
                key={l.key}
                onClick={() => setLicense(l.key)}
                className={`w-full p-4 rounded-xl text-left transition-colors ${license === l.key ? 'border-2' : 'border'}`}
                style={{
                  background: license === l.key ? 'var(--surface2)' : 'transparent',
                  borderColor: license === l.key ? 'var(--purple)' : 'var(--border)',
                }}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold" style={{ color: 'var(--text)' }}>{l.name}</span>
                  <span className="font-bold" style={{ color: 'var(--purple-light)' }}>{formatCurrency(prices[l.key])}</span>
                </div>
                <ul className="mt-1">
                  {l.rights.map((r) => <li key={r} className="text-xs" style={{ color: 'var(--text-muted)' }}>· {r}</li>)}
                </ul>
              </button>
            ))}
          </div>
        )}

        {/* Pay what you want */}
        {release?.payWhatWant && (
          <div className="mb-4">
            <label className="text-sm mb-1 block" style={{ color: 'var(--text-muted)' }}>Your price (min R{release.minPrice})</label>
            <input
              type="number"
              value={customAmount}
              onChange={e => setCustomAmount(e.target.value)}
              placeholder={String(release.price)}
              className="w-full px-4 py-3 rounded-xl"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>
        )}

        {/* Buyer info */}
        <div className="space-y-3 mb-6">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-3 rounded-xl"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email address (for download link)"
            className="w-full px-4 py-3 rounded-xl"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>

        {/* Payment method */}
        <div className="flex gap-2 mb-6">
          {(['stripe', 'payfast'] as const).map(m => (
            <button
              key={m}
              onClick={() => setPayMethod(m)}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: payMethod === m ? 'var(--purple)' : 'var(--surface2)',
                border: '1px solid var(--border)',
                color: payMethod === m ? 'white' : 'var(--text-muted)',
              }}
            >
              {m === 'stripe' ? '💳 Card / Apple Pay' : '🇿🇦 PayFast'}
            </button>
          ))}
        </div>

        {/* Fee breakdown */}
        <div className="mb-6 p-3 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <div className="flex justify-between text-sm mb-2">
            <span style={{ color: 'var(--text-muted)' }}>Price</span>
            <span style={{ color: 'var(--text)' }}>{formatCurrency(price)}</span>
          </div>
          <div className="flex justify-between text-sm mb-3" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Vuka Fee (1%)</span>
            <span style={{ color: 'var(--text)' }}>-{formatCurrency(price * 0.01)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span style={{ color: 'var(--text)' }}>Total</span>
            <span style={{ color: 'var(--green)' }}>{formatCurrency(price)}</span>
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
            💚 Artist receives {formatCurrency(price * 0.99)} after our 1% fee
          </p>
        </div>

        {error && <p className="text-sm mb-4 text-red-400">Eish — {error}</p>}

        <button
          onClick={handleBuy}
          disabled={loading}
          className="w-full py-4 rounded-xl font-bold text-white text-lg transition-opacity disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg,var(--purple),#5b21b6)' }}
        >
          {loading ? 'Just now…' : `Buy Now — Yebo ✓ · ${formatCurrency(price)}`}
        </button>
      </div>
    </div>
  );
}
