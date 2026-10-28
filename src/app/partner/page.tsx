'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, RefreshCw, Users, TrendingUp, Wallet, FileText, CheckCircle, Clock, AlertTriangle, Save } from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';
import { formatCurrency } from '@/lib/utils';

type Creator = {
  userId: string; name: string; role: string; verified: boolean; hasRelease: boolean;
  sales90d: number; uniqueFans90d: number; grossSales90d: number;
  category: 'none' | 'active_sales' | 'paid_or_steady' | 'strong_seller'; points: number;
};
type Statement = {
  id: string; periodStart: string; periodEnd: string; grossPlatformFees: number;
  knownProcessorFees: number; netPlatformFees: number; unknownProcessorFeeRows: number;
  shareRate: number; shareAmount: number; qualifyingCreators: number; status: string; notes: string;
};
type Payout = { id: string; amount: number; method: string; destination: string; status: string; reference: string; createdAt: string; paidAt?: string | null };
type Dashboard = {
  partner: { name: string; email: string; referralCode: string; referralLink: string; paypalEmail: string; currentRate: number; isActive: boolean };
  summary: { referredCreators: number; qualifyingCreators: number; activeSales: number; paidOrSteady: number; strongSellers: number; estimatedRate: number; totalStatementAmount: number; paidAmount: number; pendingAmount: number };
  creators: Creator[]; statements: Statement[]; payouts: Payout[];
};

const money = (n: number) => formatCurrency(Number(n) || 0);
const date = (s: string) => new Date(s).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
const categoryLabel: Record<Creator['category'], string> = {
  none: 'Not qualified yet', active_sales: 'Active sales (+0.5%)',
  paid_or_steady: 'Paid plan / steady sales (+1%)', strong_seller: 'Strong seller (+2%)',
};

