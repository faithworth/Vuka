'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Loader2, Calendar, MapPin, Ticket, Check, AlertCircle } from 'lucide-react';

export default function EventPage() {
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const [event,      setEvent]      = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState<any>(null);
  const [name,       setName]       = useState('');
  const [email,      setEmail]      = useState('');
  const [qty,        setQty]        = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState(false);

  useEffect(() => {
    fetch(`/api/events/${slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setEvent(d.event); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  useEffect(() => { if (searchParams.get('ticket_success') === '1') setSuccess(true); }, [searchParams]);

  async function buyTicket() {
    if (!selected) return;
    setError(''); setSubmitting(true);
    try {
      const res = await fetch('/api/events/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.id, ticketId: selected.id, quantity: parseInt(qty), buyerName: name, buyerEmail: email }),
      });
      const d = await res.json();
      if (d.authorizationUrl) window.location.href = d.authorizationUrl;
      else if (d.free) setSuccess(true);
      else setError(d.error ?? 'Failed');
    } catch { setError('Network error'); }
    setSubmitting(false);
  }

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-ZA', { weekday:'long', day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const fmtRand = (n: number) => n === 0 ? 'Free' : `R${n.toFixed(2)}`;

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background:'var(--bg)' }}><Loader2 size={24} className="animate-spin" style={{ color:'var(--text-muted)' }}/></div>;
  if (!event)  return <div className="min-h-screen flex items-center justify-center" style={{ background:'var(--bg)' }}><p style={{ color:'var(--text-muted)' }}>Event not found.</p></div>;

  if (success) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background:'var(--bg)' }}>
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background:'rgba(16,185,129,0.15)' }}>
          <Check size={28} style={{ color:'var(--green)' }}/>
        </div>
        <h1 className="text-2xl font-black mb-2" style={{ color:'var(--text)' }}>You're in!</h1>
        <p className="text-sm" style={{ color:'var(--text-muted)' }}>Check your email for your ticket confirmation and QR code.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen pb-20" style={{ background:'var(--bg)' }}>
      {event.coverUrl && <div className="w-full h-64 bg-cover bg-center" style={{ backgroundImage:`url(${event.coverUrl})` }}/>}
      <div className="max-w-xl mx-auto px-4 pt-8">
        <a href={`/artist/${event.artist.slug}`} className="flex items-center gap-2 mb-4">
          {event.artist.photoUrl && <img src={event.artist.photoUrl} alt={event.artist.name} className="w-8 h-8 rounded-full object-cover"/>}
          <span className="text-sm font-semibold hover:underline" style={{ color:'var(--text-muted)' }}>{event.artist.name}</span>
        </a>
        <h1 className="text-3xl font-black mb-3" style={{ color:'var(--text)' }}>{event.title}</h1>
        <div className="flex flex-col gap-1.5 mb-5 text-sm" style={{ color:'var(--text-muted)' }}>
          <span className="flex items-center gap-2"><Calendar size={14}/>{fmtDate(event.startDate)}</span>
          {event.venue && <span className="flex items-center gap-2"><MapPin size={14}/>{event.venue}{event.city && `, ${event.city}`}</span>}
        </div>
        {event.description && <p className="text-sm leading-relaxed mb-6" style={{ color:'var(--text-muted)' }}>{event.description}</p>}

        <h2 className="text-sm font-bold mb-3" style={{ color:'var(--text)' }}>Tickets</h2>
        <div className="space-y-2 mb-6">
          {event.tickets.map((t: any) => {
            const full = t.available !== null && t.available <= 0;
            return (
              <button key={t.id} onClick={() => !full && setSelected(selected?.id === t.id ? null : t)} disabled={full}
                className="w-full p-4 rounded-2xl text-left" style={{ background: selected?.id === t.id ? 'rgba(212,160,0,0.12)' : 'var(--surface)', border:`1px solid ${selected?.id === t.id ? 'rgba(212,160,0,0.4)' : 'var(--border)'}`, opacity: full ? 0.5 : 1 }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm" style={{ color: selected?.id === t.id ? 'var(--gold)' : 'var(--text)' }}>{t.name}</div>
                    {t.description && <div className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>{t.description}</div>}
                    <div className="text-xs mt-1" style={{ color:'var(--text-muted)' }}>
                      {full ? 'Sold out' : t.available !== null ? `${t.available} remaining` : 'Available'}
                    </div>
                  </div>
                  <div className="font-black text-lg" style={{ color:'var(--gold)' }}>{fmtRand(t.price)}</div>
                </div>
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="p-5 rounded-2xl" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
            <h2 className="text-sm font-bold mb-3" style={{ color:'var(--text)' }}>Get Your Ticket</h2>
            {error && <div className="flex items-center gap-2 text-sm p-3 rounded-xl mb-3" style={{ background:'rgba(248,113,113,0.1)', color:'#f87171' }}><AlertCircle size={14}/>{error}</div>}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input className="input" placeholder="Your name *" value={name} onChange={e => setName(e.target.value)}/>
                <input className="input" type="email" placeholder="Email *" value={email} onChange={e => setEmail(e.target.value)}/>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-semibold flex-shrink-0" style={{ color:'var(--text-muted)' }}>Quantity</label>
                <input className="input w-24" type="number" min="1" max="10" value={qty} onChange={e => setQty(e.target.value)}/>
              </div>
            </div>
            <button onClick={buyTicket} disabled={submitting || !name || !email}
              className="w-full mt-4 py-3 rounded-xl font-bold text-sm text-white disabled:opacity-50"
              style={{ background:'linear-gradient(135deg,#d4a000,#b38600)' }}>
              {submitting ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin"/>Processing…</span>
                : selected.price === 0 ? 'Get Free Ticket'
                : `Buy ${qty} × ${fmtRand(selected.price)} = R${(selected.price * parseInt(qty || '1')).toFixed(2)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
