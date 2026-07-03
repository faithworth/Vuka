'use client';
// src/app/events/page.tsx
// Public browse page — every published event, discoverable without a direct link.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Loader2, MapPin, Calendar, Users, Ticket } from 'lucide-react';

interface EventSummary {
  id: string; title: string; description: string; coverUrl: string;
  venue: string; city: string; province: string;
  startDate: string; endDate: string | null; slug: string;
  fromPrice: number | null; attendeeCount: number;
  artist: { name: string; slug: string; photoUrl?: string };
}

const fmtRand = (n: number) => `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

export default function EventsIndexPage() {
  const [events,  setEvents]  = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [q,       setQ]       = useState('');
  const [when,    setWhen]    = useState<'upcoming' | 'past' | 'all'>('upcoming');

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ when, ...(q && { q }) });
      fetch(`/api/events?${params}`)
        .then(r => r.ok ? r.json() : { events: [] })
        .then(d => { setEvents(d.events || []); setLoading(false); })
        .catch(() => setLoading(false));
    }, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [q, when]);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-black mb-1" style={{ color: 'var(--text)' }}>Events</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Gigs and shows happening around you, straight from the artists 🎫</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search events, venues, cities…"
            className="w-full sm:max-w-sm px-4 py-3 rounded-xl"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <div className="flex gap-2">
            {(['upcoming', 'past', 'all'] as const).map(w => (
              <button key={w} onClick={() => setWhen(w)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium capitalize transition-colors"
                style={{
                  background: when === w ? 'var(--green)' : 'var(--surface)',
                  color: when === w ? '#000' : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}>
                {w}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-24" style={{ color: 'var(--text-muted)' }}>
            <Ticket size={32} className="mx-auto mb-3 opacity-40" />
            <p>No {when === 'upcoming' ? 'upcoming' : ''} events found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {events.map(e => (
              <Link key={e.id} href={`/events/${e.slug}`}
                className="rounded-2xl overflow-hidden transition-transform hover:-translate-y-0.5"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="aspect-video w-full" style={{
                  background: e.coverUrl ? `url(${e.coverUrl}) center/cover` : 'linear-gradient(135deg, rgba(56,182,232,0.15), rgba(201,162,39,0.1))',
                }} />
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {e.artist.photoUrl && (
                      <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: `url(${e.artist.photoUrl}) center/cover` }} />
                    )}
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{e.artist.name}</span>
                  </div>
                  <h3 className="font-bold mb-2 line-clamp-2" style={{ color: 'var(--text)' }}>{e.title}</h3>
                  <div className="flex items-center gap-1 text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                    <Calendar size={11} /> {fmtDate(e.startDate)}
                  </div>
                  {(e.venue || e.city) && (
                    <div className="flex items-center gap-1 text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                      <MapPin size={11} /> {[e.venue, e.city].filter(Boolean).join(', ')}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs mt-2">
                    <span className="font-semibold" style={{ color: 'var(--text)' }}>
                      {e.fromPrice != null ? (e.fromPrice === 0 ? 'Free' : `From ${fmtRand(e.fromPrice)}`) : 'TBA'}
                    </span>
                    <span className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><Users size={11} /> {e.attendeeCount} going</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
