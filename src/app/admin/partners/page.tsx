'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, UserPlus, FileText, Wallet, Users, CheckCircle, AlertTriangle, ExternalLink } from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';
import { formatCurrency } from '@/lib/utils';

type Partner = {
  id: string; referralCode: string; currentRate: number; baseRate: number; paypalEmail: string | null;
  isActive: boolean; createdAt: string; referredCreators: number;
  user: { id: string; name: string; email: string; role: string };
  statements: Array<{ id: string; periodStart: string; periodEnd: string; grossPlatformFees: number; knownProcessorFees: number; netPlatformFees: number; unknownProcessorFeeRows: number; unknownPlatformFeeRows: number; shareRate: number; shareAmount: number; status: string; notes: string }>;
  payouts: Array<{ id: string; amount: number; status: string; destination: string; reference: string; createdAt: string; statementId: string | null }>;
};

const money = (n: number) => formatCurrency(Number(n) || 0);
const date = (s: string) => new Date(s).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });

export default function AdminPartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [period, setPeriod] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [reference, setReference] = useState('');
  const [payoutId, setPayoutId] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [selectedPartnerDetails, setSelectedPartnerDetails] = useState<any>(null);
  const [loadingPartnerDetails, setLoadingPartnerDetails] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/admin/partners', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load partners.');
      setPartners(data.partners || []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load partners.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function action(body: Record<string, unknown>, success: string) {
    setWorking(true); setMessage(''); setError('');
    try {
      const res = await fetch('/api/admin/partners', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed.');
      setMessage(success);
      await load();
      return data;
    } catch (e) { setError(e instanceof Error ? e.message : 'Action failed.'); return null; }
    finally { setWorking(false); }
  }

  async function addPartner(e: React.FormEvent) {
    e.preventDefault();
    const result = await action({ action: 'create', email }, 'Partner access created. Their existing Vuka login works at /partner/.');
    if (result?.ok) setEmail('');
  }

  async function issueStatements() {
    await action({ action: 'issue_statements', period }, 'Monthly statement run completed. Drafts with unknown fee values remain blocked from payout.');
  }

  async function enableMyPartnerPortal() {
    await action({ action: 'create_self' }, 'Your partner profile is ready. Open /partner/ using this same login.');
  }

  async function openPartnerProgress(partnerId: string) {
    setSelectedPartnerId(partnerId);
    setLoadingPartnerDetails(true);
    setSelectedPartnerDetails(null);
    try {
      const response = await fetch(`/api/admin/partners?partnerId=${encodeURIComponent(partnerId)}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load partner details.');
      setSelectedPartnerDetails(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load partner details.');
    } finally { setLoadingPartnerDetails(false); }
  }

  async function markPaid(e: React.FormEvent) {
    e.preventDefault();
    if (!payoutId || !reference.trim()) { setError('Select a payout and enter the payment reference.'); return; }
    const result = await action({ action: 'mark_payout_paid', payoutId, reference }, 'Payout marked paid and linked statement updated.');
    if (result?.ok) { setPayoutId(''); setReference(''); }
  }

  if (loading) return <div className="p-10 flex items-center gap-3" style={{ color: 'var(--text-muted)' }}><VukaLoader size={20} /> Loading partner management…</div>;

  const allStatements = partners.flatMap(p => p.statements.map(s => ({ ...s, partnerName: p.user.name, partnerEmail: p.user.email })));
  const allPayouts = partners.flatMap(p => p.payouts.filter(pay => pay.status !== 'paid').map(pay => ({ ...pay, partnerName: p.user.name, partnerEmail: p.user.email, paypalEmail: p.paypalEmail })));

  return (
    <main className="max-w-7xl p-5 md:p-9 space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--sky)' }}>Vuka Music · Admin</p><h1 className="text-3xl font-black" style={{ color: 'var(--text)' }}>Partner Program</h1><p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>Manage partner access, qualifying creators, monthly fee-share statements, and manual payout reconciliation.</p></div>
        <div className="flex flex-wrap gap-2">
          <a href="/partner/" className="px-4 py-3 rounded-xl text-sm font-bold" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>Open my partner portal</a>
          <button onClick={enableMyPartnerPortal} disabled={working} className="px-4 py-3 rounded-xl text-sm font-bold disabled:opacity-50" style={{ background: 'var(--sky)', color: '#06111b' }}>Enable my partner portal</button>
          <button onClick={load} className="p-3 rounded-xl" aria-label="Refresh partners" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}><RefreshCw size={17} /></button>
        </div>
      </header>

      {error && <p className="rounded-xl p-3 text-sm" style={{ background: 'rgba(220,70,70,.1)', color: '#e66' }}>{error}</p>}
      {message && <p className="rounded-xl p-3 text-sm" style={{ background: 'rgba(70,180,110,.1)', color: 'var(--green)' }}>{message}</p>}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[{ label: 'Active partners', value: partners.filter(p => p.isActive).length, icon: Users }, { label: 'Creators attributed', value: partners.reduce((n, p) => n + p.referredCreators, 0), icon: UserPlus }, { label: 'Unpaid / pending payouts', value: money(allPayouts.reduce((n, p) => n + p.amount, 0)), icon: Wallet }].map(c => { const Icon = c.icon; return <div key={c.label} className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}><div className="flex justify-between items-center"><p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{c.label}</p><Icon size={17} style={{ color: 'var(--sky)' }} /></div><p className="text-2xl font-black mt-3" style={{ color: 'var(--text)' }}>{c.value}</p></div>; })}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <form onSubmit={addPartner} className="rounded-2xl p-5 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h2 className="font-bold" style={{ color: 'var(--text)' }}>Give an existing user partner access</h2><p className="text-xs" style={{ color: 'var(--text-muted)' }}>The user keeps their current account and login. This creates a separate partner profile and referral link; it does not grant admin access.</p>
          <label className="text-xs font-semibold block" style={{ color: 'var(--text-muted)' }}>Existing Vuka account email</label>
          <div className="flex gap-2"><input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="partner@example.com" className="min-w-0 flex-1 rounded-xl px-3 py-3 text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} /><button disabled={working} className="flex items-center gap-2 px-4 rounded-xl font-bold disabled:opacity-50" style={{ background: 'var(--sky)', color: '#06111b' }}><UserPlus size={15} /> Add</button></div>
        </form>
        <div className="rounded-2xl p-5 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h2 className="font-bold" style={{ color: 'var(--text)' }}>Generate monthly statements</h2><p className="text-xs" style={{ color: 'var(--text-muted)' }}>The contract rate uses creator qualification at the end of the month before the statement period. Any statement with unknown processor fees stays in draft and cannot be paid out.</p>
          <div className="flex gap-2"><input type="month" value={period} onChange={e => setPeriod(e.target.value)} className="min-w-0 flex-1 rounded-xl px-3 py-3 text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} /><button disabled={working || !period} onClick={issueStatements} className="flex items-center gap-2 px-4 rounded-xl font-bold disabled:opacity-50" style={{ background: 'var(--sky)', color: '#06111b' }}><FileText size={15} /> Generate</button></div>
        </div>
      </section>

      <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}><h2 className="font-bold" style={{ color: 'var(--text)' }}>Partners and their progress</h2></div>
        {partners.length === 0 ? <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>No partner profiles created yet.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>{['Partner','Referral link','Creators','Base share','Status','Open portal'].map(h => <th key={h} className="text-left p-3 whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{partners.map(p => <tr key={p.id} className="border-t" style={{ borderColor: 'var(--border)' }}><td className="p-3"><p className="font-bold" style={{ color: 'var(--text)' }}>{p.user.name}</p><p className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.user.email}</p>{p.paypalEmail && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>PayPal: {p.paypalEmail}</p>}</td><td className="p-3"><code className="text-xs" style={{ color: 'var(--sky)' }}>{p.referralCode}</code></td><td className="p-3 tabular-nums" style={{ color: 'var(--text)' }}>{p.referredCreators}</td><td className="p-3" style={{ color: 'var(--text)' }}>{(p.currentRate * 100).toFixed(1)}% current estimate / {(p.baseRate * 100).toFixed(1)}% base</td><td className="p-3"><button onClick={() => action({ action: 'set_status', partnerId: p.id, isActive: !p.isActive }, p.isActive ? 'Partner paused.' : 'Partner reactivated.')} className="px-2 py-1 rounded-full text-xs font-bold" style={{ background: p.isActive ? 'rgba(70,180,110,.12)' : 'rgba(220,170,50,.12)', color: p.isActive ? 'var(--green)' : '#d99b26' }}>{p.isActive ? 'Active' : 'Paused'}</button></td><td className="p-3"><button onClick={() => openPartnerProgress(p.id)} className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--sky)' }}>View progress <ExternalLink size={12} /></button></td></tr>)}</tbody></table></div>}
      </section>

      {selectedPartnerId && (
        <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="p-5 border-b flex items-start justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
            <div><h2 className="font-bold" style={{ color: 'var(--text)' }}>Partner qualification detail</h2><p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{selectedPartnerDetails?.partner?.user?.name || 'Loading partner'} · Rate estimate {selectedPartnerDetails ? (selectedPartnerDetails.rate * 100).toFixed(1) + '%' : '—'}</p></div>
            <button onClick={() => { setSelectedPartnerId(''); setSelectedPartnerDetails(null); }} className="text-xs font-bold" style={{ color: 'var(--sky)' }}>Close</button>
          </div>
          {loadingPartnerDetails ? <p className="p-5 text-sm" style={{ color: 'var(--text-muted)' }}>Loading creator qualification data…</p> : selectedPartnerDetails?.creators?.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>{['Creator','Role','Verification','Release','Sales / 90d','Unique fans','Gross / 90d','Category','Points','Eligibility'].map(h => <th key={h} className="text-left p-3 whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{selectedPartnerDetails.creators.map((c: any) => <tr key={c.userId} className="border-t" style={{ borderColor: 'var(--border)' }}><td className="p-3" style={{ color: 'var(--text)' }}>{c.name}</td><td className="p-3 capitalize" style={{ color: 'var(--text)' }}>{c.role}</td><td className="p-3" style={{ color: c.verified ? 'var(--green)' : '#d99b26' }}>{c.verified ? 'Verified' : 'Pending'}</td><td className="p-3" style={{ color: c.hasRelease ? 'var(--green)' : '#d99b26' }}>{c.hasRelease ? 'Yes' : 'No'}</td><td className="p-3" style={{ color: 'var(--text)' }}>{c.sales90d}</td><td className="p-3" style={{ color: 'var(--text)' }}>{c.uniqueFans90d}</td><td className="p-3" style={{ color: 'var(--text)' }}>{money(c.grossSales90d)}</td><td className="p-3 capitalize" style={{ color: 'var(--text)' }}>{c.category.replaceAll('_', ' ')}</td><td className="p-3" style={{ color: 'var(--text)' }}>{c.points.toFixed(1)}</td><td className="p-3"><div className="flex items-center gap-2">{c.excluded ? <button onClick={async () => { await action({ action: 'restore_creator', partnerId: selectedPartnerId, referredUserId: c.userId }, 'Creator restored to qualification review.'); await openPartnerProgress(selectedPartnerId); }} className="text-xs font-bold" style={{ color: 'var(--green)' }}>Restore</button> : c.exclusionEffectiveFrom ? <button onClick={async () => { await action({ action: 'restore_creator', partnerId: selectedPartnerId, referredUserId: c.userId }, 'Scheduled exclusion cancelled.'); await openPartnerProgress(selectedPartnerId); }} className="text-xs font-bold" style={{ color: 'var(--green)' }}>Cancel exclusion</button> : <button onClick={async () => { const reason = window.prompt('Why should this referral be excluded?'); if (!reason) return; await action({ action: 'exclude_creator', partnerId: selectedPartnerId, referredUserId: c.userId, reason }, 'Creator exclusion scheduled for next month.'); await openPartnerProgress(selectedPartnerId); }} className="text-xs font-bold" style={{ color: '#d99b26' }}>Exclude next month</button>}</div>{c.exclusionReason && <p className="text-xs mt-1 max-w-xs" style={{ color: 'var(--text-muted)' }}>{c.excluded ? 'Excluded: ' : 'Scheduled: '}{c.exclusionReason}{c.exclusionEffectiveFrom ? ` · effective ${date(c.exclusionEffectiveFrom)}` : ''}</p>}</td></tr>)}</tbody></table></div> : <p className="p-5 text-sm" style={{ color: 'var(--text-muted)' }}>No referred creator accounts to display.</p>}
        </section>
      )}

      <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}><h2 className="font-bold" style={{ color: 'var(--text)' }}>Recent statements</h2></div>
        {allStatements.length === 0 ? <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>No statements generated.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>{['Partner','Period','Platform fees','Processor fees known','Share rate','Share amount','Status'].map(h => <th key={h} className="text-left p-3 whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{allStatements.map(s => <tr key={s.id} className="border-t" style={{ borderColor: 'var(--border)' }}><td className="p-3"><p style={{ color: 'var(--text)' }}>{s.partnerName}</p><p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.partnerEmail}</p></td><td className="p-3 whitespace-nowrap" style={{ color: 'var(--text)' }}>{date(s.periodStart)} – {date(s.periodEnd)}</td><td className="p-3 tabular-nums" style={{ color: 'var(--text)' }}>{money(s.grossPlatformFees)}</td><td className="p-3 tabular-nums" style={{ color: 'var(--text)' }}>{money(s.knownProcessorFees)}{(s.unknownProcessorFeeRows > 0 || s.unknownPlatformFeeRows > 0) && <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#d99b26' }}><AlertTriangle size={12} /> {s.unknownProcessorFeeRows} processor / {s.unknownPlatformFeeRows} platform gaps</p>}</td><td className="p-3" style={{ color: 'var(--text)' }}>{(s.shareRate * 100).toFixed(1)}%</td><td className="p-3 font-bold tabular-nums" style={{ color: 'var(--text)' }}>{money(s.shareAmount)}</td><td className="p-3 capitalize" style={{ color: s.status === 'issued' || s.status === 'paid' ? 'var(--green)' : '#d99b26' }}>{s.status}</td></tr>)}</tbody></table></div>}
      </section>

      <section className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h2 className="font-bold" style={{ color: 'var(--text)' }}>Record a manual partner payout</h2><p className="text-xs" style={{ color: 'var(--text-muted)' }}>Send the payout through the currently agreed interim method, verify the destination, then record the payment reference here. OZOW bank payouts are not enabled by this screen.</p>
        <form onSubmit={markPaid} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select required value={payoutId} onChange={e => { setPayoutId(e.target.value); const p = allPayouts.find(x => x.id === e.target.value); if (p?.paypalEmail) setMessage(`Destination on file: ${p.paypalEmail}`); }} className="rounded-xl px-3 py-3 text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}><option value="">Select an unpaid payout</option>{allPayouts.map(p => <option key={p.id} value={p.id}>{p.partnerName} · {money(p.amount)} · {p.status}</option>)}</select>
          <input required value={reference} onChange={e => setReference(e.target.value)} placeholder="Payment reference / transaction ID" className="rounded-xl px-3 py-3 text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <button disabled={working} className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold disabled:opacity-50" style={{ background: 'var(--sky)', color: '#06111b' }}><CheckCircle size={15} /> Mark paid</button>
        </form>
      </section>
    </main>
  );
}
