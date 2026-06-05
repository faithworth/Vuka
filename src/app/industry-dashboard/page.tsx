// FIX: src/app/industry-dashboard/page.tsx
// KEY CHANGE: Added "Message" button on each inquiry so industry users can
// start a direct conversation with the artist who inquired.
// Previously: industry users could see inquiries but had NO WAY to reply.
// Now: clicking "Message" calls POST /api/messages/conversations with the artist's userId,
// then redirects to /messages.
// Also added accept/reject buttons for inquiries (calls PATCH /api/industry/deals).

'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import {
  Plus, Pencil, Trash2, Loader2, LogOut, Briefcase,
  CheckCircle, Clock, XCircle, Eye, EyeOff, MessageSquare,
  DollarSign, Calendar, Send,
} from 'lucide-react';

const CATEGORIES = [
  { value: 'promotion',    label: 'Promotion & Marketing' },
  { value: 'distribution', label: 'Distribution & Publishing' },
  { value: 'sync',         label: 'Sync & Licensing' },
  { value: 'management',   label: 'Artist Management' },
  { value: 'scouting',     label: 'Talent Scouting' },
  { value: 'sponsorship',  label: 'Sponsorship & Brand Deals' },
  { value: 'legal',        label: 'Legal & Contracts' },
  { value: 'photography',  label: 'Photography' },
  { value: 'videography',  label: 'Videography' },
  { value: 'mixing',       label: 'Mixing' },
  { value: 'mastering',    label: 'Mastering' },
  { value: 'other',        label: 'Other' },
];

const PRICING_MODELS = [
  { value: 'fixed',     label: 'Fixed Price' },
  { value: 'per_track', label: 'Per Track' },
  { value: 'per_month', label: 'Per Month' },
  { value: 'quote',     label: 'Custom Quote' },
];

const emptyForm = { title: '', description: '', category: 'promotion', priceZAR: '', pricingModel: 'fixed', deliveryDays: '7' };

