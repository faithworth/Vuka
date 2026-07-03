'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, MapPin, Calendar, CheckCircle2, XCircle } from 'lucide-react';

interface TicketData {
  buyerName: string; ticketName: string; status: string; checkedIn: boolean; checkedInAt: string | null;
  event: { title: string; artist: string; venue: string; city: string; province: string; startDate: string; coverUrl: string };
}

export default function TicketPage() {
  const params = useParams();
  const token = params?.token as string;
  const [data,    setData]    = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`/api/tickets/${token}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setData)
      .catch(() => setError('Ticket not found. Check the link from your confirmation email.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center" style={{ background: 'var(--bg)' }}>
      <p style={{ color: 'var(--text-muted)' }}>{error || 'Something went wrong.'}</p>
    </div>
  );

  const dateStr = new Date(data.event.startDate).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = new Date(data.event.startDate).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="min-h-screen px-4 py-8 max-w-md mx-auto" style={{ background: 'var(--bg)' }}>
      <div className="rounded-3xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {data.event.coverUrl && (
          <div className="h-36 w-full" style={{ backgroundImage: `url(${data.event.coverUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
        )}
        <div className="p-6">
          <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--accent)' }}>{data.event.artist}</p>
          <h1 className="text-2xl font-black mb-3" style={{ color: 'var(--text)' }}>{data.event.title}</h1>

          <div className="flex items-start gap-2 text-sm mb-1.5" style={{ color: 'var(--text-muted)' }}>
            <Calendar size={15} className="flex-shrink-0 mt-0.5" />
            <span>{dateStr} · {timeStr}</span>
          </div>
          <div className="flex items-start gap-2 text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            <MapPin size={15} className="flex-shrink-0 mt-0.5" />
            <span>{data.event.venue}{data.event.city ? `, ${data.event.city}` : ''}</span>
          </div>

          {data.checkedIn ? (
            <div className="rounded-2xl p-6 text-center mb-4" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e' }}>
              <CheckCircle2 size={40} className="mx-auto mb-2" style={{ color: '#22c55e' }} />
              <p className="font-bold" style={{ color: '#22c55e' }}>Already scanned in</p>
              {data.checkedInAt && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{new Date(data.checkedInAt).toLocaleString('en-ZA')}</p>}
            </div>
          ) : data.status !== 'confirmed' ? (
            <div className="rounded-2xl p-6 text-center mb-4" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444' }}>
              <XCircle size={40} className="mx-auto mb-2" style={{ color: '#ef4444' }} />
              <p className="font-bold" style={{ color: '#ef4444' }}>Not yet confirmed</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>If you just paid, refresh in a moment.</p>
            </div>
          ) : (
            <div className="rounded-2xl p-5 flex flex-col items-center" style={{ background: '#fff' }}>
              <img src={`/api/tickets/${token}/qr`} alt="Entry QR code" className="w-56 h-56" />
              <p className="text-xs mt-3 text-center" style={{ color: '#666' }}>Show this at the door. One scan, one entry.</p>
            </div>
          )}

          <div className="mt-5 pt-5 space-y-1" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Ticket</span>
              <span style={{ color: 'var(--text)' }}>{data.ticketName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Name</span>
              <span style={{ color: 'var(--text)' }}>{data.buyerName}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
