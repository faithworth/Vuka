'use client';
import { useEffect, useState } from 'react';
import { Loader2, Plus, Users, Edit2, Trash2, Check, X } from 'lucide-react';

interface Tier {
  id: string;
  name: string;
  description: string;
  price: number;
  perks: string[];
  activeMembers?: number;
}

export default function MembershipsPage() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Tier | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [perksInput, setPerksInput] = useState('');

  useEffect(() => {
    fetch('/api/creator/tiers')
      .then(r => r.ok ? r.json() : { tiers: [] })
      .then(d => { setTiers(d.tiers || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function openCreate() {
    setEditing(null);
    setName(''); setDescription(''); setPrice(''); setPerksInput('');
    setError('');
    setShowForm(true);
  }

  function openEdit(tier: Tier) {
    setEditing(tier);
    setName(tier.name);
    setDescription(tier.description);
    setPrice(String(tier.price));
    setPerksInput(tier.perks.join('\n'));
    setError('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setError('');
  }

  async function saveTier() {
    if (!name.trim()) { setError('Tier name is required'); return; }
    if (!price || isNaN(Number(price)) || Number(price) <= 0) { setError('Enter a valid price'); return; }
    setSaving(true);
    setError('');
    const perks = perksInput.split('\n').map(p => p.trim()).filter(Boolean);
    const payload = { name: name.trim(), description: description.trim(), price: Number(price), perks };
    try {
      const res = await fetch('/api/creator/tiers', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { ...payload, id: editing.id } : payload),
      });
      if (res.ok) {
        const d = await res.json();
        if (editing) {
          setTiers(prev => prev.map(t => t.id === editing.id ? d.tier : t));
        } else {
          setTiers(prev => [d.tier, ...prev]);
        }
        closeForm();
      } else {
        const d = await res.json();
        setError(d.error || 'Failed to save tier');
      }
    } catch {
      setError('Failed to save tier');
    }
    setSaving(false);
  }

  async function deleteTier(id: string) {
    if (!confirm('Delete this membership tier? Existing members will lose access.')) return;
    try {
      const res = await fetch('/api/creator/tiers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) setTiers(prev => prev.filter(t => t.id !== id));
    } catch {}
  }

  return (
    <div className="p-6 md:p-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
            Memberships
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Create subscription tiers for your fans
          </p>
        </div>
        <button onClick={openCreate} className="btn btn-primary gap-2">
          <Plus size={15} /> New Tier
        </button>
      </div>

      {/* Tier form */}
      {showForm && (
        <div className="card p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold" style={{ color: 'var(--text)' }}>
              {editing ? 'Edit Tier' : 'New Membership Tier'}
            </h3>
            <button onClick={closeForm} style={{ color: 'var(--text-muted)' }}>
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                TIER NAME
              </label>
              <input className="input" placeholder="e.g. Supporter, VIP, Inner Circle"
                value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                MONTHLY PRICE (ZAR)
              </label>
              <input className="input" type="number" min="1" placeholder="e.g. 50"
                value={price} onChange={e => setPrice(e.target.value)} />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
              DESCRIPTION
            </label>
            <input className="input" placeholder="What do members get at this level?"
              value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          <div className="mb-5">
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
              PERKS (one per line)
            </label>
            <textarea className="input resize-none" rows={4}
              placeholder={`Exclusive content\nEarly access to beats\nPersonal shoutout\nMonthly exclusive track`}
              value={perksInput} onChange={e => setPerksInput(e.target.value)} />
          </div>

          {error && <p className="text-sm mb-3" style={{ color: 'var(--red)' }}>{error}</p>}

          <div className="flex gap-2 justify-end">
            <button onClick={closeForm} className="btn btn-secondary px-5">Cancel</button>
            <button onClick={saveTier} disabled={saving} className="btn btn-primary gap-2 disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {editing ? 'Save Changes' : 'Create Tier'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--sky)' }} />
        </div>
      ) : tiers.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Users size={36} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
          <p className="font-bold mb-1" style={{ color: 'var(--text)' }}>No membership tiers yet</p>
          <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
            Create tiers for fans to support you monthly
          </p>
          <button onClick={openCreate} className="btn btn-primary gap-2">
            <Plus size={15} /> Create First Tier
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tiers.map(tier => (
            <div key={tier.id} className="card p-5 flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold" style={{ color: 'var(--text)' }}>{tier.name}</h3>
                  <p className="text-2xl font-black mt-1" style={{ color: 'var(--sky)' }}>
                    R{tier.price}<span className="text-sm font-normal text-muted">/mo</span>
                  </p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(tier)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface2)]"
                    style={{ color: 'var(--text-muted)' }}>
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => deleteTier(tier.id)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface2)]"
                    style={{ color: 'var(--text-muted)' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {tier.description && (
                <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>{tier.description}</p>
              )}

              {tier.perks?.length > 0 && (
                <ul className="space-y-1.5 flex-1">
                  {tier.perks.map((perk, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text)' }}>
                      <Check size={13} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--green)' }} />
                      {perk}
                    </li>
                  ))}
                </ul>
              )}

              {tier.activeMembers !== undefined && (
                <div className="mt-4 pt-3 flex items-center gap-1.5 text-xs"
                  style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <Users size={12} />
                  {tier.activeMembers} active member{tier.activeMembers !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
