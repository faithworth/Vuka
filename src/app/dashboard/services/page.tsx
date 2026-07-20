

'use client';
import { useEffect, useState } from 'react';
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Briefcase, DollarSign, Calendar, Star, Lock, Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import VukaLoader from '@/components/brand/VukaLoader';

const CATEGORIES = [
  { value: 'mixing',       label: 'Mixing' },
  { value: 'mastering',    label: 'Mastering' },
  { value: 'features',     label: 'Features / Vocals' },
  { value: 'production',   label: 'Beat Production' },
  { value: 'ghostwriting', label: 'Ghostwriting' },
  { value: 'videography',  label: 'Videography' },
  { value: 'photography',  label: 'Photography' },
  { value: 'promotion',    label: 'Promotion' },
  { value: 'other',        label: 'Other' },
];

const emptyPkg = { name: '', price: '', deliveryDays: '7', description: '' };
const emptyForm = {
  title: '',
  description: '',
  category: 'mixing',
  requirements: '',
  packages: [{ ...emptyPkg, name: 'Basic' }, { ...emptyPkg, name: 'Standard' }],
};

// Mirrors FEATURE_CAPS.marketplaceServiceListings in src/lib/plans.ts —
// duplicated here only for the UI lock display; the real enforcement is
// server-side in /api/marketplace/services (checkFeatureCap).
const FREE_LISTING_CAP = 5;

