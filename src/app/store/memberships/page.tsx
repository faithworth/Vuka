// src/app/store/memberships/page.tsx
// Public browse page — /store/memberships
// Fans can discover and join artist membership tiers from a single surface.

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link                                          from 'next/link';
import { Navbar }                                    from '@/components/Navbar';
import {
  Users, Search, Zap, Check, ChevronLeft, ChevronRight, SlidersHorizontal,
} from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

// ─── Domain types ─────────────────────────────────────────────────────────────

interface Artist {
  id:        string;
  name:      string;
  slug:      string;
  photoUrl:  string;
  city:      string;
  country:   string;
  genreTags: string[];
}

interface Tier {
  id:          string;
  name:        string;
  price:       number;
  currency:    string;
  interval:    string;
  description: string;
  perks:       string[];
  isActive:    boolean;
  createdAt:   string;
  artist:      Artist;
  _count:      { memberships: number };
}

type SortOption = 'price_asc' | 'price_desc' | 'newest';

// ─── Constants ────────────────────────────────────────────────────────────────

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'price_asc',  label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'newest',     label: 'Newest'             },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function TierCard({ tier, onJoin, joining }: {
  tier:    Tier;
  onJoin:  (tier: Tier) => void;
  joining: boolean;
}) {
  return (
    <article
      className="flex flex-col rounded-2xl overflow-hidden transition-transform hover:scale-[1.015]"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Artist identity header */}
      <Link
        href={`/artist/${tier.artist.slug}?tab=membership`}
        className="flex items-center gap-3 px-5 pt-5 pb-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div
          className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center font-bold text-white"
          style={{ background: 'var(--sky)' }}
        >
          {tier.artist.photoUrl
            ? <img src={tier.artist.photoUrl} alt={tier.artist.name} className="w-full h-full object-cover" />
            : tier.artist.name[0]}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>
            {tier.artist.name}
          </p>
          {(tier.artist.city || tier.artist.country) && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {[tier.artist.city, tier.artist.country].filter(Boolean).join(', ')}
            </p>
          )}
        </div>
      </Link>

      {/* Tier body */}
      <div className="flex flex-col flex-1 p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-bold text-base leading-snug" style={{ color: 'var(--text)' }}>
            {tier.name}
          </h3>
          <div className="text-right flex-shrink-0">
            <span className="text-xl font-black" style={{ color: 'var(--sky)', fontFamily: 'var(--font-display)' }}>
              R{tier.price}
            </span>
            <span className="text-xs block" style={{ color: 'var(--text-muted)' }}>
              / {tier.interval}
            </span>
          </div>
        </div>

        {tier.description && (
          <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {tier.description}
          </p>
        )}

        {tier.perks.length > 0 && (
          <ul className="space-y-2 mb-5 flex-1">
            {tier.perks.map((perk, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text)' }}>
                <Check size={13} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--green)' }} />
                {perk}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between mt-auto pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          {tier._count.memberships > 0 ? (
            <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Users size={12} />
              {tier._count.memberships} member{tier._count.memberships !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Zap size={12} style={{ color: 'var(--gold)' }} />
              Be the first to join
            </span>
          )}

          <button
            onClick={() => onJoin(tier)}
            disabled={joining}
            className="flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm text-white transition-opacity disabled:opacity-60"
            style={{ background: 'var(--sky)' }}
          >
            {joining
              ? <><VukaLoader size={13} /> Joining…</>
              : <><Users size={13} /> Join</>}
          </button>
        </div>
      </div>
    </article>
  );
}

function TierCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden animate-pulse" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-3 px-5 pt-5 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="w-10 h-10 rounded-full" style={{ background: 'var(--surface2)' }} />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 rounded w-2/3" style={{ background: 'var(--surface2)' }} />
          <div className="h-2.5 rounded w-1/3" style={{ background: 'var(--surface2)' }} />
        </div>
      </div>
      <div className="p-5 space-y-3">
        <div className="h-4 rounded w-1/2" style={{ background: 'var(--surface2)' }} />
        <div className="h-3 rounded w-full" style={{ background: 'var(--surface2)' }} />
        <div className="h-3 rounded w-4/5" style={{ background: 'var(--surface2)' }} />
        <div className="h-9 rounded-xl mt-6" style={{ background: 'var(--surface2)' }} />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StoreMembershipsPage() {
  const [tiers,    setTiers]    = useState<Tier[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [pages,    setPages]    = useState(1);
  const [loading,  setLoading]  = useState(true);
  const [dbError,  setDbError]  = useState(false);
  const [q,        setQ]        = useState('');
  const [sort,     setSort]     = useState<SortOption>('price_asc');
  const [joiningId,setJoiningId]= useState<string | null>(null);
  const [joinError, setJoinError] = useState('');

  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const fetchTiers = useCallback((currentQ: string, currentSort: SortOption, currentPage: number) => {
    setLoading(true);
    const params = new URLSearchParams({
      q:    currentQ,
      sort: currentSort,
      page: String(currentPage),
    });
    fetch(`/api/store/memberships?${params}`)
      .then(r => r.json())
      .then(d => {
        setTiers(d.tiers  ?? []);
        setTotal(d.total  ?? 0);
        setPages(d.pages  ?? 1);
        if (d.dbError) setDbError(true);
      })
      .catch(() => setDbError(true))
      .finally(() => setLoading(false));
  }, []);

  // Debounce search input; immediate on sort/page change
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(
      () => fetchTiers(q, sort, page),
      q ? 300 : 0,
    );
    return () => clearTimeout(searchTimer.current);
  }, [q, sort, page, fetchTiers]);

  async function handleJoin(tier: Tier) {
    setJoinError('');
    setJoiningId(tier.id);

    const res = await fetch('/api/creator/memberships', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        tierId:          tier.id,
        artistId:        tier.artist.id,
        billingInterval: 'monthly',
      }),
    }).catch(() => null);

    if (!res) {
      setJoinError('Network error. Please try again.');
      setJoiningId(null);
      return;
    }

    if (res.status === 401) {
      window.location.href = `/auth/login?next=/store/memberships`;
      return;
    }

    const data = await res.json();

    if (!res.ok) {
      setJoinError(data.error ?? 'Failed to start checkout. Please try again.');
      setJoiningId(null);
      return;
    }

    if (data.authorizationUrl) {
      window.location.href = data.authorizationUrl;
    }
  }

  function handlePageChange(next: number) {
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">

        {/* ── Page header ─────────────────────────────────────── */}
        <div className="mb-8">
          <h1
            className="text-3xl md:text-4xl font-black mb-2"
            style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}
          >
            Artist Memberships
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Subscribe to your favourite artists and unlock exclusive perks, behind-the-scenes
            access, and direct support — every rand goes straight to the creator.
          </p>
        </div>

        {/* ── DB error banner ──────────────────────────────────── */}
        {dbError && (
          <div
            className="mb-6 p-4 rounded-xl text-sm"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--gold)' }}
          >
            <strong>⚠️ Database unavailable</strong> — Membership tiers could not be loaded. Please try again shortly.
          </div>
        )}

        {/* ── Join error ───────────────────────────────────────── */}
        {joinError && (
          <div
            className="mb-6 p-4 rounded-xl text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}
          >
            {joinError}
          </div>
        )}

        {/* ── Filters ──────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          {/* Search */}
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              value={q}
              onChange={e => { setQ(e.target.value); setPage(1); }}
              placeholder="Search memberships or artists…"
              className="w-full pl-10 pr-4 py-3 rounded-xl text-sm"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <SlidersHorizontal size={15} style={{ color: 'var(--text-muted)' }} />
            <select
              value={sort}
              onChange={e => { setSort(e.target.value as SortOption); setPage(1); }}
              className="px-3 py-3 rounded-xl text-sm"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Result count ─────────────────────────────────────── */}
        {!loading && !dbError && (
          <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>
            {total === 0
              ? 'No membership tiers found'
              : `${total} tier${total !== 1 ? 's' : ''} available`}
          </p>
        )}

        {/* ── Grid ─────────────────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => <TierCardSkeleton key={i} />)}
          </div>
        ) : tiers.length === 0 ? (
          <div
            className="text-center py-24 rounded-2xl"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <Users size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
            <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>
              {q ? 'No memberships match that search' : 'No memberships available yet'}
            </p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {q ? 'Try different keywords or clear the search' : 'Check back soon — artists are adding tiers'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {tiers.map(tier => (
              <TierCard
                key={tier.id}
                tier={tier}
                onJoin={handleJoin}
                joining={joiningId === tier.id}
              />
            ))}
          </div>
        )}

        {/* ── Pagination ───────────────────────────────────────── */}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-10">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
              className="p-2 rounded-xl disabled:opacity-30 transition-opacity"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Page {page} of {pages}
            </span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= pages}
              className="p-2 rounded-xl disabled:opacity-30 transition-opacity"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
