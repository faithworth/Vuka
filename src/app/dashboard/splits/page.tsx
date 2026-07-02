'use client';
// src/app/dashboard/splits/page.tsx
// Revenue split sheets — create per-item collaborator agreements.
// Percentages must sum to 100. Locked after first sale.

import { useEffect, useState } from 'react';
import { Plus, Trash2, Users, Lock, Check, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

interface Recipient { name: string; email: string; role: string; percentage: string; artistId?: string }
interface SplitSheet {
  id: string; title: string; itemType: string; itemId: string; isLocked: boolean;
  createdAt: string;
  splits: { id: string; name: string; email: string; role: string; percentage: number }[];
  _count: { disbursements: number };
}

// Every item type a fan can directly purchase — matches the columns on
// the Purchase model (beatId / releaseId / videoId / sampleId / merchId).
// 'release' covers both catalog releases and distribution-only releases.
const ITEM_TYPES = ['beat', 'release', 'video', 'sample', 'merch'];

const emptyRecipient = (): Recipient => ({ name: '', email: '', role: '', percentage: '' });

export default function SplitsPage() {
  const [sheets, setSheets]       = useState<SplitSheet[]>([]);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [expanded, setExpanded]   = useState<string | null>(null);

  // Form state
  const [title, setTitle]         = useState('');
  const [itemType, setItemType]   = useState('beat');
  const [itemId, setItemId]       = useState('');
  const [recipients, setRecipients] = useState<Recipient[]>([emptyRecipient(), emptyRecipient()]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/splits');
      if (res.ok) { const d = await res.json(); setSheets(d.sheets ?? []); }
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function addRecipient() {
    setRecipients(r => [...r, emptyRecipient()]);
  }

  function removeRecipient(i: number) {
    setRecipients(r => r.filter((_, idx) => idx !== i));
  }

  function updateRecipient(i: number, field: keyof Recipient, value: string) {
    setRecipients(r => r.map((rec, idx) => idx === i ? { ...rec, [field]: value } : rec));
  }

  const totalPct = recipients.reduce((s, r) => s + (parseFloat(r.percentage) || 0), 0);
  const pctOk    = Math.abs(totalPct - 100) < 0.01;

  async function save() {
    setError(''); setSuccess('');
    if (!title.trim())  { setError('Title required'); return; }
    if (!itemId.trim()) { setError('Item ID required'); return; }
    if (!pctOk)         { setError(`Percentages must sum to 100 (currently ${totalPct.toFixed(1)}%)`); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/dashboard/splits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, itemType, itemId: itemId.trim(),
          splits: recipients.filter(r => r.name && r.email && r.percentage),
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setSuccess('Split sheet created.');
        setCreating(false);
        setTitle(''); setItemId('');
        setRecipients([emptyRecipient(), emptyRecipient()]);
        await load();
      } else {
        setError(d.error ?? 'Failed to create split sheet');
      }
    } catch { setError('Network error'); }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="p-10 flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
        <VukaLoader size={18} /> Loading split sheets…
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-2xl">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Users size={22} style={{ color: 'var(--gold)' }} /> Split Sheets
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Add collaborators and assign percentages. Revenue splits automatically on each sale.
          </p>
        </div>
        <button onClick={() => { setCreating(c => !c); setError(''); setSuccess(''); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white"
          style={{ background: creating ? 'var(--surface2)' : 'linear-gradient(135deg,#d4a000,#b38600)' }}>
          {creating ? 'Cancel' : <><Plus size={15} /> New Split</>}
        </button>
      </div>

      {/* Feedback */}
      {success && (
        <div className="flex items-center gap-2 text-sm p-3 rounded-xl mb-4"
          style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--green)' }}>
          <Check size={14} /> {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-sm p-3 rounded-xl mb-4"
          style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171' }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Create form */}
      {creating && (
        <div className="p-5 rounded-2xl mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h2 className="text-sm font-bold mb-4" style={{ color: 'var(--text)' }}>New Split Sheet</h2>

          <div className="space-y-3 mb-4">
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-muted)' }}>Sheet Title</label>
              <input className="input w-full" placeholder="e.g. Fully Charged Split"
                value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-muted)' }}>Item Type</label>
                <select className="input w-full" value={itemType} onChange={e => setItemType(e.target.value)}>
                  {ITEM_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-muted)' }}>
                  Item ID <span style={{ fontWeight: 400 }}>(from URL or admin)</span>
                </label>
                <input className="input w-full font-mono text-xs" placeholder="cuid..."
                  value={itemId} onChange={e => setItemId(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Recipients */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                Collaborators
              </label>
              <span className="text-xs font-bold" style={{ color: pctOk ? 'var(--green)' : totalPct > 100 ? '#f87171' : 'var(--text-muted)' }}>
                {totalPct.toFixed(1)}% / 100%
              </span>
            </div>

            <div className="space-y-2">
              {recipients.map((r, i) => (
                <div key={i} className="p-3 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input className="input text-sm" placeholder="Name"
                      value={r.name} onChange={e => updateRecipient(i, 'name', e.target.value)} />
                    <input className="input text-sm" placeholder="Email"
                      value={r.email} onChange={e => updateRecipient(i, 'email', e.target.value)} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <input className="input text-sm" placeholder="Role (optional)"
                      value={r.role} onChange={e => updateRecipient(i, 'role', e.target.value)} />
                    <div className="flex items-center gap-1">
                      <input className="input text-sm text-center" placeholder="%" type="number" min="0" max="100" step="0.1"
                        value={r.percentage} onChange={e => updateRecipient(i, 'percentage', e.target.value)} />
                      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>%</span>
                    </div>
                    {recipients.length > 1 && (
                      <button onClick={() => removeRecipient(i)} className="flex items-center justify-center p-2 rounded-lg"
                        style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button onClick={addRecipient}
              className="flex items-center gap-1.5 text-xs font-semibold mt-2 px-3 py-2 rounded-lg"
              style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
              <Plus size={12} /> Add collaborator
            </button>
          </div>

          <div className="p-3 rounded-xl mb-4 text-xs" style={{ background: 'rgba(56,182,232,0.08)', color: 'var(--text-muted)' }}>
            Once a sale is made, this sheet will be locked and cannot be edited. All collaborators will be paid automatically.
          </div>

          <button onClick={save} disabled={saving || !pctOk}
            className="w-full py-3 rounded-xl font-bold text-sm text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#d4a000,#b38600)' }}>
            {saving ? <span className="flex items-center justify-center gap-2"><VukaLoader size={14} /> Saving…</span> : 'Create Split Sheet'}
          </button>
        </div>
      )}

      {/* Sheets list */}
      {sheets.length === 0 && !creating ? (
        <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Users size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          <h3 className="font-bold mb-1" style={{ color: 'var(--text)' }}>No split sheets yet</h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Create one to automatically split revenue with collaborators on any beat or release.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sheets.map(sheet => (
            <div key={sheet.id} className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <button className="w-full flex items-center justify-between px-5 py-4"
                onClick={() => setExpanded(expanded === sheet.id ? null : sheet.id)}>
                <div className="flex items-center gap-3 text-left">
                  {sheet.isLocked && <Lock size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                  <div>
                    <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>{sheet.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {sheet.itemType} · {sheet.splits.length} collaborator{sheet.splits.length !== 1 ? 's' : ''}
                      {sheet._count.disbursements > 0 && ` · ${sheet._count.disbursements} disbursement${sheet._count.disbursements !== 1 ? 's' : ''}`}
                      {sheet.isLocked && ' · Locked'}
                    </p>
                  </div>
                </div>
                {expanded === sheet.id ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
              </button>

              {expanded === sheet.id && (
                <div className="px-5 pb-4 border-t" style={{ borderColor: 'var(--border)' }}>
                  <div className="mt-3 space-y-2">
                    {sheet.splits.map(s => (
                      <div key={s.id} className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-semibold" style={{ color: 'var(--text)' }}>{s.name}</span>
                          {s.role && <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>{s.role}</span>}
                          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.email}</div>
                        </div>
                        <span className="font-black text-base" style={{ color: 'var(--gold)' }}>
                          {s.percentage}%
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                    Created {new Date(sheet.createdAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {sheet.isLocked && ' — locked after first sale'}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
