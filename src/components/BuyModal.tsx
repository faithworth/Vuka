'use client';
// src/components/BuyModal.tsx
// Three payment options on every direct purchase:
//   Tab 1 — Yoco      (default, SA card/Apple Pay/Google Pay)
//   Tab 2 — Paystack  (SA card, instant EFT, bank transfer — once activated live)
//   Tab 3 — PayPal    (international, USD)
// Merch, beats, releases, videos, samples all go through here.

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils';
import { createClient } from '@/lib/supabase';
import PayPalBuyButton from './paypal/PayPalBuyButton';

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

type PaymentTab = 'yoco' | 'paystack' | 'paypal';

interface Beat {
  id: string; title: string; artworkUrl: string;
  basicPrice: number; premiumPrice: number; exclPrice: number;
  artistSharePct?: number;
  artist: { name: string };
}

interface BuyModalProps {
  beat?: Beat;
  release?: {
    id: string; title: string; artworkUrl: string;
    price: number; minPrice: number; payWhatWant: boolean;
    artistSharePct?: number;
    artist: { name: string };
  };
  itemType?: string;
  shippingFeeAmount?: number;
  onClose: () => void;
}

export function BuyModal({ beat, release, itemType: itemTypeProp, shippingFeeAmount = 0, onClose }: BuyModalProps) {
  const isMerch = itemTypeProp === 'merch';
  const [license, setLicense]           = useState('basic');
  const [email, setEmail]               = useState('');
  const [name, setName]                 = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [loggedInUserId, setLoggedInUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab]       = useState<PaymentTab>('yoco');
  const [shipLine1, setShipLine1]       = useState('');
  const [shipLine2, setShipLine2]       = useState('');
  const [shipCity, setShipCity]         = useState('');
  const [shipPostal, setShipPostal]     = useState('');
  const [shipProvince, setShipProvince] = useState('');
  const [shipPhone, setShipPhone]       = useState('');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(me => {
        if (!me) return;
        setLoggedInUserId(me.id ?? null);
        if (me.name && !name) setName(me.name);
        if (me.email && !email) setEmail(me.email);
      }).catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prices: Record<string, number> = beat
    ? { basic: beat.basicPrice, premium: beat.premiumPrice, exclusive: beat.exclPrice }
    : {};
  const itemPrice = beat
    ? prices[license]
    : (parseFloat(customAmount) || release!.price);
  const price = itemPrice + (isMerch ? shippingFeeAmount : 0);

  const itemType = itemTypeProp ?? (beat ? 'beat' : 'release');
  const itemId   = beat ? beat.id : release!.id;

  async function handleBuy(processor: 'yoco' | 'paystack') {
    if (!email || !name) { setError('Please enter your name and email'); return; }
    if (isMerch && (!shipLine1 || !shipCity || !shipPostal || !shipPhone)) {
      setError('Please fill in your shipping address');
      return;
    }
    setLoading(true);
    setError('');

    const endpoint = processor === 'yoco'
      ? '/api/checkout/yoco/initialize'
      : '/api/checkout/paystack/initialize';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType,
          itemId,
          licenseType:  beat ? license : undefined,
          customAmount: release?.payWhatWant ? parseFloat(customAmount) : undefined,
          buyerEmail:   email,
          buyerName:    name,
          currency:     'ZAR',
          userId:       loggedInUserId ?? undefined,
          shippingAddress: isMerch ? {
            name, line1: shipLine1, line2: shipLine2, city: shipCity,
            postalCode: shipPostal, province: shipProvince, phone: shipPhone,
          } : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Checkout error'); return; }

      if (data.method === 'free') { window.location.href = data.url; return; }

      // Yoco returns redirectUrl, Paystack returns authorizationUrl
      const redirect = data.redirectUrl || data.authorizationUrl;
      if (redirect) { window.location.href = redirect; return; }

      setError('Payment gateway not configured');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const item = beat || release!;

  const tabs: { key: PaymentTab; label: string; flag?: string }[] = [
    { key: 'yoco',     label: 'Yoco',     flag: '🇿🇦' },
    { key: 'paystack', label: 'Paystack', flag: '🇿🇦' },
    { key: 'paypal',   label: 'PayPal',   flag: '🌍' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 max-h-[92svh] overflow-y-auto"
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border-strong)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          {item.artworkUrl ? (
            <img src={item.artworkUrl} className="w-16 h-16 rounded-lg object-cover" alt="" />
          ) : (
            <div className="w-16 h-16 rounded-lg flex items-center justify-center text-2xl" style={{ background: 'var(--color-bg-tertiary)' }}>🎵</div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-lg truncate" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>{item.title}</h3>
            <p className="text-sm truncate" style={{ color: 'var(--color-text-secondary)' }}>{item.artist.name}</p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none flex-shrink-0 hover:opacity-70 transition-opacity" style={{ color: 'var(--color-text-secondary)' }}>×</button>
        </div>

        {/* License picker (beats only) */}
        {beat && (
          <div className="mb-6 space-y-2">
            {LICENSES.map((l) => (
              <button
                key={l.key}
                onClick={() => setLicense(l.key)}
                className="w-full p-4 rounded-lg text-left transition-all"
                style={{
                  background: license === l.key ? 'rgba(160,232,124,0.08)' : 'var(--color-bg-tertiary)',
                  border: `2px solid ${license === l.key ? 'var(--color-accent-green)' : 'var(--color-border)'}`,
                }}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>{l.name}</span>
                  <span className="font-bold font-mono" style={{ color: 'var(--color-accent-green)' }}>{formatCurrency(prices[l.key])}</span>
                </div>
                <ul className="mt-1">
                  {l.rights.map((r) => (
                    <li key={r} className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>· {r}</li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
        )}

        {/* Pay what you want (releases) */}
        {release?.payWhatWant && (
          <div className="mb-4">
            <label className="text-sm mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>Your price (min R{release.minPrice})</label>
            <input type="number" value={customAmount} onChange={e => setCustomAmount(e.target.value)} placeholder={String(release.price)} className="input" />
          </div>
        )}

        {/* Price summary */}
        <div className="mb-5 p-4 rounded-lg" style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-strong)' }}>
          {isMerch && shippingFeeAmount > 0 && (
            <>
              <div className="flex justify-between text-sm mb-2">
                <span style={{ color: 'var(--color-text-secondary)' }}>Item price</span>
                <span className="font-mono" style={{ color: 'var(--color-text-secondary)' }}>{formatCurrency(itemPrice)}</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span style={{ color: 'var(--color-text-secondary)' }}>Shipping</span>
                <span className="font-mono" style={{ color: 'var(--color-text-secondary)' }}>{formatCurrency(shippingFeeAmount)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between font-bold text-lg">
            <span style={{ color: 'var(--color-text-primary)' }}>Total</span>
            <span className="font-mono" style={{ color: 'var(--color-accent-green)' }}>{price === 0 ? 'Free' : formatCurrency(price)}</span>
          </div>
        </div>

        {/* Platform fee note */}
        {price > 0 && (() => {
          const share = beat?.artistSharePct ?? release?.artistSharePct ?? 85;
          const fee   = 100 - share;
          return (
            <div className="mb-4 px-3 py-2 rounded-lg" style={{ background: 'rgba(232,200,124,0.07)', border: '1px solid rgba(232,200,124,0.2)' }}>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>
                ✦ Vuka Music takes {fee}% to keep the platform running. The artist receives {share}% of this sale.
              </p>
            </div>
          );
        })()}

        {/* Free download — no tabs needed */}
        {price === 0 ? (
          <button
            onClick={() => handleBuy('yoco')}
            disabled={loading}
            className="w-full py-4 rounded-lg font-bold text-base transition-all disabled:opacity-60"
            style={{ background: 'var(--color-accent-green)', color: '#000', fontFamily: 'var(--font-display)' }}
          >
            {loading ? 'Processing…' : 'Download Free →'}
          </button>
        ) : (
          <>
            {/* Buyer info (shared across Yoco + Paystack tabs) */}
            {activeTab !== 'paypal' && (
              <div className="space-y-3 mb-4">
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className="input" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={isMerch ? 'Email address (for order updates)' : 'Email address (for download link)'} className="input" />
              </div>
            )}

            {/* Shipping address (merch only, non-PayPal) */}
            {isMerch && activeTab !== 'paypal' && (
              <div className="mb-4 space-y-2">
                <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>Shipping address</p>
                <input value={shipLine1} onChange={e => setShipLine1(e.target.value)} placeholder="Street address" className="input" />
                <input value={shipLine2} onChange={e => setShipLine2(e.target.value)} placeholder="Apartment, suite, etc. (optional)" className="input" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={shipCity} onChange={e => setShipCity(e.target.value)} placeholder="City" className="input" />
                  <input value={shipPostal} onChange={e => setShipPostal(e.target.value)} placeholder="Postal code" className="input" />
                </div>
                <input value={shipProvince} onChange={e => setShipProvince(e.target.value)} placeholder="Province" className="input" />
                <input value={shipPhone} onChange={e => setShipPhone(e.target.value)} placeholder="Phone number" className="input" />
              </div>
            )}

            {/* Payment tabs */}
            <div className="mb-4">
              <p className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>Choose payment method</p>
              <div className="flex gap-2">
                {tabs.map(t => (
                  <button
                    key={t.key}
                    onClick={() => { setActiveTab(t.key); setError(''); }}
                    className="flex-1 py-2 rounded-lg text-sm font-bold transition-all"
                    style={{
                      background: activeTab === t.key ? 'rgba(160,232,124,0.12)' : 'var(--color-bg-tertiary)',
                      border: `2px solid ${activeTab === t.key ? 'var(--color-accent-green)' : 'var(--color-border)'}`,
                      color: activeTab === t.key ? 'var(--color-accent-green)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {t.flag} {t.label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(255,77,77,0.1)', border: '1px solid rgba(255,77,77,0.25)', color: 'var(--color-danger)' }}>
                {error}
              </div>
            )}

            {/* Tab content */}
            {activeTab === 'yoco' && (
              <button
                onClick={() => handleBuy('yoco')}
                disabled={loading}
                className="w-full py-4 rounded-lg font-bold text-base transition-all disabled:opacity-60"
                style={{ background: 'var(--color-accent-green)', color: '#000', fontFamily: 'var(--font-display)' }}
              >
                {loading ? 'Processing…' : `Pay with Yoco — ${formatCurrency(price)} →`}
              </button>
            )}

            {activeTab === 'paystack' && (
              <button
                onClick={() => handleBuy('paystack')}
                disabled={loading}
                className="w-full py-4 rounded-lg font-bold text-base transition-all disabled:opacity-60"
                style={{ background: '#011B33', color: '#fff', fontFamily: 'var(--font-display)', border: '2px solid #00C3F7' }}
              >
                {loading ? 'Processing…' : `Pay with Paystack — ${formatCurrency(price)} →`}
              </button>
            )}

            {activeTab === 'paypal' && (
              <PayPalBuyButton
                itemType={itemType as any}
                itemId={itemId}
                itemTitle={item.title}
                priceZAR={price}
                licenseType={beat ? license as any : 'basic'}
              />
            )}

            <p className="text-center text-xs mt-3" style={{ color: 'var(--color-text-secondary)' }}>
              {activeTab === 'yoco' && '🔒 Card, Apple Pay & more · Powered by Yoco'}
              {activeTab === 'paystack' && '🔒 Card, EFT & bank transfer · Powered by Paystack'}
              {activeTab === 'paypal' && '🌍 International payments in USD · Powered by PayPal'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