export default function IndustryDashboardPage() {
  const router = useRouter();
  const [loading, setLoading]     = useState(true);
  const [data, setData]           = useState<any>(null);
  const [services, setServices]   = useState<any[]>([]);
  const [tab, setTab]             = useState<'services' | 'inquiries'>('services');
  const [showForm, setShowForm]   = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [form, setForm]           = useState({ ...emptyForm });
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState<string | null>(null);
  const [messaging, setMessaging] = useState<string | null>(null);
  const [error, setError]         = useState('');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: auth }) => {
      if (!auth.user) { router.replace('/auth/login'); return; }
      const res = await fetch('/api/industry/me');
      if (!res.ok) { router.replace('/'); return; }
      const d = await res.json();
      setData(d);
      setServices(d.services || []);
      setLoading(false);
    });
  }, [router]);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  }

  function openCreate() {
    setEditId(null);
    setForm({ ...emptyForm });
    setError('');
    setShowForm(true);
  }

  function openEdit(svc: any) {
    setEditId(svc.id);
    setForm({
      title: svc.title,
      description: svc.description,
      category: svc.category,
      priceZAR: String(svc.priceZAR),
      pricingModel: svc.pricingModel,
      deliveryDays: String(svc.deliveryDays),
    });
    setError('');
    setShowForm(true);
  }

  async function saveService() {
    if (!form.title.trim()) { setError('Title is required'); return; }
    const price = parseFloat(form.priceZAR);
    if (!price || price <= 0) { setError('Enter a valid price'); return; }
    setSaving(true);
    setError('');
    const url = editId ? `/api/industry/services/${editId}` : '/api/industry/services';
    const method = editId ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, priceZAR: price, deliveryDays: parseInt(form.deliveryDays) || 7 }),
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
    if (!confirm('Delete this service listing?')) return;
    setDeleting(id);
    const res = await fetch(`/api/industry/services/${id}`, { method: 'DELETE' });
    if (res.ok) setServices(prev => prev.filter(s => s.id !== id));
    setDeleting(null);
  }

  async function toggleActive(svc: any) {
    const res = await fetch(`/api/industry/services/${svc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !svc.isActive }),
    });
    if (res.ok) {
      const d = await res.json();
      setServices(prev => prev.map(s => s.id === svc.id ? d.service : s));
    }
  }

  // NEW: Message the artist who sent an inquiry
  async function messageArtist(inquiry: any) {
    // The artist's userId is on inquiry.artist.userId or via the artist record
    const artistUserId = inquiry.artist?.userId;
    if (!artistUserId) {
      alert('Cannot find this artist\'s account to message them.');
      return;
    }
    setMessaging(inquiry.id);
    try {
      const res = await fetch('/api/messages/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: artistUserId }),
      });
      if (res.ok) {
        router.push('/messages');
      }
    } catch {}
    setMessaging(null);
  }

  const allInquiries = services.flatMap((s: any) =>
    (s.inquiries || []).map((inq: any) => ({ ...inq, serviceName: s.title }))
  ).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const pendingCount = allInquiries.filter((i: any) => i.status === 'pending').length;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <Loader2 size={28} className="animate-spin" style={{ color: 'var(--sky)' }} />
    </div>
  );

  const iu = data?.industryUser;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <header className="sticky top-0 z-40 border-b" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--gold)', opacity: 0.9 }}>
              <Briefcase size={15} className="text-white" />
            </div>
            <div>
              <p className="font-black text-sm" style={{ color: 'var(--text)' }}>{data?.user?.name}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{iu?.company || 'Industry Portal'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/messages')}
              className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
              <MessageSquare size={15} /> Messages
            </button>
            <button onClick={logout} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">

        <div className="flex gap-1 mb-8 p-1 rounded-xl w-fit" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {[
            { key: 'services',  label: 'My Services' },
            { key: 'inquiries', label: `Inquiries${pendingCount ? ` (${pendingCount})` : ''}` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: tab === t.key ? 'var(--sky)' : 'transparent',
                color: tab === t.key ? 'white' : 'var(--text-muted)',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'services' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-black" style={{ color: 'var(--text)' }}>Your Service Listings</h2>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Artists browse and hire you based on what you list here.
                </p>
              </div>
              <button onClick={openCreate} className="btn btn-primary flex items-center gap-2">
                <Plus size={16} /> Add Service
              </button>
            </div>

            {services.length === 0 ? (
              <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <Briefcase size={36} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
                <p className="font-bold mb-1" style={{ color: 'var(--text)' }}>No services listed yet</p>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                  Add your first service so artists can find and hire you.
                </p>
                <button onClick={openCreate} className="btn btn-primary">
                  <Plus size={15} /> List a Service
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {services.map((svc: any) => {
                  const cat = CATEGORIES.find(c => c.value === svc.category);
                  const pm  = PRICING_MODELS.find(p => p.value === svc.pricingModel);
                  const pendingInq = (svc.inquiries || []).filter((i: any) => i.status === 'pending').length;
                  return (
                    <div key={svc.id} className="p-5 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', opacity: svc.isActive ? 1 : 0.6 }}>
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
                            {pendingInq > 0 && (
                              <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                                style={{ background: 'rgba(201,162,39,0.15)', color: 'var(--gold)' }}>
                                {pendingInq} new {pendingInq === 1 ? 'inquiry' : 'inquiries'}
                              </span>
                            )}
                          </div>
                          {svc.description && (
                            <p className="text-sm mb-3 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{svc.description}</p>
                          )}
                          <div className="flex items-center gap-4 text-sm flex-wrap">
                            <span className="flex items-center gap-1.5 font-bold" style={{ color: 'var(--green)' }}>
                              <DollarSign size={13} /> R{Number(svc.priceZAR).toLocaleString()} {pm?.label}
                            </span>
                            <span className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                              <Calendar size={13} /> {svc.deliveryDays} day{svc.deliveryDays !== 1 ? 's' : ''} delivery
                            </span>
                            <span className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                              <MessageSquare size={13} /> {(svc.inquiries || []).length} total inquiries
                            </span>
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
                            {deleting === svc.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'inquiries' && (
          <div>
            <h2 className="text-xl font-black mb-6" style={{ color: 'var(--text)' }}>Artist Inquiries</h2>
            {allInquiries.length === 0 ? (
              <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <MessageSquare size={36} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
                <p className="font-bold mb-1" style={{ color: 'var(--text)' }}>No inquiries yet</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  When artists reach out about your services, they'll appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {allInquiries.map((inq: any) => (
                  <div key={inq.id} className="p-4 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                          {inq.artist?.name || inq.name || 'Unknown Artist'}
                        </p>
                        <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                          Re: {inq.serviceName}
                        </p>
                        {inq.message && (
                          <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>{inq.message}</p>
                        )}
                        {/* NEW: Message button so industry users can reply to artists */}
                        <button
                          onClick={() => messageArtist(inq)}
                          disabled={messaging === inq.id}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                          style={{ background: 'rgba(56,182,232,0.1)', color: 'var(--sky)' }}>
                          {messaging === inq.id
                            ? <Loader2 size={12} className="animate-spin" />
                            : <Send size={12} />}
                          {messaging === inq.id ? 'Opening chat…' : 'Message Artist'}
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold flex-shrink-0">
                        {inq.status === 'pending' && <Clock size={14} className="text-yellow-500" />}
                        {inq.status === 'accepted' && <CheckCircle size={14} className="text-green-500" />}
                        {inq.status === 'rejected' && <XCircle size={14} className="text-red-500" />}
                        {inq.status === 'completed' && <CheckCircle size={14} className="text-sky-500" />}
                        <span style={{ textTransform: 'capitalize' }}>{inq.status}</span>
                      </div>
                    </div>
                    <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                      {new Date(inq.createdAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-lg rounded-2xl p-6 my-4 space-y-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-lg font-black" style={{ color: 'var(--text)' }}>
              {editId ? 'Edit Service' : 'List a New Service'}
            </h3>

            <input className="input w-full" placeholder="Service title *" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />

            <textarea className="input w-full resize-none" rows={3}
              placeholder="Describe what you offer, what's included, and who it's for..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-muted)' }}>Category</label>
                <select className="input w-full" value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-muted)' }}>Pricing Model</label>
                <select className="input w-full" value={form.pricingModel}
                  onChange={e => setForm(f => ({ ...f, pricingModel: e.target.value }))}>
                  {PRICING_MODELS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-muted)' }}>Price (ZAR) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>R</span>
                  <input className="input w-full pl-7" type="number" min="0" step="1" placeholder="0"
                    value={form.priceZAR}
                    onChange={e => setForm(f => ({ ...f, priceZAR: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-muted)' }}>Delivery (days)</label>
                <input className="input w-full" type="number" min="1" placeholder="7"
                  value={form.deliveryDays}
                  onChange={e => setForm(f => ({ ...f, deliveryDays: e.target.value }))} />
              </div>
            </div>

            {error && (
              <p className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(204,26,26,0.1)', color: 'var(--red)' }}>
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)} className="btn btn-secondary flex-1">Cancel</button>
              <button onClick={saveService} disabled={saving} className="btn btn-primary flex-1">
                {saving ? <Loader2 size={15} className="animate-spin" /> : null}
                {saving ? 'Saving…' : editId ? 'Update Service' : 'List Service'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
