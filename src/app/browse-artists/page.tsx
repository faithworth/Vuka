'use client';
// src/app/browse-artists/page.tsx
// For industry professionals: browse and discover artists.
// Lets them initiate deals/offers directly from the browse view.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import {
  Search, Music, Users, Star, Send, Filter, Globe, Building2, ChevronRight, Handshake, Mic2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import VukaLoader from '@/components/brand/VukaLoader';

const GENRES = [
  '', 'Amapiano', 'Afrobeats', 'Gqom', 'Hip Hop', 'Kwaito',
  'R&B', 'Gospel', 'Trap', 'Afro Pop', 'Jazz', 'House',
];

const SORTS = [
  { value: 'popular',   label: 'Most Popular' },
  { value: 'new',       label: 'Newest' },
  { value: 'followers', label: 'Most Followed' },
];

export default function BrowseArtistsPage() {
  const router = useRouter();
  const [artists, setArtists]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [genre, setGenre]       = useState('');
  const [sort, setSort]         = useState('popular');
  const [page, setPage]         = useState(1);
  const [hasMore, setHasMore]   = useState(false);

  const [userRole, setUserRole] = useState<string | null>(null);
  const [offerOpen, setOfferOpen] = useState<string | null>(null); // artist slug
  const [offerForm, setOfferForm] = useState({ title: '', description: '', dealType: 'licensing', offerAmount: '' });
  const [sending, setSending]   = useState(false);
  const [sentOffers, setSentOffers] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const me = await fetch('/api/auth/me').then(r => r.ok ? r.json() : null);
        if (me) setUserRole(me.role || null);
      }
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ sort, page: String(page), limit: '18' });
    if (genre) p.set('genre', genre);
    fetch(`/api/discovery/artists?${p}`)
      .then(r => r.json())
      .then(d => {
        const list = d.artists || [];
        setArtists(page === 1 ? list : prev => [...prev, ...list]);
        setHasMore(list.length === 18);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [genre, sort, page]);

  async function sendOffer(artistSlug: string) {
    if (!offerForm.title.trim()) { alert('Title required'); return; }
    setSending(true);
    try {
      const res = await fetch('/api/industry/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...offerForm,
          artistSlug,
          offerAmount: parseFloat(offerForm.offerAmount) || 0,
        }),
      });
      if (res.ok) {
        setSentOffers(s => new Set([...s, artistSlug]));
        setOfferOpen(null);
        setOfferForm({ title: '', description: '', dealType: 'licensing', offerAmount: '' });
      } else {
        const e = await res.json().catch(() => ({}));
        alert(e.error || 'Failed to send offer');
      }
    } catch { alert('Network error'); }
    setSending(false);
  }

  const filtered = artists.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.name?.toLowerCase().includes(q) || a.bio?.toLowerCase().includes(q);
  });

  return (
    <>
      <Navbar />
      <main className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>

        {/* Header */}
        <div className="relative overflow-hidden" style={{
          background: 'linear-gradient(135deg, rgba(201,162,39,0.07) 0%, rgba(56,182,232,0.04) 100%)',
          borderBottom: '1px solid var(--border)',
        }}>
          <div className="max-w-6xl mx-auto px-4 pt-20 pb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-4" style={{
              background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.25)', color: 'var(--gold)',
            }}>
              <Building2 size={11} /> FOR INDUSTRY PROFESSIONALS
            </div>
            <h1 className="text-3xl md:text-5xl font-black leading-tight mb-3">
              Find Artists
            </h1>
            <p className="text-base md:text-lg max-w-xl" style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
              Browse active artists across Africa. Send deals, offers, or management inquiries directly through Vuka Music.
            </p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-8">

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input className="input w-full pl-9 text-sm" placeholder="Search artists by name or bio…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="input text-sm" value={genre} onChange={e => { setGenre(e.target.value); setPage(1); setArtists([]); }}>
              <option value="">All Genres</option>
              {GENRES.filter(Boolean).map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select className="input text-sm" value={sort} onChange={e => { setSort(e.target.value); setPage(1); setArtists([]); }}>
              {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {/* Grid */}
          {loading && artists.length === 0 ? (
            <div className="flex justify-center py-20">
              <VukaLoader size={28} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <Users size={36} className="mx-auto mb-4 opacity-30" />
              <p className="font-bold">No artists found</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Try a different genre or search term</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map(artist => (
                <ArtistCard
                  key={artist.slug}
                  artist={artist}
                  userRole={userRole}
                  isOfferOpen={offerOpen === artist.slug}
                  offerForm={offerForm}
                  sending={sending}
                  sent={sentOffers.has(artist.slug)}
                  onOpenOffer={() => setOfferOpen(offerOpen === artist.slug ? null : artist.slug)}
                  onOfferChange={f => setOfferForm(prev => ({ ...prev, ...f }))}
                  onSendOffer={() => sendOffer(artist.slug)}
                  onMessage={() => router.push(`/messages`)}
                />
              ))}
            </div>
          )}

          {/* Load more */}
          {hasMore && !loading && (
            <div className="flex justify-center mt-8">
              <button onClick={() => setPage(p => p + 1)}
                className="px-6 py-3 rounded-xl font-bold text-sm"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                Load more artists
              </button>
            </div>
          )}
          {loading && artists.length > 0 && (
            <div className="flex justify-center mt-8">
              <VukaLoader size={20} />
            </div>
          )}

          {/* CTA for non-industry */}
          {userRole && userRole !== 'industry' && (
            <div className="mt-12 p-8 rounded-3xl text-center" style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
            }}>
              <Building2 size={32} className="mx-auto mb-4" style={{ color: 'var(--gold)' }} />
              <h3 className="text-xl font-black mb-2">Industry feature</h3>
              <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
                Sending deals and offers requires an industry account.
              </p>
              <Link href="/auth/register?role=industry"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm"
                style={{ background: 'var(--gold)', color: '#0a0a0a' }}>
                Create Industry Account <ChevronRight size={14} />
              </Link>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function ArtistCard({ artist, userRole, isOfferOpen, offerForm, sending, sent, onOpenOffer, onOfferChange, onSendOffer, onMessage }: any) {
  const DEAL_TYPES = [
    { value: 'licensing', label: 'Licensing' },
    { value: 'publishing', label: 'Publishing' },
    { value: 'management', label: 'Management' },
    { value: 'distribution', label: 'Distribution' },
    { value: 'sync', label: 'Sync' },
    { value: 'sponsorship', label: 'Sponsorship' },
    { value: 'other', label: 'Other' },
  ];

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col transition-all" style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
    }}>
      {/* Cover bar */}
      <div className="h-1" style={{
        background: 'linear-gradient(90deg, var(--gold), rgba(201,162,39,0.2))',
      }} />

      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-start gap-3 mb-4">
          {artist.photoUrl
            ? <img src={artist.photoUrl} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" alt="" />
            : <div className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center font-black text-lg"
                style={{ background: 'rgba(201,162,39,0.15)', color: 'var(--gold)' }}>
                {artist.name?.[0] || 'A'}
              </div>
          }
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-black text-sm leading-tight" style={{ color: 'var(--text)' }}>{artist.name}</h3>
              {artist.isVerified && (
                <span className="text-[10px] font-bold" style={{ color: 'var(--sky)' }}>✓</span>
              )}
            </div>
            {artist.genreTags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {artist.genreTags.slice(0, 3).map((g: string) => (
                  <span key={g} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                    style={{ background: 'rgba(201,162,39,0.1)', color: 'var(--gold)' }}>{g}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {artist.bio && (
          <p className="text-xs leading-relaxed mb-3 line-clamp-2 flex-1" style={{ color: 'var(--text-muted)' }}>
            {artist.bio}
          </p>
        )}

        <div className="flex items-center gap-3 text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          {artist.totalPlays > 0 && (
            <span className="flex items-center gap-1">
              <Music size={10} /> {artist.totalPlays.toLocaleString()} plays
            </span>
          )}
          {artist.country && (
            <span className="flex items-center gap-1">
              <Globe size={10} /> {artist.country}
            </span>
          )}
        </div>

        {/* Actions */}
        {sent ? (
          <div className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--green)' }}>
            <Star size={12} fill="currentColor" /> Offer sent
          </div>
        ) : userRole === 'industry' ? (
          <>
            {isOfferOpen ? (
              <div className="space-y-2">
                <input className="input w-full text-xs" placeholder="Offer title (e.g. Sync licensing deal)"
                  value={offerForm.title} onChange={e => onOfferChange({ title: e.target.value })} />
                <textarea className="input w-full resize-none text-xs" rows={2}
                  placeholder="Brief description…"
                  value={offerForm.description} onChange={e => onOfferChange({ description: e.target.value })} />
                <div className="flex gap-2">
                  <select className="input flex-1 text-xs" value={offerForm.dealType}
                    onChange={e => onOfferChange({ dealType: e.target.value })}>
                    {DEAL_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                  <input className="input flex-1 text-xs" placeholder="R amount" type="number"
                    value={offerForm.offerAmount} onChange={e => onOfferChange({ offerAmount: e.target.value })} />
                </div>
                <div className="flex gap-2">
                  <button onClick={onOpenOffer} className="btn btn-secondary flex-1 text-xs">Cancel</button>
                  <button onClick={onSendOffer} disabled={sending}
                    className="btn btn-primary flex-1 text-xs"
                    style={{ background: 'var(--gold)', color: '#0a0a0a' }}>
                    {sending ? <VukaLoader size={12} /> : <Send size={12} />}
                    Send Offer
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button onClick={onOpenOffer}
                  className="btn btn-primary flex-1 text-xs"
                  style={{ background: 'var(--gold)', color: '#0a0a0a' }}>
                  <Handshake size={12} /> Make Offer
                </button>
                <Link href={`/artist/${artist.slug}`}
                  className="btn btn-secondary px-3 text-xs">
                  <Mic2 size={12} />
                </Link>
              </div>
            )}
          </>
        ) : (
          <Link href={`/artist/${artist.slug}`}
            className="btn btn-secondary text-xs text-center w-full">
            View Profile <ChevronRight size={12} />
          </Link>
        )}
      </div>
    </div>
  );
}
