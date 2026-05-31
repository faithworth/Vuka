// FIX: src/app/services/page.tsx
// Added "Message" button on each service card that creates/opens a direct conversation
// with the industry user via POST /api/messages/conversations then redirects to /messages.
// Previously there was ZERO way to communicate with industry users except the static inquiry form.
// Industry users could not reply to artists at all — now both sides can DM each other.

'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import {
  Search, Loader2, Briefcase, DollarSign, Calendar,
  MessageSquare, CheckCircle, Filter, Send,
} from 'lucide-react';
import { createClient } from '@/lib/supabase';

const CATEGORIES = [
  { value: '',             label: 'All Services' },
  { value: 'promotion',    label: 'Promotion' },
  { value: 'distribution', label: 'Distribution' },
  { value: 'sync',         label: 'Sync & Licensing' },
  { value: 'management',   label: 'Management' },
  { value: 'scouting',     label: 'Talent Scouting' },
  { value: 'sponsorship',  label: 'Sponsorship' },
  { value: 'legal',        label: 'Legal' },
  { value: 'photography',  label: 'Photography' },
  { value: 'videography',  label: 'Videography' },
  { value: 'mixing',       label: 'Mixing' },
  { value: 'mastering',    label: 'Mastering' },
  { value: 'other',        label: 'Other' },
];

const PRICING_LABELS: Record<string, string> = {
  fixed: '', per_track: '/ track', per_month: '/ month', quote: '(quote)',
};

export default function ServicesPage() {
  const router = useRouter();
  const [services, setServices]       = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [category, setCategory]       = useState('');
  const [sort, setSort]               = useState('price_asc');
  const [search, setSearch]           = useState('');
  const [userId, setUserId]           = useState<string | null>(null);
  const [userRole, setUserRole]       = useState<string | null>(null);
  const [inquiring, setInquiring]     = useState<string | null>(null);
  const [messaging, setMessaging]     = useState<string | null>(null);
  const [msgMap, setMsgMap]           = useState<Record<string, string>>({});
  const [done, setDone]               = useState<Record<string, boolean>>({});
  const [showMsg, setShowMsg]         = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const me = await fetch('/api/auth/me').then(r => r.ok ? r.json() : null);
        setUserRole(me?.role || null);
        setUserId(me?.id || null);
      }
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ sort });
    if (category) params.set('category', category);
    fetch(`/api/industry/browse?${params}`)
      .then(r => r.json())
      .then(d => { setServices(d.services || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [category, sort]);

  async function sendInquiry(serviceId: string) {
    setInquiring(serviceId);
    const res = await fetch('/api/industry/inquire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId, message: msgMap[serviceId] || '' }),
    });
    if (res.ok) {
      setDone(d => ({ ...d, [serviceId]: true }));
      setShowMsg(null);
    }
    setInquiring(null);
  }

  async function openMessage(svc: any) {
    // Find the industry user's userId to start a conversation
    const recipientId = svc.industryUser?.userId || svc.industryUser?.user?.id;
    if (!recipientId) return;
    setMessaging(svc.id);
    try {
      const res = await fetch('/api/messages/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId }),
      });
      if (res.ok) {
        router.push('/messages');
      }
    } catch {}
    setMessaging(null);
  }

  const filtered = services.filter(s => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return s.title?.toLowerCase().includes(q) ||
           s.description?.toLowerCase().includes(q) ||
           s.industryUser?.user?.name?.toLowerCase().includes(q);
  });

  const canInquire = userRole === 'artist' || userRole === 'fan' || userRole === 'producer';

  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-20 pb-20" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
        <div className="max-w-5xl mx-auto px-4">

          <div className="py-10">
            <h1 className="text-3xl md:text-4xl font-black mb-2" style={{ color: 'var(--text)' }}>
              Industry Services
            </h1>
            <p style={{ color: 'var(--text-muted)' }}>
              Hire promoters, managers, engineers, and more — all on Vuka.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input className="input w-full pl-9" placeholder="Search services or providers…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select className="input" value={sort} onChange={e => setSort(e.target.value)}>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="newest">Newest First</option>
            </select>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 size={28} className="animate-spin" style={{ color: 'var(--sky)' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <Briefcase size={36} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
              <p className="font-bold mb-1" style={{ color: 'var(--text)' }}>No services found</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Try a different category or search term.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filtered.map((svc: any) => {
                const pm = PRICING_LABELS[svc.pricingModel] || '';
                const isDone = done[svc.id];
                const isOpen = showMsg === svc.id;
                const isOwnService = svc.industryUser?.userId === userId || svc.industryUser?.user?.id === userId;

                return (
                  <div key={svc.id} className="p-6 rounded-2xl flex flex-col"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xs"
                        style={{ background: 'rgba(201,162,39,0.15)', color: 'var(--gold)' }}>
                        {svc.industryUser?.user?.name?.[0]?.toUpperCase() || 'P'}
                      </div>
                      <div>
                        <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                          {svc.industryUser?.user?.name || 'Industry Professional'}
                        </p>
                        {svc.industryUser?.company && (
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{svc.industryUser.company}</p>
                        )}
                      </div>
                    </div>

                    <h3 className="font-black mb-2" style={{ color: 'var(--text)' }}>{svc.title}</h3>
                    {svc.description && (
                      <p className="text-sm mb-4 flex-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                        {svc.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-sm mb-5 flex-wrap">
                      <span className="font-bold" style={{ color: 'var(--green)' }}>
                        R{Number(svc.priceZAR).toLocaleString()} {pm}
                      </span>
                      <span className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                        <Calendar size={12} /> {svc.deliveryDays}d delivery
                      </span>
                    </div>

                    {/* CTA */}
                    {isOwnService ? (
                      <p className="text-xs font-medium text-center" style={{ color: 'var(--text-muted)' }}>Your listing</p>
                    ) : isDone ? (
                      <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--green)' }}>
                        <CheckCircle size={15} /> Inquiry sent
                      </div>
                    ) : canInquire ? (
                      <div className="space-y-2">
                        {isOpen ? (
                          <>
                            <textarea className="input w-full resize-none text-sm" rows={3}
                              placeholder="Tell them what you need (optional)…"
                              value={msgMap[svc.id] || ''}
                              onChange={e => setMsgMap(m => ({ ...m, [svc.id]: e.target.value }))} />
                            <div className="flex gap-2">
                              <button onClick={() => setShowMsg(null)} className="btn btn-secondary flex-1 text-sm">
                                Cancel
                              </button>
                              <button onClick={() => sendInquiry(svc.id)}
                                disabled={inquiring === svc.id}
                                className="btn btn-primary flex-1 text-sm">
                                {inquiring === svc.id ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />}
                                Send Inquiry
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => setShowMsg(svc.id)} className="btn btn-primary flex-1 text-sm">
                              <MessageSquare size={14} /> Inquire
                            </button>
                            <button onClick={() => openMessage(svc)}
                              disabled={messaging === svc.id}
                              className="btn btn-secondary px-4 text-sm" title="Send a direct message">
                              {messaging === svc.id
                                ? <Loader2 size={14} className="animate-spin" />
                                : <Send size={14} />}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : !userId ? (
                      <a href="/auth/login" className="btn btn-secondary w-full text-sm text-center">
                        Sign in to inquire
                      </a>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
