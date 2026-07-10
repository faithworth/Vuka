'use client';
import { useEffect, useState } from 'react';
import { Building2, Plus, Users, Copy, Check, Trash2, AlertCircle, UserPlus, ChevronDown, ChevronUp, Lock, Wallet } from 'lucide-react';
import { getEffectivePlan } from '@/lib/plans';
import Link from 'next/link';
import VukaLoader from '@/components/brand/VukaLoader';

interface RosterArtist { id: string; name: string; slug: string; photoUrl?: string; revenueShare: number; status: string; joinedAt: string | null }
interface LabelData { id: string; name: string; slug: string; logoUrl: string; description: string; website: string; roster: RosterArtist[] }

export default function LabelPage() {
  const [label,    setLabel]    = useState<LabelData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [creating, setCreating] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');
  const [copiedLink, setCopied] = useState<string|null>(null);
  const [expanded, setExpanded] = useState<string|null>(null);

  // Create form
  const [name, setName]   = useState('');
  const [desc, setDesc]   = useState('');
  const [logo, setLogo]   = useState('');
  const [site, setSite]   = useState('');

  // Invite form
  const [artistSlug,    setSlug]    = useState('');
  const [revenueShare,  setShare]   = useState('80');
  const [inviteLink,    setInvLink] = useState('');

  const [planError, setPlanError] = useState(false);

  // ── Bulk payouts (Label plan exclusive) ──────────────────────
  interface BulkPayoutArtist {
    artistId: string; name: string; slug: string; photoUrl?: string;
    available: number; bankAccountId: string | null; bankLabel: string | null; payable: boolean;
  }
  const [bulkArtists, setBulkArtists] = useState<BulkPayoutArtist[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ succeeded: number; failed: number; results: { artistId: string; ok: boolean; amount?: number; error?: string }[] } | null>(null);

  async function loadBulkPayouts() {
    setBulkLoading(true);
    try {
      const r = await fetch('/api/label/payouts/bulk');
      if (r.ok) {
        const d = await r.json();
        const artists: BulkPayoutArtist[] = d.artists ?? [];
        setBulkArtists(artists);
        // Default-select artists that are actually payable
        setSelectedIds(new Set(artists.filter(a => a.payable).map(a => a.artistId)));
      }
    } finally {
      setBulkLoading(false);
    }
  }

  function toggleSelected(artistId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(artistId) ? next.delete(artistId) : next.add(artistId);
      return next;
    });
  }

  async function runBulkPayout() {
    if (selectedIds.size === 0) return;
    setBulkRunning(true);
    setBulkResult(null);
    try {
      const r = await fetch('/api/label/payouts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistIds: Array.from(selectedIds) }),
      });
      const d = await r.json();
      if (r.ok) {
        setBulkResult({ succeeded: d.succeeded, failed: d.failed, results: d.results });
        loadBulkPayouts(); // refresh balances after requesting
      } else {
        setError(d.error || 'Bulk payout failed');
      }
    } catch {
      setError('Bulk payout failed');
    } finally {
      setBulkRunning(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/label');
      if (r.status === 403) { setPlanError(true); setLoading(false); return; }
      if (r.ok) { const d = await r.json(); setLabel(d.label); if (d.label) loadBulkPayouts(); }
    } catch {}
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function createLabel() {
    setError(''); setSaving(true);
    try {
      const r = await fetch('/api/label', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name, description:desc, logoUrl:logo, website:site }) });
      const d = await r.json();
      if (d.ok) { setSuccess('Label created!'); setCreating(false); await load(); }
      else setError(d.error ?? 'Failed');
    } catch { setError('Network error'); }
    setSaving(false);
  }

  async function sendInvite() {
    setError(''); setSaving(true); setInvLink('');
    try {
      const r = await fetch('/api/label/invite', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ artistSlug, revenueShare }) });
      const d = await r.json();
      if (d.ok) { setInvLink(d.inviteLink); setSlug(''); }
      else setError(d.error ?? 'Failed');
    } catch { setError('Network error'); }
    setSaving(false);
  }

  async function removeArtist(artistId: string) {
    await fetch(`/api/label/roster/${artistId}`, { method:'DELETE' });
    await load();
  }

  async function copyInvite(link: string) {
    await navigator.clipboard.writeText(link);
    setCopied(link); setTimeout(() => setCopied(null), 2000);
  }

  // ── Upgrade wall — shown to artists not on the label plan ──
  if (planError) return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{ background: 'rgba(232,200,124,0.12)', border: '1px solid rgba(232,200,124,0.25)' }}>
          <Lock size={28} style={{ color: 'var(--gold)' }} />
        </div>
        <h2 className="text-2xl font-black mb-2" style={{ color: 'var(--text)' }}>Label Plan Required</h2>
        <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          The Label feature lets you manage multiple artists, set revenue splits, and issue invite links — all under one roof.
          It's available on the <strong style={{ color: 'var(--gold)' }}>Vuka Music Label plan</strong> (R999/mo, 5% platform fee).
        </p>
        <Link href="/pricing"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-black"
          style={{ background: 'var(--gold)' }}>
          Upgrade to Label →
        </Link>
        <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          Already on the Label plan?{' '}
          <button onClick={load} className="underline" style={{ color: 'var(--sky)' }}>Refresh</button>
        </p>
      </div>
    </div>
  );

  if (loading) return <div className="p-10 flex items-center gap-3" style={{ color:'var(--text-muted)' }}><VukaLoader size={18} />Loading label…</div>;

  // ── CREATE LABEL ──
  if (!label) return (
    <div className="p-6 md:p-10 max-w-xl">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background:'rgba(212,160,0,0.12)', border:'1px solid rgba(212,160,0,0.25)' }}>
          <Building2 size={22} style={{ color:'var(--gold)' }}/>
        </div>
        <div>
          <h1 className="text-2xl font-black" style={{ color:'var(--text)' }}>Label Dashboard</h1>
          <p className="text-sm mt-0.5" style={{ color:'var(--text-muted)' }}>Manage your roster, set revenue splits, and view consolidated analytics across all your artists.</p>
        </div>
      </div>
      {error && <div className="flex items-center gap-2 text-sm p-3 rounded-xl mb-4" style={{ background:'rgba(248,113,113,0.1)', color:'#f87171' }}><AlertCircle size={14}/>{error}</div>}
      {!creating ? (
        <div className="text-center py-14 rounded-2xl" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
          <Building2 size={32} className="mx-auto mb-3" style={{ color:'var(--text-muted)', opacity:0.4 }}/>
          <h3 className="font-bold mb-1" style={{ color:'var(--text)' }}>No label yet</h3>
          <p className="text-sm mb-6" style={{ color:'var(--text-muted)' }}>Create your label to manage multiple artists, set revenue splits, and access roster analytics.</p>
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white" style={{ background:'linear-gradient(135deg,#d4a000,#b38600)' }}><Plus size={15}/>Create Label</button>
        </div>
      ) : (
        <div className="p-5 rounded-2xl" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
          <h2 className="text-sm font-bold mb-4" style={{ color:'var(--text)' }}>Create Your Label</h2>
          <div className="space-y-3">
            <input className="input w-full" placeholder="Label name *" value={name} onChange={e => setName(e.target.value)} />
            <textarea className="input w-full resize-none" rows={3} placeholder="About the label" value={desc} onChange={e => setDesc(e.target.value)} />
            <input className="input w-full" placeholder="Logo URL" value={logo} onChange={e => setLogo(e.target.value)} />
            <input className="input w-full" placeholder="Website" value={site} onChange={e => setSite(e.target.value)} />
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={createLabel} disabled={saving || !name.trim()} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50" style={{ background:'linear-gradient(135deg,#d4a000,#b38600)' }}>
              {saving ? <span className="flex items-center justify-center gap-2"><VukaLoader size={14} />Creating…</span> : 'Create Label'}
            </button>
            <button onClick={() => setCreating(false)} className="px-4 py-2.5 rounded-xl font-bold text-sm" style={{ background:'var(--surface2)', color:'var(--text-muted)' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );

  const active  = label.roster.filter(r => r.status === 'active');
  const pending = label.roster.filter(r => r.status === 'pending');

  return (
    <div className="p-6 md:p-10 max-w-2xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          {label.logoUrl && <img src={label.logoUrl} alt={label.name} className="w-12 h-12 rounded-xl object-cover mb-2"/>}
          <h1 className="text-2xl font-black" style={{ color:'var(--text)' }}>{label.name}</h1>
          <p className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>vukamusic.com/label/{label.slug}</p>
        </div>
        <button onClick={() => setInviting(i => !i)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white" style={{ background:inviting ? 'var(--surface2)' : 'linear-gradient(135deg,#d4a000,#b38600)' }}>
          {inviting ? 'Cancel' : <><UserPlus size={15}/>Invite Artist</>}
        </button>
      </div>

      {error   && <div className="flex items-center gap-2 text-sm p-3 rounded-xl mb-4" style={{ background:'rgba(248,113,113,0.1)', color:'#f87171' }}><AlertCircle size={14}/>{error}</div>}
      {success && <div className="flex items-center gap-2 text-sm p-3 rounded-xl mb-4" style={{ background:'rgba(16,185,129,0.1)', color:'var(--green)' }}><Check size={14}/>{success}</div>}

      {/* Invite form */}
      {inviting && (
        <div className="p-5 rounded-2xl mb-6" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
          <h2 className="text-sm font-bold mb-3" style={{ color:'var(--text)' }}>Invite an Artist to Your Roster</h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color:'var(--text-muted)' }}>Artist Vuka Music slug</label>
              <input className="input w-full" placeholder="e.g. blaze-kwena-jr" value={artistSlug} onChange={e => setSlug(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color:'var(--text-muted)' }}>Artist revenue share (%)</label>
              <input className="input w-full" type="number" min="50" max="100" value={revenueShare} onChange={e => setShare(e.target.value)} />
            </div>
          </div>
          <div className="text-xs p-3 rounded-xl mb-3" style={{ background:'rgba(56,182,232,0.08)', color:'var(--text-muted)' }}>
            Artist keeps <strong style={{ color:'var(--sky)' }}>{revenueShare}%</strong> of net revenue (after Vuka Music fee). Label keeps {(100 - parseFloat(revenueShare || '0')).toFixed(0)}%. The artist must accept the invite before splits apply.
          </div>
          <button onClick={sendInvite} disabled={saving || !artistSlug.trim()} className="w-full py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50" style={{ background:'linear-gradient(135deg,#d4a000,#b38600)' }}>
            {saving ? <span className="flex items-center justify-center gap-2"><VukaLoader size={14} />Generating…</span> : 'Generate Invite Link'}
          </button>
          {inviteLink && (
            <div className="mt-3 p-3 rounded-xl" style={{ background:'var(--surface2)', border:'1px solid var(--border)' }}>
              <p className="text-xs mb-2" style={{ color:'var(--text-muted)' }}>Send this link to the artist:</p>
              <div className="flex items-center gap-2">
                <p className="text-xs font-mono flex-1 truncate" style={{ color:'var(--text)' }}>{inviteLink}</p>
                <button onClick={() => copyInvite(inviteLink)} className="p-2 rounded-lg flex-shrink-0" style={{ background:'rgba(212,160,0,0.15)', color:'var(--gold)' }}>
                  {copiedLink === inviteLink ? <Check size={13}/> : <Copy size={13}/>}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label:'Active Artists', value:active.length,  color:'var(--green)' },
          { label:'Pending Invites', value:pending.length, color:'var(--gold)' },
          { label:'Total Roster',   value:label.roster.length, color:'var(--sky)' },
        ].map(s => (
          <div key={s.label} className="p-4 rounded-2xl text-center" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
            <div className="text-xl font-black" style={{ color:s.color }}>{s.value}</div>
            <div className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Bulk Payouts — Label plan exclusive */}
      <div className="rounded-2xl p-4 mb-6" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Wallet size={16} style={{ color:'var(--gold)' }} />
            <h2 className="text-sm font-bold" style={{ color:'var(--text)' }}>Bulk Payouts</h2>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background:'var(--gold)', color:'#000' }}>LABEL</span>
          </div>
          {selectedIds.size > 0 && (
            <button onClick={runBulkPayout} disabled={bulkRunning} className="btn btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
              {bulkRunning ? <VukaLoader size={12} /> : `Request ${selectedIds.size} Payout${selectedIds.size > 1 ? 's' : ''}`}
            </button>
          )}
        </div>

        {bulkLoading ? (
          <div className="py-6 flex justify-center"><VukaLoader size={20} /></div>
        ) : bulkArtists.length === 0 ? (
          <p className="text-xs" style={{ color:'var(--text-muted)' }}>No active roster artists to pay out yet.</p>
        ) : (
          <div className="space-y-1.5">
            {bulkArtists.map(a => (
              <label key={a.artistId} className="flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer"
                     style={{ background:'var(--surface2)', opacity: a.payable ? 1 : 0.5 }}>
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(a.artistId)}
                    disabled={!a.payable}
                    onChange={() => toggleSelected(a.artistId)}
                  />
                  {a.photoUrl ? <img src={a.photoUrl} alt={a.name} className="w-7 h-7 rounded-lg object-cover"/> : <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs" style={{ background:'var(--surface)', color:'var(--text-muted)' }}>{a.name[0]}</div>}
                  <div>
                    <div className="text-xs font-bold" style={{ color:'var(--text)' }}>{a.name}</div>
                    <div className="text-[11px]" style={{ color:'var(--text-muted)' }}>
                      {a.bankLabel ?? 'No bank account on file'}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold" style={{ color: a.payable ? 'var(--green)' : 'var(--text-muted)' }}>R{a.available.toFixed(2)}</div>
                  {!a.payable && <div className="text-[10px]" style={{ color:'var(--text-muted)' }}>Below R50 min or no bank</div>}
                </div>
              </label>
            ))}
          </div>
        )}

        {bulkResult && (
          <div className="mt-3 p-3 rounded-xl text-xs" style={{ background:'rgba(56,182,232,0.08)', border:'1px solid rgba(56,182,232,0.2)' }}>
            <p className="font-semibold" style={{ color:'var(--text)' }}>
              {bulkResult.succeeded} payout{bulkResult.succeeded !== 1 ? 's' : ''} requested
              {bulkResult.failed > 0 && `, ${bulkResult.failed} skipped`}
            </p>
            {bulkResult.results.filter(r => !r.ok).map(r => {
              const artist = bulkArtists.find(a => a.artistId === r.artistId);
              return (
                <p key={r.artistId} className="mt-1" style={{ color:'var(--text-muted)' }}>
                  {artist?.name ?? r.artistId}: {r.error}
                </p>
              );
            })}
          </div>
        )}
      </div>

      {/* Roster */}
      {label.roster.length === 0 ? (
        <div className="text-center py-12 rounded-2xl" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
          <Users size={28} className="mx-auto mb-2" style={{ color:'var(--text-muted)', opacity:0.4 }}/>
          <p className="text-sm" style={{ color:'var(--text-muted)' }}>No artists yet. Invite your first roster artist above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <h2 className="text-sm font-bold mb-3" style={{ color:'var(--text)' }}>Roster</h2>
          {label.roster.map(r => (
            <div key={r.id} className="rounded-2xl overflow-hidden" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
              <button className="w-full flex items-center justify-between px-4 py-3.5" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                <div className="flex items-center gap-3">
                  {r.photoUrl ? <img src={r.photoUrl} alt={r.name} className="w-9 h-9 rounded-xl object-cover"/> : <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm" style={{ background:'var(--surface2)', color:'var(--text-muted)' }}>{r.name[0]}</div>}
                  <div className="text-left">
                    <div className="font-bold text-sm" style={{ color:'var(--text)' }}>{r.name}</div>
                    <div className="text-xs" style={{ color:'var(--text-muted)' }}>
                      {r.status === 'pending' ? <span style={{ color:'var(--gold)' }}>Invite pending</span> : <span style={{ color:'var(--green)' }}>Active · {r.revenueShare}% share</span>}
                    </div>
                  </div>
                </div>
                {expanded === r.id ? <ChevronUp size={15} style={{ color:'var(--text-muted)' }}/> : <ChevronDown size={15} style={{ color:'var(--text-muted)' }}/>}
              </button>
              {expanded === r.id && (
                <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor:'var(--border)' }}>
                  <div className="flex items-center justify-between text-xs" style={{ color:'var(--text-muted)' }}>
                    <span>Revenue split: artist keeps <strong style={{ color:'var(--text)' }}>{r.revenueShare}%</strong></span>
                    {r.joinedAt && <span>Joined {new Date(r.joinedAt).toLocaleDateString('en-ZA')}</span>}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <a href={`/artist/${r.slug}`} target="_blank" className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold" style={{ background:'var(--surface2)', color:'var(--text-muted)' }}>View Profile</a>
                    <button onClick={() => removeArtist(r.id)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold" style={{ background:'rgba(248,113,113,0.1)', color:'#f87171' }}><Trash2 size={11}/>Remove</button>
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
