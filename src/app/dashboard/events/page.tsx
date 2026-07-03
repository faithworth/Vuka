'use client';
import { useEffect, useState } from 'react';
import { Plus, Calendar, MapPin, Ticket, Users, Globe, Trash2, ChevronRight, Check, AlertCircle, Eye, ScanLine } from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

interface EventTicketForm { name: string; description: string; price: string; quantity: string }
interface EventItem {
  id: string; title: string; venue: string; city: string; province: string;
  startDate: string; status: string; slug: string; coverUrl: string;
  tickets: { id: string; name: string; price: number; sold: number; quantity: number | null }[];
  _count: { purchases: number };
}
type Step = 'list' | 'create' | 'detail'

const SA_PROVINCES = ['Gauteng','Western Cape','KwaZulu-Natal','Eastern Cape','Limpopo','Mpumalanga','North West','Free State','Northern Cape'];
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-ZA', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
const fmtRand = (n: number) => `R${n.toFixed(2)}`;
const STATUS_COLOR: Record<string,string> = { draft:'#9ca3af', published:'#22c55e', cancelled:'#f87171', completed:'#d4a000' };

export default function EventsPage() {
  const [events,    setEvents]   = useState<EventItem[]>([]);
  const [loading,   setLoading]  = useState(true);
  const [step,      setStep]     = useState<Step>('list');
  const [selected,  setSelected] = useState<EventItem | null>(null);
  const [saving,    setSaving]   = useState(false);
  const [error,     setError]    = useState('');
  const [success,   setSuccess]  = useState('');
  const [actioning, setActioning]= useState(false);

  // Form
  const [title,       setTitle]       = useState('');
  const [description, setDesc]        = useState('');
  const [venue,       setVenue]       = useState('');
  const [city,        setCity]        = useState('');
  const [province,    setProvince]    = useState('Gauteng');
  const [startDate,   setStartDate]   = useState('');
  const [endDate,     setEndDate]     = useState('');
  const [coverUrl,    setCoverUrl]    = useState('');
  const [tickets,     setTickets]     = useState<EventTicketForm[]>([{ name:'General Admission', description:'', price:'', quantity:'' }]);

  async function load() {
    setLoading(true);
    try { const r = await fetch('/api/dashboard/events'); if (r.ok) { const d = await r.json(); setEvents(d.events ?? []); } } catch {}
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function resetForm() {
    setTitle(''); setDesc(''); setVenue(''); setCity(''); setProvince('Gauteng');
    setStartDate(''); setEndDate(''); setCoverUrl('');
    setTickets([{ name:'General Admission', description:'', price:'', quantity:'' }]);
    setError(''); setSuccess('');
  }
  const addTicket = () => setTickets(t => [...t, { name:'', description:'', price:'', quantity:'' }]);
  const removeTicket = (i: number) => setTickets(t => t.filter((_,idx) => idx !== i));
  const updateTicket = (i: number, f: keyof EventTicketForm, v: string) =>
    setTickets(t => t.map((tk, idx) => idx === i ? { ...tk, [f]: v } : tk));

  async function create() {
    setError(''); setSaving(true);
    try {
      const res = await fetch('/api/dashboard/events', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ title, description, venue, city, province, startDate, endDate: endDate || undefined, coverUrl,
          tickets: tickets.filter(t => t.name && t.price !== '').map(t => ({ ...t, price: parseFloat(t.price), quantity: t.quantity ? parseInt(t.quantity) : null })) }),
      });
      const d = await res.json();
      if (d.ok) { setSuccess('Event created as draft.'); setStep('list'); resetForm(); await load(); }
      else setError(d.error ?? 'Failed');
    } catch { setError('Network error'); }
    setSaving(false);
  }

  async function action(id: string, act: string) {
    setActioning(true); setError('');
    const res = await fetch(`/api/dashboard/events/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action: act }) });
    const d = await res.json();
    if (d.ok) { await load(); setSelected(d.event); }
    else setError(d.error ?? 'Failed');
    setActioning(false);
  }

  async function del(id: string) {
    setActioning(true);
    await fetch(`/api/dashboard/events/${id}`, { method:'DELETE' });
    setStep('list'); setSelected(null); await load();
    setActioning(false);
  }

  if (loading) return <div className="p-10 flex items-center gap-3" style={{ color:'var(--text-muted)' }}><VukaLoader size={18} /> Loading events…</div>;

  // ── CREATE ──
  if (step === 'create') return (
    <div className="p-6 md:p-10 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black" style={{ color:'var(--text)' }}>New Event</h1>
        <button onClick={() => { setStep('list'); resetForm(); }} className="text-sm px-4 py-2 rounded-xl" style={{ background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text-muted)' }}>Cancel</button>
      </div>
      {error && <div className="flex items-center gap-2 text-sm p-3 rounded-xl mb-4" style={{ background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.2)', color:'#f87171' }}><AlertCircle size={14}/>{error}</div>}
      <div className="space-y-4">
        <div className="p-5 rounded-2xl space-y-3" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
          <h2 className="text-sm font-bold" style={{ color:'var(--text)' }}>Event Details</h2>
          <input className="input w-full" placeholder="Event title *" value={title} onChange={e => setTitle(e.target.value)} />
          <textarea className="input w-full resize-none" rows={3} placeholder="Description" value={description} onChange={e => setDesc(e.target.value)} />
          <input className="input w-full" placeholder="Cover image URL" value={coverUrl} onChange={e => setCoverUrl(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color:'var(--text-muted)' }}>Start Date & Time *</label>
              <input className="input w-full" type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color:'var(--text-muted)' }}>End Date & Time</label>
              <input className="input w-full" type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <input className="input w-full" placeholder="Venue name" value={venue} onChange={e => setVenue(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <input className="input" placeholder="City" value={city} onChange={e => setCity(e.target.value)} />
            <select className="input" value={province} onChange={e => setProvince(e.target.value)}>
              {SA_PROVINCES.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="p-5 rounded-2xl" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold" style={{ color:'var(--text)' }}>Ticket Types</h2>
            <button onClick={addTicket} className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg" style={{ background:'var(--surface2)', color:'var(--text-muted)' }}><Plus size={11}/>Add</button>
          </div>
          <div className="space-y-3">
            {tickets.map((t,i) => (
              <div key={i} className="p-3 rounded-xl" style={{ background:'var(--surface2)', border:'1px solid var(--border)' }}>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input className="input text-sm" placeholder="Ticket name *" value={t.name} onChange={e => updateTicket(i,'name',e.target.value)} />
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold" style={{ color:'var(--text-muted)' }}>R</span>
                    <input className="input text-sm flex-1" type="number" min="0" placeholder="Price (0=free)" value={t.price} onChange={e => updateTicket(i,'price',e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 items-center">
                  <input className="input text-sm" placeholder="Description" value={t.description} onChange={e => updateTicket(i,'description',e.target.value)} />
                  <div className="flex gap-2">
                    <input className="input text-sm flex-1" type="number" min="1" placeholder="Qty limit" value={t.quantity} onChange={e => updateTicket(i,'quantity',e.target.value)} />
                    {tickets.length > 1 && <button onClick={() => removeTicket(i)} className="p-2 rounded-lg" style={{ background:'rgba(248,113,113,0.1)', color:'#f87171' }}><Trash2 size={12}/></button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <button onClick={create} disabled={saving} className="w-full py-3 rounded-xl font-bold text-sm text-white disabled:opacity-50" style={{ background:'linear-gradient(135deg,#d4a000,#b38600)' }}>
          {saving ? <span className="flex items-center justify-center gap-2"><VukaLoader size={14} />Creating…</span> : 'Save as Draft'}
        </button>
      </div>
    </div>
  );

  // ── DETAIL ──
  if (step === 'detail' && selected) return (
    <div className="p-6 md:p-10 max-w-2xl">
      <button onClick={() => { setStep('list'); setSelected(null); setError(''); }} className="text-sm flex items-center gap-1.5 mb-6" style={{ color:'var(--text-muted)' }}>← Back</button>
      {error && <div className="text-sm p-3 rounded-xl mb-4 flex items-center gap-2" style={{ background:'rgba(248,113,113,0.1)', color:'#f87171' }}><AlertCircle size={14}/>{error}</div>}
      {selected.coverUrl && <div className="w-full h-44 rounded-2xl mb-4 bg-cover bg-center" style={{ backgroundImage:`url(${selected.coverUrl})` }}/>}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-black" style={{ color:'var(--text)' }}>{selected.title}</h1>
          <div className="flex items-center gap-3 mt-1 text-xs" style={{ color:'var(--text-muted)' }}>
            <span className="flex items-center gap-1"><Calendar size={11}/>{fmtDate(selected.startDate)}</span>
            {selected.city && <span className="flex items-center gap-1"><MapPin size={11}/>{selected.city}, {selected.province}</span>}
          </div>
        </div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full capitalize flex-shrink-0" style={{ background:`${STATUS_COLOR[selected.status]}22`, color:STATUS_COLOR[selected.status] }}>{selected.status}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="p-4 rounded-xl" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
          <div className="text-xl font-black" style={{ color:'var(--gold)' }}>{selected._count?.purchases ?? 0}</div>
          <div className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>Tickets sold</div>
        </div>
        <div className="p-4 rounded-xl" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
          <div className="text-xl font-black" style={{ color:'var(--green)' }}>{selected.tickets?.length ?? 0}</div>
          <div className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>Ticket types</div>
        </div>
      </div>
      {(selected.tickets?.length ?? 0) > 0 && (
        <div className="mb-5">
          <h2 className="text-sm font-bold mb-2" style={{ color:'var(--text)' }}>Ticket Types</h2>
          <div className="space-y-2">
            {selected.tickets.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
                <div>
                  <div className="font-semibold text-sm" style={{ color:'var(--text)' }}>{t.name}</div>
                  <div className="text-xs" style={{ color:'var(--text-muted)' }}>{t.sold} sold{t.quantity ? ` / ${t.quantity}` : ''}</div>
                </div>
                <div className="font-black" style={{ color:'var(--gold)' }}>{t.price === 0 ? 'Free' : fmtRand(t.price)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-3 flex-wrap">
        {selected.status === 'draft' && <>
          <button onClick={() => action(selected.id,'publish')} disabled={actioning} className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white" style={{ background:'linear-gradient(135deg,#22c55e,#16a34a)' }}>
            {actioning ? <VukaLoader size={14} /> : <Globe size={14}/>} Publish
          </button>
          <button onClick={() => del(selected.id)} disabled={actioning} className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm" style={{ background:'rgba(248,113,113,0.1)', color:'#f87171', border:'1px solid rgba(248,113,113,0.2)' }}>
            <Trash2 size={14}/> Delete
          </button>
        </>}
        {selected.status === 'published' && <>
          <a href={`/events/${selected.slug}`} target="_blank" className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm" style={{ background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text)' }}>
            <Eye size={14}/> View Public Page
          </a>
          <a href={`/dashboard/events/${selected.id}/scan`} className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white" style={{ background:'linear-gradient(135deg,#38b6e8,#2a8fc0)' }}>
            <ScanLine size={14}/> Scan Tickets
          </a>
          <button onClick={() => action(selected.id,'cancel')} disabled={actioning} className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm" style={{ background:'rgba(248,113,113,0.1)', color:'#f87171', border:'1px solid rgba(248,113,113,0.2)' }}>
            Cancel Event
          </button>
        </>}
      </div>
    </div>
  );

  // ── LIST ──
  return (
    <div className="p-6 md:p-10 max-w-2xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2" style={{ color:'var(--text)' }}><Calendar size={22} style={{ color:'var(--gold)' }}/> Events</h1>
          <p className="text-sm mt-0.5" style={{ color:'var(--text-muted)' }}>Create events, sell tickets, and manage attendance from one place.</p>
        </div>
        <button onClick={() => { setStep('create'); resetForm(); }} className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white" style={{ background:'linear-gradient(135deg,#d4a000,#b38600)' }}><Plus size={15}/>New Event</button>
      </div>
      {success && <div className="flex items-center gap-2 text-sm p-3 rounded-xl mb-4" style={{ background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.2)', color:'var(--green)' }}><Check size={14}/>{success}</div>}
      {events.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
          <Calendar size={32} className="mx-auto mb-3" style={{ color:'var(--text-muted)', opacity:0.4 }}/>
          <h3 className="font-bold mb-1" style={{ color:'var(--text)' }}>No events yet</h3>
          <p className="text-sm mb-6" style={{ color:'var(--text-muted)' }}>Create your first event and start selling tickets directly to fans.</p>
          <button onClick={() => setStep('create')} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white" style={{ background:'linear-gradient(135deg,#d4a000,#b38600)' }}><Plus size={15}/>Create Event</button>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map(ev => (
            <button key={ev.id} onClick={() => { setSelected(ev); setStep('detail'); setError(''); }} className="w-full p-5 rounded-2xl text-left" style={{ background:'var(--surface)', border:'1px solid var(--border)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-black text-sm truncate" style={{ color:'var(--text)' }}>{ev.title}</h3>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full capitalize" style={{ background:`${STATUS_COLOR[ev.status]}22`, color:STATUS_COLOR[ev.status] }}>{ev.status}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs" style={{ color:'var(--text-muted)' }}>
                    <span className="flex items-center gap-1"><Calendar size={11}/>{fmtDate(ev.startDate)}</span>
                    {ev.city && <span className="flex items-center gap-1"><MapPin size={11}/>{ev.city}</span>}
                    <span className="flex items-center gap-1"><Ticket size={11}/>{ev._count.purchases} sold</span>
                  </div>
                </div>
                <ChevronRight size={16} style={{ color:'var(--text-muted)', flexShrink:0 }}/>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
