'use client';
import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import { CreditCard, ExternalLink, CheckCircle } from 'lucide-react';

export default function PayoutsPage() {
  const [artist, setArtist] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    fetch('/api/dashboard/settings').then(r => r.json()).then(d => {
      setArtist(d.artist);
      setLoading(false);
    });
  }, []);

  async function handleConnectStripe() {
    setConnecting(true);
    const res = await fetch('/api/connect/onboard');
    if (res.ok) {
      const { url } = await res.json();
      window.location.href = url;
    } else {
      setConnecting(false);
      alert('Eish — something went wrong. Try again.');
    }
  }

  if (loading) return <div className="p-6" style={{ color: 'var(--text-muted)' }}>Just now…</div>;

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-black mb-2" style={{ color: 'var(--text)' }}>Payouts</h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>Connect Stripe to receive payments directly to your bank.</p>

      {/* Stripe Connect status */}
      <div className="p-5 rounded-xl border mb-6" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3 mb-4">
          <CreditCard className="w-6 h-6" style={{ color: 'var(--purple-light)' }} />
          <h2 className="font-bold" style={{ color: 'var(--text)' }}>Stripe Connect</h2>
        </div>

        {artist?.stripeAccountId ? (
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-5 h-5" style={{ color: 'var(--green)' }} />
            <span className="font-semibold" style={{ color: 'var(--green)' }}>Connected</span>
            <span className="text-sm ml-1" style={{ color: 'var(--text-muted)' }}>({artist.stripeAccountId})</span>
          </div>
        ) : (
          <>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              Connect your Stripe account to receive payouts. You'll need a valid bank account.
              Stripe Express supports South Africa (ZAR), and many other countries.
            </p>
            <button onClick={handleConnectStripe} disabled={connecting}
              className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-white transition-all"
              style={{ background: connecting ? 'var(--border)' : 'linear-gradient(135deg,#7c3aed,#5b21b6)' }}>
              <ExternalLink className="w-4 h-4" />
              {connecting ? 'Redirecting…' : 'Connect Stripe'}
            </button>
          </>
        )}
      </div>

      {/* PayFast info */}
      <div className="p-5 rounded-xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <h2 className="font-bold mb-3" style={{ color: 'var(--text)' }}>PayFast (South Africa)</h2>
        <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
          PayFast handles ZAR payments. Your PayFast merchant ID is linked in Settings.
          Payouts via PayFast go directly to your SA bank account.
        </p>
        {artist?.payfastMerchant ? (
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4" style={{ color: 'var(--green)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--green)' }}>
              Merchant ID: {artist.payfastMerchant}
            </span>
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Add your PayFast Merchant ID in <a href="/dashboard/settings" style={{ color: 'var(--purple-light)' }}>Settings</a>.
          </p>
        )}
      </div>

      {/* Info box */}
      <div className="mt-6 p-4 rounded-xl border-l-4" style={{ background: 'rgba(16,185,129,0.1)', borderColor: 'var(--green)' }}>
        <p className="text-sm mb-2" style={{ color: 'var(--text)' }}>
          <strong style={{ color: 'var(--green)' }}>✓ How it works:</strong>
        </p>
        <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
          • Buyer pays → 1% goes to Vuka → 99% goes to you
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          • Then payment processors take their cut (~2.9% + small fee) before it hits your bank
        </p>
        <p className="text-xs mt-2 font-semibold" style={{ color: 'var(--green)' }}>
          💚 The fairest deal in music.
        </p>
      </div>
    </div>
  );
}
