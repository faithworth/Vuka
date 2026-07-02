// src/app/industry-dashboard/page.tsx

'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import {
  Plus, Pencil, Trash2, LogOut, Briefcase, CheckCircle, Clock, XCircle, Eye, EyeOff, MessageSquare, DollarSign, Calendar, Send, Settings, TrendingUp, Building2, Globe, User, Mail, Shield, BadgeCheck, ChevronRight, Handshake, AlertCircle, RefreshCw, Users,
} from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

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

const DEAL_TYPES = [
  { value: 'licensing',    label: 'Licensing' },
  { value: 'publishing',   label: 'Publishing' },
  { value: 'management',   label: 'Management' },
  { value: 'distribution', label: 'Distribution' },
  { value: 'sync',         label: 'Sync' },
  { value: 'sponsorship',  label: 'Sponsorship' },
  { value: 'other',        label: 'Other' },
];

const emptyService = { title: '', description: '', category: 'promotion', priceZAR: '', pricingModel: 'fixed', deliveryDays: '7' };
const emptyDeal = { title: '', description: '', artistSlug: '', dealType: 'licensing', offerAmount: '' };

type Tab = 'services' | 'inquiries' | 'deals' | 'earnings' | 'settings';

export default function IndustryDashboardPage() {
  const router = useRouter();
  const [loading, setLoading]         = useState(true);
  const [data, setData]               = useState<any>(null);
  const [services, setServices]       = useState<any[]>([]);
  const [tab, setTab]                 = useState<Tab>('services');

  // Service form
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [editId, setEditId]                   = useState<string | null>(null);
  const [serviceForm, setServiceForm]         = useState({ ...emptyService });
  const [savingService, setSavingService]     = useState(false);
  const [deletingId, setDeletingId]           = useState<string | null>(null);
  const [serviceError, setServiceError]       = useState('');

  // Deal form
  const [showDealForm, setShowDealForm] = useState(false);
  const [dealForm, setDealForm]         = useState({ ...emptyDeal });
  const [savingDeal, setSavingDeal]     = useState(false);
  const [dealError, setDealError]       = useState('');

  // Settings form
  const [settingsForm, setSettingsForm]   = useState({ name: '', companyName: '', role: '', website: '' });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg]     = useState('');
  const [settingsError, setSettingsError] = useState('');

  // Messaging
  const [messaging, setMessaging] = useState<string | null>(null);

  // Inquiry actions
  const [updatingInquiry, setUpdatingInquiry] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: auth }) => {
      if (!auth.user) { router.replace('/auth/login'); return; }
      const res = await fetch('/api/industry/me');
      if (!res.ok) { router.replace('/'); return; }
      const d = await res.json();
      setData(d);
      setServices(d.services || []);
      // Pre-fill settings form
      setSettingsForm({
        name:        d.user?.name || '',
        companyName: d.industryUser?.companyName || '',
        role:        d.industryUser?.role || '',
        website:     d.industryUser?.website || '',
      });
      setLoading(false);
    });
  }, [router]);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  }

  // ─── SERVICE CRUD ────────────────────────────────────────────
  function openCreate() {
    setEditId(null);
    setServiceForm({ ...emptyService });
    setServiceError('');
    setShowServiceForm(true);
  }

  function openEdit(svc: any) {
    setEditId(svc.id);
    setServiceForm({
      title: svc.title,
      description: svc.description,
      category: svc.category,
      priceZAR: String(svc.priceZAR),
      pricingModel: svc.pricingModel,
      deliveryDays: String(svc.deliveryDays),
    });
    setServiceError('');
    setShowServiceForm(true);
  }

  async function saveService() {
    if (!serviceForm.title.trim()) { setServiceError('Title is required'); return; }
    const price = parseFloat(serviceForm.priceZAR);
    if (!price || price <= 0) { setServiceError('Enter a valid price'); return; }
    setSavingService(true);
    setServiceError('');
    const url    = editId ? `/api/industry/services/${editId}` : '/api/industry/services';
    const method = editId ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...serviceForm, priceZAR: price, deliveryDays: parseInt(serviceForm.deliveryDays) || 7 }),
    });
    const d = await res.json();
    if (!res.ok) { setServiceError(d.error || 'Failed to save'); setSavingService(false); return; }
    if (editId) {
      setServices(prev => prev.map(s => s.id === editId ? d.service : s));
    } else {
      setServices(prev => [d.service, ...prev]);
    }
    setShowServiceForm(false);
    setSavingService(false);
  }

  async function deleteService(id: string) {
    if (!confirm('Delete this service listing?')) return;
    setDeletingId(id);
    const res = await fetch(`/api/industry/services/${id}`, { method: 'DELETE' });
    if (res.ok) setServices(prev => prev.filter(s => s.id !== id));
    setDeletingId(null);
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

  // ─── DEAL CRUD ───────────────────────────────────────────────
  async function saveDeal() {
    if (!dealForm.title.trim()) { setDealError('Title is required'); return; }
    setSavingDeal(true);
    setDealError('');
    const res = await fetch('/api/industry/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...dealForm,
        offerAmount: parseFloat(dealForm.offerAmount) || 0,
      }),
    });
    const d = await res.json();
    if (!res.ok) { setDealError(d.error || 'Failed to save'); setSavingDeal(false); return; }
    setData((prev: any) => ({ ...prev, deals: [d.deal, ...(prev.deals || [])] }));
    setShowDealForm(false);
    setDealForm({ ...emptyDeal });
    setSavingDeal(false);
  }

  // ─── INQUIRY ACTIONS ─────────────────────────────────────────
  async function updateInquiry(inquiryId: string, status: 'accepted' | 'rejected') {
    setUpdatingInquiry(inquiryId);
    const res = await fetch(`/api/industry/inquire`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inquiryId, status }),
    });
    if (res.ok) {
      setServices(prev => prev.map(svc => ({
        ...svc,
        inquiries: (svc.inquiries || []).map((inq: any) =>
          inq.id === inquiryId ? { ...inq, status } : inq
        ),
      })));
    }
    setUpdatingInquiry(null);
  }

  async function messageArtist(inquiry: any) {
    const artistUserId = inquiry.artist?.userId;
    if (!artistUserId) { alert('Cannot find this artist\'s account.'); return; }
    setMessaging(inquiry.id);
    try {
      const res = await fetch('/api/messages/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: artistUserId }),
      });
      if (res.ok) router.push('/messages');
    } catch {}
    setMessaging(null);
  }

  // ─── SETTINGS ────────────────────────────────────────────────
  async function saveSettings() {
    setSavingSettings(true);
    setSettingsMsg('');
    setSettingsError('');
    const res = await fetch('/api/industry/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsForm),
    });
    const d = await res.json();
    if (!res.ok) { setSettingsError(d.error || 'Failed to save'); setSavingSettings(false); return; }
    setData((prev: any) => ({
      ...prev,
      user:         { ...prev.user, name: settingsForm.name },
      industryUser: { ...prev.industryUser, ...d.profile },
    }));
    setSettingsMsg('Profile updated successfully.');
    setSavingSettings(false);
  }

  // ─── DERIVED ─────────────────────────────────────────────────
  const allInquiries = services.flatMap((s: any) =>
    (s.inquiries || []).map((inq: any) => ({ ...inq, serviceName: s.title }))
  ).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const pendingCount = allInquiries.filter((i: any) => i.status === 'pending').length;

  const referrals = data?.referrals || [];
  const deals     = data?.deals || [];
  const totalCommission = referrals.reduce((sum: number, r: any) => sum + (r.commissionEarned || 0), 0);
  const paidCommission  = referrals.filter((r: any) => r.status === 'paid').reduce((sum: number, r: any) => sum + (r.commissionEarned || 0), 0);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <VukaLoader size={28} />
    </div>
  );

  const iu = data?.industryUser;

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'services',  label: 'My Services' },
    { key: 'inquiries', label: 'Inquiries', badge: pendingCount || undefined },
    { key: 'deals',     label: 'Deals' },
    { key: 'earnings',  label: 'Earnings' },
    { key: 'settings',  label: 'Settings' },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>

      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm"
              style={{ background: 'rgba(201,162,39,0.15)', color: 'var(--gold)' }}>
              {data?.user?.name?.[0]?.toUpperCase() || 'I'}
            </div>
            <div>
              <p className="font-black text-sm" style={{ color: 'var(--text)' }}>{data?.user?.name}</p>
              <div className="flex items-center gap-1.5">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {iu?.companyName || 'Industry Portal'}
                  {iu?.role ? ` · ${iu.role}` : ''}
                </p>
                {iu?.verified && (
                  <BadgeCheck size={12} style={{ color: 'var(--sky)' }} />
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push('/browse-artists')}
              className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(201,162,39,0.12)', color: 'var(--gold)' }}>
              <Users size={14} /> Find Artists
            </button>
            <button onClick={() => router.push('/messages')}
              className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
              <MessageSquare size={14} /> Messages
            </button>
            <button onClick={() => setTab('settings')}
              className="p-2 rounded-lg"
              style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
              <Settings size={14} />
            </button>
            <button onClick={logout} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg"
              style={{ color: 'var(--text-muted)' }}>
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* STATS ROW */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Active Listings', value: services.filter(s => s.isActive).length, color: 'var(--sky)' },
            { label: 'Total Inquiries', value: allInquiries.length, color: 'var(--gold)' },
            { label: 'Pending', value: pendingCount, color: 'var(--green)' },
            { label: 'Referral Earned', value: `R${totalCommission.toLocaleString()}`, color: 'var(--text)' },
          ].map(stat => (
            <div key={stat.label} className="p-4 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-2xl font-black" style={{ color: stat.color }}>{stat.value}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div className="flex gap-1 mb-8 p-1 rounded-xl overflow-x-auto w-fit" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap"
              style={{
                background: tab === t.key ? 'var(--sky)' : 'transparent',
                color: tab === t.key ? 'white' : 'var(--text-muted)',
              }}>
              {t.label}
              {t.badge ? (
                <span className="text-xs px-1.5 py-0.5 rounded-full font-bold"
                  style={{ background: tab === t.key ? 'rgba(255,255,255,0.25)' : 'rgba(201,162,39,0.2)', color: tab === t.key ? 'white' : 'var(--gold)' }}>
                  {t.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* ── TAB: SERVICES ── */}
        {tab === 'services' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-black" style={{ color: 'var(--text)' }}>Your Service Listings</h2>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Artists browse and hire you based on what you list here. Visible at <a href="/services" className="underline">/services</a>.
                </p>
              </div>
              <button onClick={openCreate} className="btn btn-primary flex items-center gap-2">
                <Plus size={15} /> Add Service
              </button>
            </div>

            {services.length === 0 ? (
              <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <Briefcase size={36} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
                <p className="font-bold mb-1" style={{ color: 'var(--text)' }}>No services listed yet</p>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                  Add your first service so artists can find and hire you on <strong>/services</strong>.
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
                          <button onClick={() => toggleActive(svc)} title={svc.isActive ? 'Hide listing' : 'Show listing'}
                            className="p-2 rounded-lg" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                            {svc.isActive ? <Eye size={15} /> : <EyeOff size={15} />}
                          </button>
                          <button onClick={() => openEdit(svc)}
                            className="p-2 rounded-lg" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => deleteService(svc.id)} disabled={deletingId === svc.id}
                            className="p-2 rounded-lg" style={{ background: 'rgba(204,26,26,0.08)', color: 'var(--red)' }}>
                            {deletingId === svc.id ? <VukaLoader size={15} /> : <Trash2 size={15} />}
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

        {/* ── TAB: INQUIRIES ── */}
        {tab === 'inquiries' && (
          <div>
            <h2 className="text-xl font-black mb-2" style={{ color: 'var(--text)' }}>Artist Inquiries</h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
              Artists who've reached out about your services. Accept or reject, then message them to discuss details.
            </p>
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
                  <div key={inq.id} className="p-5 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>
                            {inq.artist?.name || inq.name || 'Unknown Artist'}
                          </p>
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"
                            style={{
                              background: inq.status === 'pending'  ? 'rgba(201,162,39,0.1)'  :
                                          inq.status === 'accepted' ? 'rgba(34,197,94,0.1)'   :
                                          inq.status === 'rejected' ? 'rgba(204,26,26,0.1)'   : 'rgba(56,182,232,0.1)',
                              color:      inq.status === 'pending'  ? 'var(--gold)'   :
                                          inq.status === 'accepted' ? 'var(--green)'  :
                                          inq.status === 'rejected' ? 'var(--red)'    : 'var(--sky)',
                            }}>
                            {inq.status === 'pending'  && <Clock size={11} />}
                            {inq.status === 'accepted' && <CheckCircle size={11} />}
                            {inq.status === 'rejected' && <XCircle size={11} />}
                            {inq.status === 'completed'&& <CheckCircle size={11} />}
                            <span style={{ textTransform: 'capitalize' }}>{inq.status}</span>
                          </span>
                        </div>
                        <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                          Re: <strong>{inq.serviceName}</strong>
                          {' · '}{new Date(inq.createdAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                        {inq.message && (
                          <p className="text-sm mb-4 p-3 rounded-xl" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                            {inq.message}
                          </p>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          {inq.status === 'pending' && (
                            <>
                              <button onClick={() => updateInquiry(inq.id, 'accepted')}
                                disabled={updatingInquiry === inq.id}
                                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
                                style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--green)' }}>
                                {updatingInquiry === inq.id ? <VukaLoader size={11} /> : <CheckCircle size={11} />}
                                Accept
                              </button>
                              <button onClick={() => updateInquiry(inq.id, 'rejected')}
                                disabled={updatingInquiry === inq.id}
                                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
                                style={{ background: 'rgba(204,26,26,0.08)', color: 'var(--red)' }}>
                                {updatingInquiry === inq.id ? <VukaLoader size={11} /> : <XCircle size={11} />}
                                Decline
                              </button>
                            </>
                          )}
                          <button onClick={() => messageArtist(inq)} disabled={messaging === inq.id}
                            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
                            style={{ background: 'rgba(56,182,232,0.1)', color: 'var(--sky)' }}>
                            {messaging === inq.id ? <VukaLoader size={11} /> : <Send size={11} />}
                            {messaging === inq.id ? 'Opening chat…' : 'Message Artist'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: DEALS ── */}
        {tab === 'deals' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-black" style={{ color: 'var(--text)' }}>Deals</h2>
              <button onClick={() => { setDealForm({ ...emptyDeal }); setDealError(''); setShowDealForm(true); }}
                className="btn btn-primary flex items-center gap-2">
                <Plus size={15} /> New Deal
              </button>
            </div>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
              Track licensing deals, offers, and agreements with artists.
            </p>

            {deals.length === 0 ? (
              <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <Handshake size={36} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
                <p className="font-bold mb-1" style={{ color: 'var(--text)' }}>No deals yet</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Track your licensing, publishing, and other deals here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {deals.map((deal: any) => {
                  const dt = DEAL_TYPES.find(d => d.value === deal.dealType);
                  return (
                    <div key={deal.id} className="p-5 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-bold" style={{ color: 'var(--text)' }}>{deal.title}</p>
                            <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: 'rgba(201,162,39,0.1)', color: 'var(--gold)' }}>
                              {dt?.label || deal.dealType}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                              style={{
                                background: deal.status === 'open' ? 'rgba(34,197,94,0.1)' : 'rgba(150,150,150,0.1)',
                                color:      deal.status === 'open' ? 'var(--green)' : 'var(--text-muted)',
                              }}>
                              {deal.status}
                            </span>
                          </div>
                          {deal.artistSlug && (
                            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Artist: @{deal.artistSlug}</p>
                          )}
                          {deal.description && (
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{deal.description}</p>
                          )}
                        </div>
                        {deal.offerAmount > 0 && (
                          <p className="font-black text-lg flex-shrink-0" style={{ color: 'var(--green)' }}>
                            R{Number(deal.offerAmount).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: EARNINGS ── */}
        {tab === 'earnings' && (
          <div>
            <h2 className="text-xl font-black mb-2" style={{ color: 'var(--text)' }}>Earnings & Payouts</h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
              Track payments from your service orders. Vuka Music deducts a 10% platform fee per order — you keep 90%.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              {[
                { label: 'Total Referrals', value: referrals.length, color: 'var(--sky)' },
                { label: 'Total Commission (referrals)', value: `R${totalCommission.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'var(--gold)' },
                { label: 'Paid Out', value: `R${paidCommission.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'var(--green)' },
              ].map(stat => (
                <div key={stat.label} className="p-5 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <p className="text-2xl font-black" style={{ color: stat.color }}>{stat.value}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-xl mb-6 flex items-start gap-3" style={{ background: 'rgba(201,162,39,0.06)', border: '1px solid rgba(201,162,39,0.2)' }}>
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--gold)' }} />
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                <p className="font-bold mb-1" style={{ color: 'var(--text)' }}>How fees work</p>
                <p>
                  When an artist pays for your service, <strong style={{ color: 'var(--gold)' }}>Vuka Music deducts 10%</strong> as a platform fee.
                  You receive <strong style={{ color: 'var(--green)' }}>90% of the order amount</strong> in your next payout.
                  Example: artist pays R1,000 → Vuka Music fee R100 → you receive R900.
                </p>
              </div>
            </div>

            {referrals.length === 0 ? (
              <div className="text-center py-12 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <TrendingUp size={36} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
                <p className="font-bold mb-1" style={{ color: 'var(--text)' }}>No referral earnings yet</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Refer artists to Vuka Music to earn commission on their sales.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {referrals.map((ref: any) => (
                  <div key={ref.id} className="p-4 rounded-xl flex items-center justify-between gap-4"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                        {ref.artistName || ref.artistSlug || 'Artist'}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {ref.saleType} · {new Date(ref.createdAt).toLocaleDateString('en-ZA')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-black" style={{ color: 'var(--green)' }}>
                        +R{Number(ref.commissionEarned).toFixed(2)}
                      </p>
                      <p className="text-xs" style={{ color: ref.status === 'paid' ? 'var(--green)' : 'var(--text-muted)' }}>
                        {ref.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: SETTINGS ── */}
        {tab === 'settings' && (
          <div className="max-w-xl">
            <h2 className="text-xl font-black mb-2" style={{ color: 'var(--text)' }}>Profile Settings</h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
              This information appears on your public service listings so artists know who they're hiring.
            </p>

            <div className="space-y-4 p-6 rounded-2xl mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

              <div>
                <label className="text-xs font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <User size={12} /> Display Name
                </label>
                <input className="input w-full" placeholder="Your name"
                  value={settingsForm.name}
                  onChange={e => setSettingsForm(f => ({ ...f, name: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <Building2 size={12} /> Company / Label Name
                </label>
                <input className="input w-full" placeholder="e.g. Sony Music Africa, Independent"
                  value={settingsForm.companyName}
                  onChange={e => setSettingsForm(f => ({ ...f, companyName: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <Briefcase size={12} /> Your Role / Position
                </label>
                <input className="input w-full" placeholder="e.g. A&R Manager, Music Promoter, Producer"
                  value={settingsForm.role}
                  onChange={e => setSettingsForm(f => ({ ...f, role: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <Globe size={12} /> Website (optional)
                </label>
                <input className="input w-full" placeholder="https://yoursite.com"
                  value={settingsForm.website}
                  onChange={e => setSettingsForm(f => ({ ...f, website: e.target.value }))} />
              </div>

              <div className="pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2 py-3">
                  <Mail size={13} style={{ color: 'var(--text-muted)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{data?.user?.email}</p>
                  <span className="text-xs ml-auto px-2 py-0.5 rounded-full" style={{ background: 'rgba(150,150,150,0.1)', color: 'var(--text-muted)' }}>
                    Account email
                  </span>
                </div>
                <div className="flex items-center gap-2 py-2">
                  <Shield size={13} style={{ color: 'var(--text-muted)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Verification status:</p>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
                    style={{
                      background: iu?.verified ? 'rgba(34,197,94,0.1)' : 'rgba(201,162,39,0.1)',
                      color:      iu?.verified ? 'var(--green)' : 'var(--gold)',
                    }}>
                    {iu?.verified ? <><BadgeCheck size={11} /> Verified</> : <><Clock size={11} /> Pending</>}
                  </span>
                </div>
              </div>

              {settingsError && (
                <p className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(204,26,26,0.1)', color: 'var(--red)' }}>
                  {settingsError}
                </p>
              )}
              {settingsMsg && (
                <p className="text-sm px-3 py-2 rounded-lg flex items-center gap-2" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--green)' }}>
                  <CheckCircle size={14} /> {settingsMsg}
                </p>
              )}

              <button onClick={saveSettings} disabled={savingSettings} className="btn btn-primary w-full">
                {savingSettings ? <><VukaLoader size={14} /> Saving…</> : 'Save Profile'}
              </button>
            </div>

            <div className="p-4 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Need help or want verification?</p>
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                Verified industry professionals get a badge on their listings. Contact support to get verified.
              </p>
              <a href="mailto:support@vukamusic.com"
                className="text-xs font-semibold flex items-center gap-1.5"
                style={{ color: 'var(--sky)' }}>
                Contact support <ChevronRight size={12} />
              </a>
            </div>

            {/* Account Security */}
            <div className="p-5 rounded-2xl flex items-center justify-between gap-4"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(160,232,124,0.1)' }}>
                  <Shield size={16} style={{ color: 'var(--green)' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Account Security</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    2FA, active devices &amp; password
                  </p>
                </div>
              </div>
              <a href="/settings/security"
                className="btn btn-secondary text-sm flex-shrink-0"
                style={{ textDecoration: 'none' }}>
                Manage
              </a>
            </div>
          </div>
        )}
      </main>

      {/* ── MODAL: SERVICE FORM ── */}
      {showServiceForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-lg rounded-2xl p-6 my-4 space-y-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-lg font-black" style={{ color: 'var(--text)' }}>
              {editId ? 'Edit Service' : 'List a New Service'}
            </h3>

            <input className="input w-full" placeholder="Service title *" value={serviceForm.title}
              onChange={e => setServiceForm(f => ({ ...f, title: e.target.value }))} />

            <textarea className="input w-full resize-none" rows={3}
              placeholder="Describe what you offer, what's included, and who it's for…"
              value={serviceForm.description}
              onChange={e => setServiceForm(f => ({ ...f, description: e.target.value }))} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-muted)' }}>Category</label>
                <select className="input w-full" value={serviceForm.category}
                  onChange={e => setServiceForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-muted)' }}>Pricing Model</label>
                <select className="input w-full" value={serviceForm.pricingModel}
                  onChange={e => setServiceForm(f => ({ ...f, pricingModel: e.target.value }))}>
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
                    value={serviceForm.priceZAR}
                    onChange={e => setServiceForm(f => ({ ...f, priceZAR: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-muted)' }}>Delivery (days)</label>
                <input className="input w-full" type="number" min="1" placeholder="7"
                  value={serviceForm.deliveryDays}
                  onChange={e => setServiceForm(f => ({ ...f, deliveryDays: e.target.value }))} />
              </div>
            </div>

            {serviceError && (
              <p className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(204,26,26,0.1)', color: 'var(--red)' }}>
                {serviceError}
              </p>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowServiceForm(false)} className="btn btn-secondary flex-1">Cancel</button>
              <button onClick={saveService} disabled={savingService} className="btn btn-primary flex-1">
                {savingService ? <VukaLoader size={15} /> : null}
                {savingService ? 'Saving…' : editId ? 'Update Service' : 'List Service'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: DEAL FORM ── */}
      {showDealForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-lg rounded-2xl p-6 my-4 space-y-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-lg font-black" style={{ color: 'var(--text)' }}>New Deal</h3>

            <input className="input w-full" placeholder="Deal title *" value={dealForm.title}
              onChange={e => setDealForm(f => ({ ...f, title: e.target.value }))} />

            <textarea className="input w-full resize-none" rows={3} placeholder="Description (optional)"
              value={dealForm.description}
              onChange={e => setDealForm(f => ({ ...f, description: e.target.value }))} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-muted)' }}>Deal Type</label>
                <select className="input w-full" value={dealForm.dealType}
                  onChange={e => setDealForm(f => ({ ...f, dealType: e.target.value }))}>
                  {DEAL_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-muted)' }}>Offer Amount (ZAR)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>R</span>
                  <input className="input w-full pl-7" type="number" min="0" placeholder="0"
                    value={dealForm.offerAmount}
                    onChange={e => setDealForm(f => ({ ...f, offerAmount: e.target.value }))} />
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-muted)' }}>Artist Slug (optional)</label>
              <input className="input w-full" placeholder="artist-slug"
                value={dealForm.artistSlug}
                onChange={e => setDealForm(f => ({ ...f, artistSlug: e.target.value }))} />
            </div>

            {dealError && (
              <p className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(204,26,26,0.1)', color: 'var(--red)' }}>
                {dealError}
              </p>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowDealForm(false)} className="btn btn-secondary flex-1">Cancel</button>
              <button onClick={saveDeal} disabled={savingDeal} className="btn btn-primary flex-1">
                {savingDeal ? <VukaLoader size={15} /> : null}
                {savingDeal ? 'Saving…' : 'Save Deal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
