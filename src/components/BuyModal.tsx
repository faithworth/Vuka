'use client';
// src/components/BuyModal.tsx
import { useState } from 'react';
import { formatCurrency } from '@/lib/utils';

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
      // PayFast only (Stripe not active in SA)
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

      if (data.redirect) {
        window.location.href = data.redirect;
        return;
      }

      // Paid: submit PayFast form
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
    } catch (e) {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  const item = beat || release!;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(15,31,46,0.75)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 max-h-[92svh] overflow-y-auto"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 24px 80px rgba(56,182,232,0.15)', paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          {item.artworkUrl ? (
            <img src={item.artworkUrl} className="w-16 h-16 rounded-xl object-cover" alt="" />
          ) : (
            <div className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl"
              style={{ background: 'var(--surface2)' }}>🎵</div>
          )}
          <div className="flex-1">
            <h3 className="font-bold text-lg" style={{ color: 'var(--text)' }}>{item.title}</h3>
            <p style={{ color: 'var(--text-muted)' }}>{item.artist.name}</p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none" style={{ color: 'var(--text-muted)' }}>×</button>
        </div>

        {/* License picker (beats only) */}
        {beat && (
          <div className="mb-6 space-y-2">
            {LICENSES.map((l) => (
              <button
                key={l.key}
                onClick={() => setLicense(l.key)}
                className={`w-full p-4 rounded-xl text-left transition-all`}
                style={{
                  background: license === l.key ? 'rgba(56,182,232,0.08)' : 'var(--bg)',
                  border: `2px solid ${license === l.key ? 'var(--sky)' : 'var(--border)'}`,
                }}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold" style={{ color: 'var(--text)' }}>{l.name}</span>
                  <span className="font-bold" style={{ color: 'var(--sky)' }}>{formatCurrency(prices[l.key])}</span>
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
            <label className="text-sm mb-1 block" style={{ color: 'var(--text-muted)' }}>
              Your price (min R{release.minPrice})
            </label>
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

        {/* Fee note */}
        {price > 0 && (
          <div className="mb-4 px-3 py-2 rounded-lg" style={{ background: 'rgba(201,162,39,0.07)', border: '1px solid rgba(201,162,39,0.25)' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>
              ✦ Vuka takes 8% to keep the platform running. The artist receives 92% of this sale.
            </p>
          </div>
        )}

        {/* Price summary */}
        <div className="mb-5 p-4 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <div className="flex justify-between font-bold text-lg">
            <span style={{ color: 'var(--text)' }}>Total</span>
            <span style={{ color: 'var(--sky)' }}>{price === 0 ? 'Free' : formatCurrency(price)}</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(204,26,26,0.1)', border: '1px solid rgba(204,26,26,0.25)', color: 'var(--red)' }}>
            {error}
          </div>
        )}

        <button
          onClick={handleBuy}
          disabled={loading}
          className="w-full py-4 rounded-xl font-bold text-white text-base transition-all disabled:opacity-60"
          style={{ background: price === 0 ? 'var(--green)' : 'var(--red)' }}
          onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = price === 0 ? '#22834d' : 'var(--red-dark)'; }}
          onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = price === 0 ? 'var(--green)' : 'var(--red)'; }}
        >
          {loading
            ? 'Processing…'
            : price === 0
            ? 'Download Free →'
            : `Buy Now — ${formatCurrency(price)} →`}
        </button>
      </div>
    </div>
  );
}