export default function PartnerPortal() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paypalEmail, setPaypalEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/partner/dashboard', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load partner dashboard.');
      setData(payload);
      setPaypalEmail(payload.partner.paypalEmail || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load partner dashboard.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function copyLink() {
    if (!data?.partner.referralLink) return;
    await navigator.clipboard.writeText(data.partner.referralLink);
    setCopied(true); window.setTimeout(() => setCopied(false), 1600);
  }

  async function savePaypal() {
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/partner/dashboard', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paypalEmail }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save payout details.');
      setMessage('PayPal destination saved.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to save payout details.');
    } finally { setSaving(false); }
  }

  if (loading) return <div className="p-10 flex items-center gap-3" style={{ color: 'var(--text-muted)' }}><VukaLoader size={20} /> Loading partner portal…</div>;
  if (error || !data) return <div className="max-w-3xl p-8"><h1 className="text-2xl font-black mb-3" style={{ color: 'var(--text)' }}>Partner Portal</h1><p className="mb-4" style={{ color: 'var(--text-muted)' }}>{error || 'Partner data is unavailable.'}</p><button onClick={load} className="px-4 py-2 rounded-lg font-bold" style={{ background: 'var(--surface)', color: 'var(--text)' }}>Try again</button></div>;

  const { partner, summary, creators, statements, payouts } = data;
  const statCards = [
    { label: 'Referred creators', value: summary.referredCreators, sub: 'Artists and producers only', icon: Users },
    { label: 'Qualifying creators', value: summary.qualifyingCreators, sub: 'Verified with a release and qualifying activity', icon: CheckCircle },
    { label: 'Estimated fee share', value: `${(summary.estimatedRate * 100).toFixed(1)}%`, sub: 'Capped at 25%', icon: TrendingUp },
    { label: 'Paid to date', value: money(summary.paidAmount), sub: `${money(summary.pendingAmount)} pending / not paid`, icon: Wallet },
  ];

  return (
    <main className="max-w-6xl p-5 md:p-9 space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--sky)' }}>Vuka Music · Partner</p>
          <h1 className="text-3xl font-black" style={{ color: 'var(--text)' }}>Partner Portal</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>Track creator qualification, platform-fee share, monthly statements, and payout history.</p>
        </div>
        <button onClick={load} className="p-3 rounded-xl" aria-label="Refresh partner data" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}><RefreshCw size={17} /></button>
      </header>

      <section className="rounded-2xl p-5 md:p-6 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="font-bold" style={{ color: 'var(--text)' }}>Your unique referral link</h2><p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Only artist and producer accounts count toward qualifying creators. Fan and Industry accounts do not count.</p></div>
          <span className="text-xs font-bold rounded-full px-3 py-1" style={{ background: 'rgba(56,182,232,.12)', color: 'var(--sky)' }}>{partner.isActive ? 'Active partner' : 'Paused'}</span>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input readOnly value={partner.referralLink} className="min-w-0 flex-1 rounded-xl px-3 py-3 text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <button onClick={copyLink} className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold" style={{ background: 'var(--sky)', color: '#06111b' }}><Copy size={16} />{copied ? 'Copied' : 'Copy link'}</button>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {statCards.map(card => { const Icon = card.icon; return <div key={card.label} className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}><div className="flex items-center justify-between mb-4"><span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{card.label}</span><Icon size={18} style={{ color: 'var(--sky)' }} /></div><p className="text-2xl font-black" style={{ color: 'var(--text)' }}>{card.value}</p><p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{card.sub}</p></div>; })}
      </section>

      <section className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}><h2 className="font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}><Users size={17} /> Creator progress</h2><p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Qualification checks use the rolling 90-day window and the agreement's verification/release requirement.</p></div>
        {creators.length === 0 ? <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>No artist or producer accounts have joined through your link yet.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{ color: 'var(--text-muted)', background: 'var(--surface2)' }}>{['Creator','Status','Sales / 90 days','Unique fans','Gross sales / 90 days','Points'].map(h => <th key={h} className="text-left p-3 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{creators.map(c => <tr key={c.userId} className="border-t" style={{ borderColor: 'var(--border)' }}><td className="p-3"><p className="font-bold" style={{ color: 'var(--text)' }}>{c.name}</p><p className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{c.role}</p></td><td className="p-3"><p style={{ color: c.category === 'none' ? 'var(--text-muted)' : 'var(--green)' }}>{categoryLabel[c.category]}</p>{(!c.verified || !c.hasRelease) && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{!c.verified ? 'Verification pending' : ''}{!c.verified && !c.hasRelease ? ' · ' : ''}{!c.hasRelease ? 'No release uploaded' : ''}</p>}</td><td className="p-3 tabular-nums" style={{ color: 'var(--text)' }}>{c.sales90d}</td><td className="p-3 tabular-nums" style={{ color: 'var(--text)' }}>{c.uniqueFans90d}</td><td className="p-3 tabular-nums" style={{ color: 'var(--text)' }}>{money(c.grossSales90d)}</td><td className="p-3 tabular-nums" style={{ color: 'var(--text)' }}>{c.points.toFixed(1)}</td></tr>)}</tbody></table></div>}
      </section>

      <section className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}><h2 className="font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}><FileText size={17} /> Monthly statements</h2><p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>The rate is based on creator categories qualified by the end of the preceding month.</p></div>
        {statements.length === 0 ? <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Statements will appear after the monthly statement run.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{ color: 'var(--text-muted)', background: 'var(--surface2)' }}>{['Period','Platform fees after known processor fees','Share rate','Your share','Status'].map(h => <th key={h} className="text-left p-3 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{statements.map(s => <tr key={s.id} className="border-t" style={{ borderColor: 'var(--border)' }}><td className="p-3 whitespace-nowrap" style={{ color: 'var(--text)' }}>{date(s.periodStart)} – {date(s.periodEnd)}</td><td className="p-3 tabular-nums" style={{ color: 'var(--text)' }}>{money(s.netPlatformFees)}{s.unknownProcessorFeeRows > 0 && <p className="text-xs mt-1" style={{ color: '#d99b26' }}>{s.unknownProcessorFeeRows} unknown processor fee(s)</p>}</td><td className="p-3" style={{ color: 'var(--text)' }}>{(s.shareRate * 100).toFixed(1)}%</td><td className="p-3 font-bold tabular-nums" style={{ color: 'var(--text)' }}>{money(s.shareAmount)}</td><td className="p-3"><span className="inline-flex items-center gap-1 capitalize" style={{ color: s.status === 'issued' || s.status === 'paid' ? 'var(--green)' : '#d99b26' }}>{s.status === 'draft' ? <AlertTriangle size={13} /> : s.status === 'paid' ? <CheckCircle size={13} /> : <Clock size={13} />}{s.status}</span>{s.notes && <p className="text-xs mt-1 max-w-xs" style={{ color: 'var(--text-muted)' }}>{s.notes}</p>}</td></tr>)}</tbody></table></div>}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl p-5 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h2 className="font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}><Wallet size={17} /> Interim payout destination</h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>PayPal remains the interim option while OZOW is pending. This portal saves your destination; payments are still manually reviewed and recorded by Vuka.</p>
          <label className="block text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>PayPal email</label>
          <input type="email" value={paypalEmail} onChange={e => setPaypalEmail(e.target.value)} placeholder="you@example.com" className="w-full rounded-xl px-3 py-3 text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <button disabled={saving} onClick={savePaypal} className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold disabled:opacity-50" style={{ background: 'var(--sky)', color: '#06111b' }}><Save size={15} />{saving ? 'Saving…' : 'Save payout destination'}</button>
          {message && <p className="text-sm" style={{ color: message.includes('saved') ? 'var(--green)' : '#d99b26' }}>{message}</p>}
        </div>
        <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h2 className="font-bold mb-3" style={{ color: 'var(--text)' }}>Payout history</h2>
          {payouts.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No partner payouts have been recorded yet.</p> : <div className="space-y-3">{payouts.map(p => <div key={p.id} className="flex items-start justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--border)' }}><div><p className="font-bold" style={{ color: 'var(--text)' }}>{money(p.amount)}</p><p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{date(p.createdAt)} · {p.method}</p>{p.reference && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Reference: {p.reference}</p>}</div><span className="text-xs font-bold capitalize" style={{ color: p.status === 'paid' ? 'var(--green)' : 'var(--text-muted)' }}>{p.status}</span></div>)}</div>}
        </div>
      </section>
    </main>
  );
}
