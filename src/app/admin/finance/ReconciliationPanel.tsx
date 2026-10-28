'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, RefreshCw, Save } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

type Row = {
  id: string;
  recordType: 'purchase' | 'support' | 'subscription' | 'industry_service';
  source: string;
  amount: number;
  platformFee: number;
  processorFee: number | null;
  platformFeeMissing: boolean;
  createdAt: string;
  reference: string;
};
type Inputs = { processorFee: string; platformFee: string };

const money = (n: number) => formatCurrency(Number(n) || 0);
const date = (s: string) => new Date(s).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });

export default function ReconciliationPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [inputs, setInputs] = useState<Record<string, Inputs>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/finance?view=unreconciled', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load unreconciled rows.');
      const nextRows = (payload.rows || []) as Row[];
      setRows(nextRows);
      setInputs(previous => {
        const next = { ...previous };
        for (const row of nextRows) {
          if (!next[row.id]) next[row.id] = {
            processorFee: row.processorFee == null ? '' : String(row.processorFee),
            platformFee: row.platformFeeMissing ? '' : String(row.platformFee),
          };
        }
        return next;
      });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load unreconciled rows.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(row: Row) {
    const value = inputs[row.id] || { processorFee: '', platformFee: '' };
    const body: Record<string, unknown> = { action: 'set_fee_split', recordType: row.recordType, recordId: row.id };
    if (value.processorFee.trim()) body.processorFee = value.processorFee;
    if (value.platformFee.trim() && row.recordType !== 'subscription') body.platformFee = value.platformFee;
    if (body.processorFee === undefined && body.platformFee === undefined) {
      setError('Enter at least one verified fee amount. Do not guess.');
      return;
    }
    setSavingId(row.id); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/finance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not save reconciliation.');
      setMessage('Fee values saved. Any unpaid statement for the affected month was recalculated.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save reconciliation.'); }
    finally { setSavingId(''); }
  }

  return (
    <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="p-5 flex flex-wrap items-start justify-between gap-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div><h2 className="font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}><AlertTriangle size={17} style={{ color: '#d99b26' }} /> Fee reconciliation queue</h2><p className="text-xs mt-1 max-w-3xl" style={{ color: 'var(--text-muted)' }}>Enter fees from actual provider settlement records only. Unknown values are not treated as zero. A partner statement stays in draft until both platform-fee and processor-fee gaps are reconciled.</p></div>
        <button onClick={load} className="p-2 rounded-lg" aria-label="Refresh reconciliation rows" style={{ background: 'var(--surface2)', color: 'var(--text)' }}><RefreshCw size={15} /></button>
      </div>
      {error && <p className="m-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(220,70,70,.1)', color: '#e66' }}>{error}</p>}
      {message && <p className="m-4 p-3 rounded-lg text-sm flex items-center gap-2" style={{ background: 'rgba(70,180,110,.1)', color: 'var(--green)' }}><CheckCircle size={14} />{message}</p>}
      {loading ? <p className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Loading reconciliation queue…</p> : rows.length === 0 ? <p className="p-6 text-sm" style={{ color: 'var(--green)' }}>No unreconciled fee rows found.</p> : (
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {rows.map(row => {
            const value = inputs[row.id] || { processorFee: '', platformFee: '' };
            return <form key={row.id} onSubmit={e => { e.preventDefault(); void save(row); }} className="p-4 grid grid-cols-1 xl:grid-cols-[minmax(160px,1fr)_minmax(130px,.8fr)_minmax(140px,.8fr)_minmax(140px,.8fr)_auto] gap-3 items-end" style={{ borderColor: 'var(--border)' }}>
              <div className="min-w-0"><p className="font-bold capitalize" style={{ color: 'var(--text)' }}>{row.source.replaceAll('_', ' ')}</p><p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{date(row.createdAt)} · {row.recordType}</p><p className="text-xs mt-1 break-all" style={{ color: 'var(--text-muted)' }}>ID: {row.id}</p>{row.reference && <p className="text-xs mt-1 break-all" style={{ color: 'var(--text-muted)' }}>Ref: {row.reference}</p>}</div>
              <div><p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Gross amount</p><p className="font-bold" style={{ color: 'var(--text)' }}>{money(row.amount)}</p></div>
              <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Processor fee (ZAR)<input inputMode="decimal" value={value.processorFee} onChange={e => setInputs(old => ({ ...old, [row.id]: { ...value, processorFee: e.target.value } }))} placeholder="Unknown" className="mt-1 w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} /></label>
              <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Platform fee (ZAR){row.recordType === 'subscription' ? <span className="block mt-1">Plan payment is fully Vuka revenue</span> : <input inputMode="decimal" value={value.platformFee} onChange={e => setInputs(old => ({ ...old, [row.id]: { ...value, platformFee: e.target.value } }))} placeholder="Unknown" className="mt-1 w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />}</label>
              <button disabled={savingId === row.id} className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold disabled:opacity-50" style={{ background: 'var(--sky)', color: '#06111b' }}><Save size={14} />{savingId === row.id ? 'Saving…' : 'Save'}</button>
            </form>;
          })}
        </div>
      )}
    </section>
  );
}
