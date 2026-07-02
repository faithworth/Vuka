'use client';
// src/app/dashboard/campaigns/page.tsx
// Crowdfunding campaigns — create, manage, publish, track backers.
// No separate platform fee — runs on the artist's existing plan rate.

import { useEffect, useState } from 'react';
import {
  Plus, Megaphone, Trash2, Eye, Check, AlertCircle, Users, Target, Calendar, ChevronRight, TrendingUp, Lock, Globe,
} from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

interface CampaignTier { id: string; title: string; description: string; amount: number; perks: string[]; maxBackers: number | null; backerCount: number }
interface Campaign {
  id: string; title: string; description: string; coverUrl: string;
  targetAmount: number; currentAmount: number; currency: string;
  deadline: string; campaignType: string; status: string; slug: string;
  backerCount: number; tiers: CampaignTier[]; _count: { backers: number };
}

type FormTier = { title: string; description: string; amount: string; perks: string; maxBackers: string }
type Step = 'list' | 'create' | 'detail'

function fmtRand(n: number) { return `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function daysLeft(deadline: string) { return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000)); }
function pct(current: number, target: number) { return Math.min(100, Math.round((current / target) * 100)); }

const STATUS_COLORS: Record<string, string> = {
  draft:     'rgba(156,163,175,0.2)',
  active:    'rgba(34,197,94,0.15)',
  funded:    'rgba(212,160,0,0.15)',
  failed:    'rgba(248,113,113,0.15)',
  cancelled: 'rgba(156,163,175,0.1)',
};
const STATUS_TEXT: Record<string, string> = {
  draft: '#9ca3af', active: '#22c55e', funded: '#d4a000', failed: '#f87171', cancelled: '#6b7280',
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns]   = useState<Campaign[]>([]);
  const [loading, setLoading]       = useState(true);
  const [step, setStep]             = useState<Step>('list');
  const [selected, setSelected]     = useState<Campaign | null>(null);
  const [saving, setSaving]         = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');

  // Form fields
  const [title, setTitle]               = useState('');
  const [description, setDescription]   = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [deadline, setDeadline]         = useState('');
  const [campaignType, setCampaignType] = useState<'flexible' | 'all_or_nothing'>('flexible');
  const [tiers, setTiers]               = useState<FormTier[]>([{ title: '', description: '', amount: '', perks: '', maxBackers: '' }]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/campaigns');
      if (res.ok) { const d = await res.json(); setCampaigns(d.campaigns ?? []); }
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function resetForm() {
    setTitle(''); setDescription(''); setTargetAmount(''); setDeadline('');
    setCampaignType('flexible');
    setTiers([{ title: '', description: '', amount: '', perks: '', maxBackers: '' }]);
    setError(''); setSuccess('');
  }

  function addTier() { setTiers(t => [...t, { title: '', description: '', amount: '', perks: '', maxBackers: '' }]); }
  function removeTier(i: number) { setTiers(t => t.filter((_, idx) => idx !== i)); }
  function updateTier(i: number, field: keyof FormTier, value: string) {
    setTiers(t => t.map((tier, idx) => idx === i ? { ...tier, [field]: value } : tier));
  }

  async function create() {
    setError(''); setSaving(true);
    try {
      const validTiers = tiers.filter(t => t.title && t.amount);
      const res = await fetch('/api/dashboard/campaigns', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, description, targetAmount, deadline, campaignType,
          tiers: validTiers.map(t => ({
            title:       t.title,
            description: t.description,
            amount:      parseFloat(t.amount),
            perks:       t.perks.split('\n').map(p => p.trim()).filter(Boolean),
            maxBackers:  t.maxBackers ? parseInt(t.maxBackers) : null,
          })),
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setSuccess('Campaign created as draft. Review and publish when ready.');
        setStep('list');
        resetForm();
        await load();
      } else {
        setError(d.error ?? 'Failed to create');
      }
    } catch { setError('Network error'); }
    setSaving(false);
  }

  async function publish(id: string) {
    setPublishing(true); setError('');
    try {
      const res = await fetch(`/api/dashboard/campaigns/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish' }),
      });
      const d = await res.json();
      if (d.ok) { await load(); setSelected(d.campaign); }
      else setError(d.error ?? 'Failed to publish');
    } catch { setError('Network error'); }
    setPublishing(false);
  }

  async function deleteCampaign(id: string) {
    setDeleting(true); setError('');
    try {
      const res = await fetch(`/api/dashboard/campaigns/${id}`, { method: 'DELETE' });
      const d   = await res.json();
      if (d.ok) { setStep('list'); setSelected(null); await load(); }
      else setError(d.error ?? 'Failed to delete');
    } catch { setError('Network error'); }
    setDeleting(false);
  }

  if (loading) {
    return (
      <div className="p-10 flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
        <VukaLoader size={18} /> Loading campaigns…
      </div>
    );
  }

  // ── CREATE FORM ──────────────────────────────────────────────────────────
  if (step === 'create') {
    return (
      <div className="p-6 md:p-10 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>New Campaign</h1>
          <button onClick={() => { setStep('list'); resetForm(); }}
            className="text-sm px-4 py-2 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            Cancel
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm p-3 rounded-xl mb-4"
            style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171' }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Basics */}
          <div className="p-5 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-bold mb-4" style={{ color: 'var(--text)' }}>Campaign Details</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-muted)' }}>Title *</label>
                <input className="input w-full" placeholder="e.g. Fund My Debut Album"
                  value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-muted)' }}>Description</label>
                <textarea className="input w-full resize-none" rows={4}
                  placeholder="Tell your fans what this campaign is for and why it matters…"
                  value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-muted)' }}>Target Amount (ZAR) *</label>
                  <input className="input w-full" type="number" min="100" placeholder="5000"
                    value={targetAmount} onChange={e => setTargetAmount(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-muted)' }}>Deadline *</label>
                  <input className="input w-full" type="date"
                    min={new Date(Date.now() + 86_400_000 * 7).toISOString().split('T')[0]}
                    value={deadline} onChange={e => setDeadline(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--text-muted)' }}>Campaign Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {([['flexible', 'Flexible', 'Keep all funds raised, regardless of goal.'],
                     ['all_or_nothing', 'All-or-Nothing', 'Funds returned if goal not reached by deadline.']] as const).map(([val, label, desc]) => (
                    <button key={val} onClick={() => setCampaignType(val)}
                      className="p-3 rounded-xl text-left"
                      style={{
                        background: campaignType === val ? 'rgba(212,160,0,0.12)' : 'var(--surface2)',
                        border: `1px solid ${campaignType === val ? 'rgba(212,160,0,0.4)' : 'var(--border)'}`,
                      }}>
                      <div className="text-sm font-bold mb-0.5" style={{ color: campaignType === val ? 'var(--gold)' : 'var(--text)' }}>{label}</div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Backer tiers */}
          <div className="p-5 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Backer Tiers</h2>
              <button onClick={addTier} className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                <Plus size={11} /> Add Tier
              </button>
            </div>
            <div className="space-y-3">
              {tiers.map((tier, i) => (
                <div key={i} className="p-4 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>Tier {i + 1}</span>
                    {tiers.length > 1 && (
                      <button onClick={() => removeTier(i)} className="p-1.5 rounded-lg"
                        style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input className="input text-sm" placeholder="Tier name (e.g. Supporter)"
                      value={tier.title} onChange={e => updateTier(i, 'title', e.target.value)} />
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-bold" style={{ color: 'var(--text-muted)' }}>R</span>
                      <input className="input text-sm flex-1" type="number" min="10" placeholder="Amount"
                        value={tier.amount} onChange={e => updateTier(i, 'amount', e.target.value)} />
                    </div>
                  </div>
                  <textarea className="input w-full text-sm resize-none mb-2" rows={2}
                    placeholder="What do backers at this tier receive? (one perk per line)"
                    value={tier.perks} onChange={e => updateTier(i, 'perks', e.target.value)} />
                  <div className="flex items-center gap-2">
                    <input className="input text-sm w-32" type="number" min="1" placeholder="Max backers"
                      value={tier.maxBackers} onChange={e => updateTier(i, 'maxBackers', e.target.value)} />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Leave blank for unlimited</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-xl text-sm" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--green)' }}>No extra fee.</strong> Campaigns run on your existing plan rate — the same fee you pay on music sales. No additional crowdfunding surcharge.
          </div>

          <button onClick={create} disabled={saving}
            className="w-full py-3 rounded-xl font-bold text-sm text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#d4a000,#b38600)' }}>
            {saving
              ? <span className="flex items-center justify-center gap-2"><VukaLoader size={14} /> Creating…</span>
              : 'Save as Draft'}
          </button>
        </div>
      </div>
    );
  }

  // ── DETAIL VIEW ──────────────────────────────────────────────────────────
  if (step === 'detail' && selected) {
    const progressPct = pct(selected.currentAmount, selected.targetAmount);
    const days        = daysLeft(selected.deadline);

    return (
      <div className="p-6 md:p-10 max-w-2xl">
        <button onClick={() => { setStep('list'); setSelected(null); setError(''); }}
          className="text-sm flex items-center gap-1.5 mb-6" style={{ color: 'var(--text-muted)' }}>
          ← Back to Campaigns
        </button>

        {error && (
          <div className="flex items-center gap-2 text-sm p-3 rounded-xl mb-4"
            style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171' }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {/* Hero */}
        {selected.coverUrl && (
          <div className="w-full h-48 rounded-2xl overflow-hidden mb-4 bg-cover bg-center"
            style={{ backgroundImage: `url(${selected.coverUrl})` }} />
        )}

        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>{selected.title}</h1>
            {selected.description && (
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{selected.description}</p>
            )}
          </div>
          <span className="text-xs font-bold px-3 py-1.5 rounded-full flex-shrink-0 capitalize"
            style={{ background: STATUS_COLORS[selected.status], color: STATUS_TEXT[selected.status] }}>
            {selected.status}
          </span>
        </div>

        {/* Progress */}
        <div className="p-5 rounded-2xl mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-end justify-between mb-2">
            <div>
              <div className="text-2xl font-black" style={{ color: 'var(--gold)' }}>
                {fmtRand(selected.currentAmount)}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                raised of {fmtRand(selected.targetAmount)} goal
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-black" style={{ color: 'var(--text)' }}>{selected._count.backers}</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>backers</div>
            </div>
            <div className="text-right">
              <div className="text-xl font-black" style={{ color: 'var(--sky)' }}>{days}</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>days left</div>
            </div>
          </div>
          <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${progressPct}%`,
                background: progressPct >= 100
                  ? 'linear-gradient(90deg,#10b981,#22c55e)'
                  : 'linear-gradient(90deg,#d4a000,#f59e0b)',
              }} />
          </div>
          <div className="text-xs mt-1.5 text-right font-semibold" style={{ color: 'var(--text-muted)' }}>
            {progressPct}%
          </div>
        </div>

        {/* Tiers */}
        {selected.tiers.length > 0 && (
          <div className="mb-4">
            <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Backer Tiers</h2>
            <div className="space-y-2">
              {selected.tiers.map(tier => (
                <div key={tier.id} className="p-4 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm" style={{ color: 'var(--text)' }}>{tier.title}</span>
                    <span className="font-black" style={{ color: 'var(--gold)' }}>{fmtRand(tier.amount)}</span>
                  </div>
                  {tier.perks.length > 0 && (
                    <ul className="text-xs space-y-0.5 mt-2" style={{ color: 'var(--text-muted)' }}>
                      {tier.perks.map((p, i) => <li key={i} className="flex items-center gap-1.5"><Check size={10} style={{ color: 'var(--green)', flexShrink: 0 }} />{p}</li>)}
                    </ul>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span className="flex items-center gap-1"><Users size={11} /> {tier.backerCount} backed</span>
                    {tier.maxBackers && <span>/ {tier.maxBackers} max</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 flex-wrap">
          {selected.status === 'draft' && (
            <>
              <button onClick={() => publish(selected.id)} disabled={publishing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}>
                {publishing ? <VukaLoader size={14} /> : <Globe size={14} />}
                Publish Campaign
              </button>
              <button onClick={() => deleteCampaign(selected.id)} disabled={deleting}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm"
                style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}>
                {deleting ? <VukaLoader size={14} /> : <Trash2 size={14} />}
                Delete Draft
              </button>
            </>
          )}
          {selected.status === 'active' && (
            <a href={`/campaigns/${selected.slug}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              <Eye size={14} /> View Public Page
            </a>
          )}
        </div>
      </div>
    );
  }

  // ── LIST VIEW ────────────────────────────────────────────────────────────
  return (
    <div className="p-6 md:p-10 max-w-2xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Megaphone size={22} style={{ color: 'var(--gold)' }} /> Campaigns
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Fund your next project directly with your fans. No extra fee on top of your plan.
          </p>
        </div>
        <button onClick={() => { setStep('create'); setError(''); setSuccess(''); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white"
          style={{ background: 'linear-gradient(135deg,#d4a000,#b38600)' }}>
          <Plus size={15} /> New Campaign
        </button>
      </div>

      {success && (
        <div className="flex items-center gap-2 text-sm p-3 rounded-xl mb-4"
          style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--green)' }}>
          <Check size={14} /> {success}
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Megaphone size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          <h3 className="font-bold mb-1" style={{ color: 'var(--text)' }}>No campaigns yet</h3>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            Fund your next album, music video, or tour directly<br />from your fans — flexible or all-or-nothing.
          </p>
          <button onClick={() => setStep('create')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white"
            style={{ background: 'linear-gradient(135deg,#d4a000,#b38600)' }}>
            <Plus size={15} /> Create Your First Campaign
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => {
            const progressPct = pct(c.currentAmount, c.targetAmount);
            const days        = daysLeft(c.deadline);
            return (
              <button key={c.id} onClick={() => { setSelected(c); setStep('detail'); setError(''); }}
                className="w-full p-5 rounded-2xl text-left hover:opacity-90 transition-opacity"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-black text-sm truncate" style={{ color: 'var(--text)' }}>{c.title}</h3>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full capitalize flex-shrink-0"
                        style={{ background: STATUS_COLORS[c.status], color: STATUS_TEXT[c.status] }}>
                        {c.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span className="flex items-center gap-1"><Target size={11} /> {fmtRand(c.targetAmount)}</span>
                      <span className="flex items-center gap-1"><Users size={11} /> {c._count.backers} backers</span>
                      <span className="flex items-center gap-1"><Calendar size={11} /> {days}d left</span>
                    </div>
                  </div>
                  <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                </div>
                <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
                  <div className="h-full rounded-full"
                    style={{
                      width: `${progressPct}%`,
                      background: progressPct >= 100
                        ? 'linear-gradient(90deg,#10b981,#22c55e)'
                        : 'linear-gradient(90deg,#d4a000,#f59e0b)',
                    }} />
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs font-semibold" style={{ color: 'var(--gold)' }}>
                    {fmtRand(c.currentAmount)} raised
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{progressPct}%</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
