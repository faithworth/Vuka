'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Search, TrendingUp, Music, Disc, Users, Loader2 } from 'lucide-react';

interface Artist { slug: string; name: string; photoUrl: string; bio: string; genreTags: string[]; isVerified: boolean; totalPlays: number; }
interface Beat { id: string; slug: string; title: string; artworkUrl: string; basicPrice: number; artist: { name: string; slug: string }; genre: string; }
interface Release { id: string; slug: string; title: string; artworkUrl: string; price: number; artist: { name: string; slug: string }; releaseType: string; }

type Tab = 'artists' | 'beats' | 'releases';

export default function DiscoverPage() {
  const [tab, setTab] = useState<Tab>('artists');
  const [query, setQuery] = useState('');
  const [artists, setArtists] = useState<Artist[]>([]);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Load trending on mount
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/discovery/artists').then(r => r.json()).catch(() => ({ artists: [] })),
      fetch('/api/store/beats').then(r => r.json()).catch(() => ({ beats: [] })),
      fetch('/api/store/releases').then(r => r.json()).catch(() => ({ releases: [] })),
    ]).then(([a, b, r]) => {
      setArtists(a.artists || []);
      setBeats(b.beats || []);
      setReleases(r.releases || []);
      setLoading(false);
    });
  }, []);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/discovery/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const d = await res.json();
        setArtists(d.artists || []);
        setBeats(d.beats || []);
        setReleases(d.releases || []);
      }
    } catch {}
    setLoading(false);
  }, [query]);

  const tabs: { key: Tab; label: string; icon: typeof Users; count: number }[] = [
    { key: 'artists', label: 'Artists', icon: Users, count: artists.length },
    { key: 'beats', label: 'Beats', icon: Music, count: beats.length },
    { key: 'releases', label: 'Releases', icon: Disc, count: releases.length },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={20} style={{ color: 'var(--sky)' }} />
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              {searched ? 'Search Results' : 'Discover'}
            </h1>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {searched ? `Results for "${query}"` : 'Explore artists, beats and releases'}
          </p>
        </div>

        {/* Search */}
        <div className="flex gap-3 mb-8">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              className="input pl-10"
              placeholder="Search artists, beats, releases…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <button onClick={handleSearch} className="btn btn-primary px-6">
            Search
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 'fit-content' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: tab === t.key ? 'var(--sky)' : 'transparent',
                color: tab === t.key ? 'white' : 'var(--text-muted)',
              }}>
              <t.icon size={14} />
              {t.label}
              <span className="text-xs opacity-70">({t.count})</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--sky)' }} />
          </div>
        ) : (
          <>
            {/* Artists */}
            {tab === 'artists' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {artists.length === 0 ? (
                  <p className="col-span-3 text-center py-12" style={{ color: 'var(--text-muted)' }}>No artists found</p>
                ) : artists.map(a => (
                  <Link key={a.slug} href={`/artist/${a.slug}`} className="card p-4 flex gap-4 items-center">
                    {a.photoUrl ? (
                      <img src={a.photoUrl} alt={a.name} className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white text-lg"
                        style={{ background: 'var(--sky)' }}>
                        {a.name[0]}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate flex items-center gap-1" style={{ color: 'var(--text)' }}>
                        {a.name}
                        {a.isVerified && <span className="badge badge-sky text-[10px]">✓</span>}
                      </p>
                      {a.genreTags?.length > 0 && (
                        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                          {a.genreTags.slice(0, 2).join(' · ')}
                        </p>
                      )}
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {a.totalPlays?.toLocaleString() || 0} plays
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Beats */}
            {tab === 'beats' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {beats.length === 0 ? (
                  <p className="col-span-4 text-center py-12" style={{ color: 'var(--text-muted)' }}>No beats found</p>
                ) : beats.map(b => (
                  <Link key={b.id} href={`/beat/${b.slug}`} className="card overflow-hidden">
                    <div className="aspect-square bg-[var(--surface2)] relative">
                      {b.artworkUrl ? (
                        <img src={b.artworkUrl} alt={b.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music size={32} style={{ color: 'var(--text-muted)' }} />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{b.title}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{b.artist?.name}</p>
                      <p className="text-sm font-bold mt-1" style={{ color: 'var(--sky)' }}>R{b.basicPrice}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Releases */}
            {tab === 'releases' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {releases.length === 0 ? (
                  <p className="col-span-4 text-center py-12" style={{ color: 'var(--text-muted)' }}>No releases found</p>
                ) : releases.map(r => (
                  <Link key={r.id} href={`/release/${r.slug}`} className="card overflow-hidden">
                    <div className="aspect-square bg-[var(--surface2)] relative">
                      {r.artworkUrl ? (
                        <img src={r.artworkUrl} alt={r.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Disc size={32} style={{ color: 'var(--text-muted)' }} />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{r.title}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{r.artist?.name}</p>
                      <p className="text-xs mt-0.5 capitalize" style={{ color: 'var(--text-muted)' }}>{r.releaseType}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
