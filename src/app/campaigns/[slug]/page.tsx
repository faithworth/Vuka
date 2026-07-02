'use client';
// src/app/campaigns/[slug]/page.tsx
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Users, Calendar, Target, Check, AlertCircle, Heart } from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

interface Tier { id: string; title: string; description: string; amount: number; perks: string[]; maxBackers: number | null; backerCount: number; available: number | null }
interface Campaign {
  id: string; title: string; description: string; coverUrl: string;
  targetAmount: number; currentAmount: number; currency: string;
  deadline: string; campaignType: string; status: string;
  backerCount: number; tiers: Tier[];
  artist: { name: string; slug: string; photoUrl?: string };
}

const fmtRand   = (n: number) => `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
const daysLeft  = (d: string) => Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000));
const pct       = (c: number, t: number) => Math.min(100, Math.round((c / t) * 100));

export default function CampaignPage() {
  const { slug }    = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<Tier | null>(null);
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [amount,   setAmount]   = useState('');
  const [message,  setMessage]  = useState('');
  const [anon,     setAnon]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error,    setError]    = useState('');
  const [backed,   setBacked]   = useState(false);

  useEffect(() => {
    fetch(`/api/campaigns/${slug}/public`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCampaign(d.campaign); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (searchParams.get('backed') === '1') setBacked(true);
  }, [searchParams]);

  async function back() {
    setError(''); setSubmitting(true);
    try {
      const res = await fetch('/api/campaigns/back', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId:   campaign!.id,
          tierId:       selected?.id ?? null,
          backerName:   name,
          backerEmail:  email,
          amount:       selected ? selected.amount : parseFloat(amount),
          anonymous:    anon,
          message,
        }),
      });
      const d = await res.json();
      if (d.authorizationUrl) {
        window.location.href = d.authorizationUrl;
      } else if (d.ok) {
        setBacked(true);
      } else {
        setError(d.error ?? 'Failed to process');
      }
    } catch { setError('Network error — please try again.'); }
    setSubmitting(false);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <VukaLoader size={24} />
    </div>
  );
  if (!campaign) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <p style={{ color: 'var(--text-muted)' }}>Campaign not found.</p>
    </div>
  );

  const progress = pct(campaign.currentAmount, campaign.targetAmount);
  const days     = daysLeft(campaign.deadline);
  const isClosed = campaign.status !== 'active';

  if (backed) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg)' }}>
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(16,185,129,0.15)' }}>
          <Heart size={28} style={{ color: 'var(--green)' }} />
        </div>
        <h1 className="text-2xl font-black mb-2" style={{ color: 'var(--text)' }}>Thank you for backing!</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          You've supported <strong style={{ color: 'var(--text)' }}>{campaign.artist.name}</strong>.
          {campaign.campaignType === 'all_or_nothing' && ' If the goal isn\'t reached, you\'ll be fully refunded.'}
        </p>
        <a href="/" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg,#d4a000,#b38600)' }}>
          Discover More Artists
        </a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen pb-20" style={{ background: 'var(--bg)' }}>
      {/* Cover */}
      {campaign.coverUrl && (
        <div className="w-full h-64 md:h-80 bg-cover bg-center" style={{ backgroundImage: `url(${campaign.coverUrl})` }} />
      )}

      <div className="max-w-2xl mx-auto px-4 pt-8">
        {/* Artist */}
        <div className="flex items-center gap-3 mb-5">
          {campaign.artist.photoUrl && <img src={campaign.artist.photoUrl} alt={campaign.artist.name} className="w-10 h-10 rounded-full object-cover" />}
          <div>
            <a href={`/artist/${campaign.artist.slug}`} className="font-bold text-sm hover:underline" style={{ color: 'var(--text)' }}>{campaign.artist.name}</a>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Campaign by this artist</p>
          </div>
        </div>

        <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--text)' }}>{campaign.title}</h1>
        {campaign.description && <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{campaign.description}</p>}

        {/* Progress */}
        <div className="p-5 rounded-2xl mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className="text-2xl font-black" style={{ color: 'var(--gold)' }}>{fmtRand(campaign.currentAmount)}</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>of {fmtRand(campaign.targetAmount)} goal</div>
            </div>
            <div className="text-right">
              <div className="text-xl font-black" style={{ color: 'var(--text)' }}>{campaign.backerCount}</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>backers</div>
            </div>
            <div className="text-right">
              <div className="text-xl font-black" style={{ color: isClosed ? '#9ca3af' : 'var(--sky)' }}>{isClosed ? '—' : days}</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{isClosed ? campaign.status : 'days left'}</div>
            </div>
          </div>
          <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
            <div className="h-full rounded-full" style={{ width: `${progress}%`, background: progress >= 100 ? 'linear-gradient(90deg,#10b981,#22c55e)' : 'linear-gradient(90deg,#d4a000,#f59e0b)' }} />
          </div>
          <div className="flex items-center justify-between mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>{progress}% funded</span>
            {campaign.campaignType === 'all_or_nothing' && <span>All-or-Nothing — refunded if goal not met</span>}
          </div>
        </div>

        {isClosed ? (
          <div className="p-5 rounded-2xl text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="font-bold" style={{ color: 'var(--text)' }}>This campaign has {campaign.status}.</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Check out more from this artist.</p>
            <a href={`/artist/${campaign.artist.slug}`} className="inline-block mt-4 px-5 py-2.5 rounded-xl font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg,#d4a000,#b38600)' }}>Visit Artist Page</a>
          </div>
        ) : (
          <>
            {/* Backer tiers */}
            {campaign.tiers.length > 0 && (
              <div className="mb-6">
                <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Choose a Backing Tier</h2>
                <div className="space-y-2">
                  {campaign.tiers.map(tier => {
                    const full = tier.maxBackers !== null && tier.backerCount >= tier.maxBackers;
                    return (
                      <button key={tier.id} onClick={() => { if (!full) { setSelected(selected?.id === tier.id ? null : tier); setAmount(String(tier.amount)); } }}
                        disabled={full}
                        className="w-full p-4 rounded-2xl text-left transition-all"
                        style={{
                          background: selected?.id === tier.id ? 'rgba(212,160,0,0.12)' : 'var(--surface)',
                          border: `1px solid ${selected?.id === tier.id ? 'rgba(212,160,0,0.4)' : 'var(--border)'}`,
                          opacity: full ? 0.5 : 1,
                        }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold" style={{ color: selected?.id === tier.id ? 'var(--gold)' : 'var(--text)' }}>{tier.title}</span>
                          <span className="font-black" style={{ color: 'var(--gold)' }}>{fmtRand(tier.amount)}</span>
                        </div>
                        {tier.description && <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{tier.description}</p>}
                        {tier.perks.length > 0 && (
                          <ul className="space-y-0.5">
                            {tier.perks.map((p, i) => <li key={i} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}><Check size={10} style={{ color: 'var(--green)', flexShrink: 0 }} />{p}</li>)}
                          </ul>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                          <span className="flex items-center gap-1"><Users size={11} />{tier.backerCount} backed</span>
                          {tier.maxBackers && <span>/ {tier.maxBackers} available {full && '— Full'}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Checkout form */}
            <div className="p-5 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <h2 className="text-sm font-bold mb-4" style={{ color: 'var(--text)' }}>{selected ? `Back at ${fmtRand(selected.amount)}` : 'Back this Campaign'}</h2>
              {error && <div className="flex items-center gap-2 text-sm p-3 rounded-xl mb-3" style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}><AlertCircle size={14} />{error}</div>}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input className="input" placeholder="Your name *" value={name} onChange={e => setName(e.target.value)} />
                  <input className="input" type="email" placeholder="Email *" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                {!selected && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold" style={{ color: 'var(--text-muted)' }}>R</span>
                    <input className="input flex-1" type="number" min="10" placeholder="Amount (min R10)" value={amount} onChange={e => setAmount(e.target.value)} />
                  </div>
                )}
                <textarea className="input w-full resize-none" rows={2} placeholder="Leave a message for the artist (optional)" value={message} onChange={e => setMessage(e.target.value)} />
                <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                  <input type="checkbox" checked={anon} onChange={e => setAnon(e.target.checked)} className="rounded" />
                  Back anonymously
                </label>
              </div>
              <button onClick={back} disabled={submitting || !name || !email || (!selected && !amount)}
                className="w-full mt-4 py-3 rounded-xl font-bold text-sm text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#d4a000,#b38600)' }}>
                {submitting
                  ? <span className="flex items-center justify-center gap-2"><VukaLoader size={14} /> Processing…</span>
                  : `Back for ${selected ? fmtRand(selected.amount) : amount ? `R${parseFloat(amount).toFixed(2)}` : '…'}`}
              </button>
              <p className="text-xs text-center mt-3" style={{ color: 'var(--text-muted)' }}>
                Secured by Paystack. {campaign.campaignType === 'all_or_nothing' && 'Fully refunded if goal not reached.'}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
