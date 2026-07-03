'use client';
// src/app/campaigns/page.tsx
// Public browse page — every active/funded campaign, discoverable without a direct link.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Loader2, Users, Target, Calendar } from 'lucide-react';

interface CampaignSummary {
  id: string; title: string; description: string; coverUrl: string;
  targetAmount: number; currentAmount: number; currency: string;
  deadline: string; campaignType: string; status: string; slug: string;
  backerCount: number; artist: { name: string; slug: string; photoUrl?: string };
}

const fmtRand  = (n: number) => `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;
const daysLeft = (d: string) => Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000));
const pct      = (c: number, t: number) => Math.min(100, Math.round((c / t) * 100));

export default function CampaignsIndexPage() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [q,         setQ]         = useState('');
  const [status,    setStatus]    = useState<'active' | 'funded' | 'all'>('active');

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ status, ...(q && { q }) });
      fetch(`/api/campaigns?${params}`)
        .then(r => r.ok ? r.json() : { campaigns: [] })
        .then(d => { setCampaigns(d.campaigns || []); setLoading(false); })
        .catch(() => setLoading(false));
    }, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [q, status]);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-black mb-1" style={{ color: 'var(--text)' }}>Campaigns</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Back the projects independent artists are building right now 🎯</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search campaigns…"
            className="w-full sm:max-w-sm px-4 py-3 rounded-xl"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <div className="flex gap-2">
            {(['active', 'funded', 'all'] as const).map(s => (
              <button key={s} onClick={() => setStatus(s)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium capitalize transition-colors"
                style={{
                  background: status === s ? 'var(--green)' : 'var(--surface)',
                  color: status === s ? '#000' : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-24" style={{ color: 'var(--text-muted)' }}>
            <Target size={32} className="mx-auto mb-3 opacity-40" />
            <p>No campaigns found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {campaigns.map(c => (
              <Link key={c.id} href={`/campaigns/${c.slug}`}
                className="rounded-2xl overflow-hidden transition-transform hover:-translate-y-0.5"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="aspect-video w-full" style={{
                  background: c.coverUrl ? `url(${c.coverUrl}) center/cover` : 'linear-gradient(135deg, rgba(56,182,232,0.15), rgba(201,162,39,0.1))',
                }} />
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {c.artist.photoUrl && (
                      <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: `url(${c.artist.photoUrl}) center/cover` }} />
                    )}
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.artist.name}</span>
                  </div>
                  <h3 className="font-bold mb-2 line-clamp-2" style={{ color: 'var(--text)' }}>{c.title}</h3>
                  <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: 'var(--border)' }}>
                    <div className="h-full rounded-full" style={{ width: `${pct(c.currentAmount, c.targetAmount)}%`, background: 'var(--green)' }} />
                  </div>
                  <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span className="font-semibold" style={{ color: 'var(--text)' }}>{fmtRand(c.currentAmount)} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>of {fmtRand(c.targetAmount)}</span></span>
                    <span className="flex items-center gap-1"><Users size={11} /> {c.backerCount}</span>
                  </div>
                  {c.status === 'active' && (
                    <div className="flex items-center gap-1 text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                      <Calendar size={11} /> {daysLeft(c.deadline)} days left
                    </div>
                  )}
                  {c.status === 'funded' && (
                    <div className="text-xs mt-2 font-semibold" style={{ color: 'var(--green)' }}>✓ Fully funded</div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