export default function ArtistServicesPage() {
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm, packages: emptyForm.packages.map(p => ({ ...p })) });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Plan state — used to show a real lock instead of a silent 403 after
  // the artist has already filled out the whole form.
  const [planSlug, setPlanSlug] = useState<string>('free');
  const [planChecked, setPlanChecked] = useState(false);

  useEffect(() => {
    fetch('/api/marketplace/services')
      .then(r => r.ok ? r.json() : { services: [] })
      .then(d => { setServices(d.services || []); setLoading(false); })
      .catch(() => setLoading(false));

    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(me => { if (me?.artist?.planSlug) setPlanSlug(me.artist.planSlug); setPlanChecked(true); })
      .catch(() => setPlanChecked(true));
  }, []);

  const isFreePlan = planChecked && planSlug === 'free';
  const activeCount = services.filter(s => s.isActive).length;
  const atCap = isFreePlan && activeCount >= FREE_LISTING_CAP;

  function openCreate() {
    if (atCap) return; // guarded by disabled button too, belt-and-suspenders
    setEditId(null);
    setForm({ ...emptyForm, packages: emptyForm.packages.map(p => ({ ...p })) });
    setError('');
    setShowForm(true);
  }

  function openEdit(svc: any) {
    setEditId(svc.id);
    const pkgs = Array.isArray(svc.packages) && svc.packages.length > 0
      ? svc.packages.map((p: any) => ({
          name: p.name || '',
          price: String(p.price ?? ''),
          deliveryDays: String(p.deliveryDays ?? 7),
          description: p.description || '',
        }))
      : [{ name: 'Basic', price: String(svc.price || ''), deliveryDays: String(svc.deliveryDays || 7), description: '' }];
    setForm({
      title: svc.title,
      description: svc.description || '',
      category: svc.category,
      requirements: svc.requirements || '',
      packages: pkgs,
    });
    setError('');
    setShowForm(true);
  }

  async function saveService() {
    if (!form.title.trim()) { setError('Title is required'); return; }
    const validPkgs = form.packages.filter(p => p.name.trim() && parseFloat(p.price) > 0);
    if (!validPkgs.length) { setError('Add at least one package with a name and price'); return; }

    setSaving(true); setError('');
    const url = editId ? `/api/marketplace/services` : '/api/marketplace/services';
    const payload = {
      ...(editId ? { serviceId: editId } : {}),
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      requirements: form.requirements.trim(),
      packages: validPkgs.map(p => ({
        name: p.name,
        price: parseFloat(p.price),
        deliveryDays: parseInt(p.deliveryDays) || 7,
        description: p.description,
      })),
    };

    const res = await fetch(url, {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    if (!res.ok) { setError(d.error || 'Failed to save'); setSaving(false); return; }

    if (editId) {
      setServices(prev => prev.map(s => s.id === editId ? d.service : s));
    } else {
      setServices(prev => [d.service, ...prev]);
    }
    setShowForm(false);
    setSaving(false);
  }

  async function deleteService(id: string) {
    if (!confirm('Delete this service?')) return;
    setDeleting(id);
    // PATCH isActive=false (soft delete)
    const res = await fetch('/api/marketplace/services', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: id, isActive: false }),
    });
    if (res.ok) setServices(prev => prev.filter(s => s.id !== id));
    setDeleting(null);
  }

  async function toggleActive(svc: any) {
    // Reactivating counts against the cap server-side — surface that here
    // too instead of letting the request silently 403.
    if (!svc.isActive && atCap) {
      setError(`You've reached the Free plan limit of ${FREE_LISTING_CAP} active listings. Upgrade to Pro for unlimited listings.`);
      return;
    }
    const res = await fetch('/api/marketplace/services', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: svc.id, isActive: !svc.isActive }),
    });
    if (res.ok) {
      const d = await res.json();
      setServices(prev => prev.map(s => s.id === svc.id ? d.service : s));
    } else {
      const d = await res.json().catch(() => ({}));
      if (d.error) setError(d.error);
    }
  }

  function updatePkg(i: number, key: string, val: string) {
    setForm(f => ({
      ...f,
      packages: f.packages.map((p, idx) => idx === i ? { ...p, [key]: val } : p),
    }));
  }

  return (
    <div className="p-6 md:p-10">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
            My Services
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Offer mixing, features, production and more — fans and artists can hire you directly.
          </p>
        </div>
        {atCap ? (
          <Link href="/pricing"
            className="btn btn-primary gap-2"
            style={{ background: 'var(--gold)', color: '#0a0a0a' }}>
            <Lock size={14} /> Upgrade to add more
          </Link>
        ) : (
          <button onClick={openCreate} className="btn btn-primary gap-2">
            <Plus size={16} /> Add Service
          </button>
        )}
      </div>

      {/* Plan usage indicator — only shown on Free, where the cap is real */}
      {isFreePlan && (
        <div className="mb-6 flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm"
          style={{
            background: atCap ? 'rgba(232,200,124,0.08)' : 'var(--surface)',
            border: `1px solid ${atCap ? 'rgba(232,200,124,0.3)' : 'var(--border)'}`,
          }}>
          <span style={{ color: atCap ? 'var(--gold)' : 'var(--text-muted)' }}>
            {activeCount} of {FREE_LISTING_CAP} active listings used (Free plan)
          </span>
          <Link href="/pricing" className="font-semibold flex items-center gap-1" style={{ color: 'var(--gold)' }}>
            <Sparkles size={12} /> Go Pro for unlimited
          </Link>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <VukaLoader size={24} />
        </div>
      ) : services.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Briefcase size={36} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
          <p className="font-bold mb-1" style={{ color: 'var(--text)' }}>No services yet</p>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            List your skills and let other artists hire you.
          </p>
          <button onClick={openCreate} className="btn btn-primary">
            <Plus size={15} /> List a Service
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {services.map(svc => {
            const cat = CATEGORIES.find(c => c.value === svc.category);
            const basePrice = svc.price ?? (Array.isArray(svc.packages) ? Math.min(...svc.packages.map((p: any) => p.price)) : 0);
            return (
              <div key={svc.id} className="p-5 rounded-2xl"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', opacity: svc.isActive ? 1 : 0.6 }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-black" style={{ color: 'var(--text)' }}>{svc.title}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: 'rgba(56,182,232,0.1)', color: 'var(--sky)' }}>
                        {cat?.label || svc.category}
                      </span>
                      {!svc.isActive && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: 'rgba(150,150,150,0.1)', color: 'var(--text-muted)' }}>
                          Hidden
                        </span>
                      )}
                    </div>
                    {svc.description && (
                      <p className="text-sm mb-3 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{svc.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm flex-wrap">
                      <span className="flex items-center gap-1.5 font-bold" style={{ color: 'var(--green)' }}>
                        <DollarSign size={13} /> From R{Number(basePrice).toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                        <Calendar size={13} /> {svc.deliveryDays}d delivery
                      </span>
                      {svc._count?.orders != null && (
                        <span className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                          <Star size={13} /> {svc._count.orders} order{svc._count.orders !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => toggleActive(svc)} title={svc.isActive ? 'Hide' : 'Show'}
                      className="p-2 rounded-lg" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                      {svc.isActive ? <Eye size={15} /> : <EyeOff size={15} />}
                    </button>
                    <button onClick={() => openEdit(svc)}
                      className="p-2 rounded-lg" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => deleteService(svc.id)} disabled={deleting === svc.id}
                      className="p-2 rounded-lg" style={{ background: 'rgba(204,26,26,0.08)', color: 'var(--red)' }}>
                      {deleting === svc.id ? <VukaLoader size={15} /> : <Trash2 size={15} />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && !showForm && (
        <p className="mt-4 text-sm px-4 py-3 rounded-xl" style={{ background: 'rgba(204,26,26,0.1)', color: 'var(--red)' }}>
          {error}
        </p>
      )}

      {/* Service Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => { setShowForm(false); setEditId(null); }}>
          <div className="w-full max-w-lg rounded-2xl p-6 space-y-4 my-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black" style={{ color: 'var(--text)' }}>
              {editId ? 'Edit Service' : 'List a New Service'}
            </h3>

            <input className="input w-full" placeholder="Service title *"
              value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />

            <textarea className="input w-full resize-none" rows={3}
              placeholder="Describe what you offer, who it's for, what's included…"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />

            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-muted)' }}>Category</label>
              <select className="input w-full" value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--text-muted)' }}>
                Packages (at least one required)
              </label>
              <div className="space-y-3">
                {form.packages.map((pkg, i) => (
                  <div key={i} className="p-3 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      <input className="input text-sm" placeholder="Package name *"
                        value={pkg.name} onChange={e => updatePkg(i, 'name', e.target.value)} />
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>R</span>
                        <input className="input w-full pl-7 text-sm" type="number" min="0" placeholder="Price *"
                          value={pkg.price} onChange={e => updatePkg(i, 'price', e.target.value)} />
                      </div>
                      <input className="input text-sm" type="number" min="1" placeholder="Days"
                        value={pkg.deliveryDays} onChange={e => updatePkg(i, 'deliveryDays', e.target.value)} />
                    </div>
                    <input className="input w-full text-sm" placeholder="Package description (optional)"
                      value={pkg.description} onChange={e => updatePkg(i, 'description', e.target.value)} />
                  </div>
                ))}
              </div>
              {form.packages.length < 3 && (
                <button onClick={() => setForm(f => ({ ...f, packages: [...f.packages, { ...emptyPkg }] }))}
                  className="w-full mt-2 py-2 rounded-lg border-dashed border text-xs font-semibold"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  + Add Package
                </button>
              )}
            </div>

            <textarea className="input w-full resize-none" rows={2}
              placeholder="Requirements from the buyer (optional) — e.g. 'Send stems in .zip format'"
              value={form.requirements}
              onChange={e => setForm(f => ({ ...f, requirements: e.target.value }))} />

            {error && (
              <p className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(204,26,26,0.1)', color: 'var(--red)' }}>
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)} className="btn btn-secondary flex-1">Cancel</button>
              <button onClick={saveService} disabled={saving} className="btn btn-primary flex-1">
                {saving ? <VukaLoader size={15} /> : null}
                {saving ? 'Saving…' : editId ? 'Update Service' : 'List Service'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
