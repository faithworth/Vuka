'use client';
// src/app/dashboard/payouts/page.tsx
import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import {
  CreditCard, ExternalLink, CheckCircle, Clock, AlertCircle,
  TrendingUp, Wallet, ArrowUpRight, Loader2, RefreshCw
} from 'lucide-react';

export default function PayoutsPage() {
  const [data, setData] = useState<any>(null);
  const [artist, setArtist] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [tab, setTab] = useState<'overview' | 'history'>('overview');

  async function load() {
    setLoading(true);
    const [payoutsRes, settingsRes] = await Promise.all([
      fetch('/api/dashboard/payouts'),
      fetch('/api/dashboard/settings'),
    ]);
    const payoutsData = await payoutsRes.json();
    const settingsData = await settingsRes.json();
    setData(payoutsData);
    setArtist(settingsData.artist);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleConnectStripe() {
    setConnecting(true);
    const res = await fetch('/api/connect/onboard');
    if (res.ok) {
      const { url } = await res.json();
      window.location.href = url;
    } else {
      setConnecting(false);
      alert('Eish — something went wrong connecting Stripe. Try again.');
    }
  }

  if (loading) return (
    <div className="p-10 flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
      <Loader2 size={18} className="animate-spin" /> Loading your earnings…
    </div>
  );

  const { payouts = [], summary = {}, stripeBalance, stripePayouts = [], connected = {} } = data || {};
  const currency = artist?.currency || 'ZAR';

  const availableStripe = stripeBalance?.available?.find((b: any) => b.currency === currency.toLowerCase())?.amount || 0;
  const pendingStripe = stripeBalance?.pending?.find((b: any) => b.currency === currency.toLowerCase())?.amount || 0;

  function statusBadge(status: string) {
    const map: Record<string, { label: string; color: string; bg: string }> = {
      pending:    { label: 'Pending',    color: 'var(--gold)',        bg: 'rgba(234,179,8,0.1)' },
      processing: { label: 'Processing', color: 'var(--purple-light)', bg: 'rgba(124,58,237,0.1)' },
      completed:  { label: 'Paid',       color: 'var(--green)',       bg: 'rgba(16,185,129,0.1)' },
      failed:     { label: 'Failed',     color: '#f87171',            bg: 'rgba(248,113,113,0.1)' },
    };
    const s = map[status] || map.pending;
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
        style={{ color: s.color, background: s.bg }}>
        {s.label}
      </span>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-3xl">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>Payouts</h1>
        <button onClick={load} className="p-2 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <RefreshCw size={15} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>
      <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
        You keep 99% of every sale. Connect your payment accounts to receive funds directly.
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: 'Total Earned', value: summary.totalEarned || 0, icon: TrendingUp, color: 'var(--green)' },
          { label: 'Paid Out',     value: summary.totalPaid    || 0, icon: CheckCircle, color: 'var(--purple-light)' },
          { label: 'Pending',      value: summary.totalPending || 0, icon: Clock, color: 'var(--gold)' },
        ].map(card => (
          <div key={card.label} className="p-4 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <card.icon size={16} style={{ color: card.color }} className="mb-2" />
            <div className="text-xl font-black" style={{ color: card.color }}>
              {formatCurrency(card.value)}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['overview', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-2 rounded-lg text-sm font-semibold capitalize"
            style={{
              background: tab === t ? 'var(--purple)' : 'var(--surface)',
              color: tab === t ? 'white' : 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}>
            {t}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (
        <div className="space-y-4">

          {/* Stripe Connect */}
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ background: 'var(--surface)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(99,91,255,0.15)' }}>
                  <CreditCard size={18} style={{ color: '#635bff' }} />
                </div>
                <div>
                  <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>Stripe Connect</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>International cards · USD, EUR, GBP, ZAR · Auto payouts</p>
                </div>
              </div>
              {connected.stripe
                ? <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ color: 'var(--green)', background: 'rgba(16,185,129,0.1)' }}>✓ Connected</span>
                : <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ color: 'var(--text-muted)', background: 'var(--surface2)' }}>Not connected</span>}
            </div>

            <div className="px-6 py-5" style={{ background: 'var(--surface2)', borderTop: '1px solid var(--border)' }}>
              {connected.stripe ? (
                <>
                  {/* Stripe balance */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-3 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Available to pay out</p>
                      <p className="text-lg font-black" style={{ color: 'var(--green)' }}>
                        {formatCurrency(availableStripe / 100)}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Pending (in transit)</p>
                      <p className="text-lg font-black" style={{ color: 'var(--gold)' }}>
                        {formatCurrency(pendingStripe / 100)}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                    Stripe automatically pays out your available balance to your linked bank account on a rolling basis (typically 2–7 days after each sale). No action needed.
                  </p>

                  {/* Recent Stripe payouts */}
                  {stripePayouts.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Recent Stripe payouts</p>
                      {stripePayouts.slice(0, 5).map((sp: any) => (
                        <div key={sp.id} className="flex items-center justify-between p-3 rounded-lg"
                          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                          <div>
                            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                              {formatCurrency(sp.amount / 100)}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {new Date(sp.arrival_date * 1000).toLocaleDateString('en-ZA')}
                            </p>
                          </div>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full capitalize"
                            style={{
                              color: sp.status === 'paid' ? 'var(--green)' : 'var(--gold)',
                              background: sp.status === 'paid' ? 'rgba(16,185,129,0.1)' : 'rgba(234,179,8,0.1)',
                            }}>
                            {sp.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <a href="https://dashboard.stripe.com/payouts" target="_blank" rel="noopener noreferrer"
                    className="mt-3 flex items-center gap-1.5 text-xs font-semibold"
                    style={{ color: 'var(--purple-light)' }}>
                    View Stripe Dashboard <ExternalLink size={11} />
                  </a>
                </>
              ) : (
                <>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                    Connect Stripe to receive payouts automatically. Works with South African bank accounts.
                    Each sale pays you directly — no manual transfers needed.
                  </p>
                  <button onClick={handleConnectStripe} disabled={connecting}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg,#635bff,#4338ca)' }}>
                    {connecting
                      ? <><Loader2 size={14} className="animate-spin" />Redirecting…</>
                      : <><CreditCard size={14} />Connect Stripe — Get Paid Automatically</>}
                  </button>
                  <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                    You'll be taken to Stripe to verify your identity and link your bank account. Takes ~5 minutes.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* PayFast */}
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ background: 'var(--surface)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,160,90,0.15)' }}>
                  <Wallet size={18} style={{ color: '#00a05a' }} />
                </div>
                <div>
                  <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>PayFast</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>South African payments · ZAR · PayShap, EFT, credit cards</p>
                </div>
              </div>
              {connected.payfast
                ? <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ color: 'var(--green)', background: 'rgba(16,185,129,0.1)' }}>✓ Connected</span>
                : <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ color: 'var(--text-muted)', background: 'var(--surface2)' }}>Not connected</span>}
            </div>

            <div className="px-6 py-5" style={{ background: 'var(--surface2)', borderTop: '1px solid var(--border)' }}>
              {connected.payfast ? (
                <>
                  <div className="flex items-center gap-2 mb-3 p-3 rounded-xl"
                    style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                    <CheckCircle size={14} style={{ color: 'var(--green)' }} />
                    <p className="text-sm font-semibold" style={{ color: 'var(--green)' }}>
                      Merchant ID: {artist?.payfastMerchant}
                    </p>
                  </div>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
                    PayFast pays out your balance directly to your South African bank account. Payouts happen automatically
                    based on your PayFast payout schedule (typically next business day).
                  </p>
                  <a href="https://www.payfast.co.za/dashboard" target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-semibold"
                    style={{ color: '#00a05a' }}>
                    View PayFast Dashboard <ExternalLink size={11} />
                  </a>
                </>
              ) : (
                <>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                    Add your PayFast Merchant ID so SA buyers can pay you via PayShap, EFT, or credit card.
                    PayFast pays your balance directly to your SA bank account.
                  </p>
                  <a href="/dashboard/settings" className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white w-fit"
                    style={{ background: 'linear-gradient(135deg,#00a05a,#007a44)' }}>
                    <ArrowUpRight size={14} /> Add PayFast Merchant ID in Settings
                  </a>
                  <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                    Get your Merchant ID from your{' '}
                    <a href="https://www.payfast.co.za/dashboard/settings" target="_blank" rel="noopener noreferrer"
                      className="underline" style={{ color: 'var(--purple-light)' }}>
                      PayFast account settings
                    </a>.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* How it works */}
          <div className="p-5 rounded-2xl" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <p className="text-sm font-bold mb-3" style={{ color: 'var(--green)' }}>💚 How payouts work</p>
            <div className="space-y-2">
              {[
                'Buyer pays → Vuka takes 1% platform fee',
                'Stripe sales: 99% goes directly to your Stripe account → auto-transferred to your bank',
                'PayFast sales: 99% goes to your PayFast account → auto-transferred to your SA bank',
                'You see every transaction in the History tab below',
              ].map((item, i) => (
                <p key={i} className="text-xs flex gap-2" style={{ color: 'var(--text-muted)' }}>
                  <span style={{ color: 'var(--green)' }}>✓</span> {item}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <div>
          {payouts.length === 0 ? (
            <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
              <Wallet size={40} className="mx-auto mb-4 opacity-30" />
              <p className="font-semibold">No sales yet</p>
              <p className="text-sm mt-1">Your earnings will appear here after your first sale.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {payouts.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between p-4 rounded-xl"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                        {formatCurrency(p.netAmount)}
                      </p>
                      {statusBadge(p.status)}
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium uppercase"
                        style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                        {p.method}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Sale: {formatCurrency(p.amount)} · Fee: {formatCurrency(p.fee)} · {new Date(p.createdAt).toLocaleDateString('en-ZA')}
                    </p>
                    {p.notes && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{p.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
