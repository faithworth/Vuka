'use client';
import { useState, useEffect, useRef } from 'react';
import { Navbar } from '@/components/Navbar';
import { BeatCard } from '@/components/BeatCard';
import { ReleaseCard } from '@/components/ReleaseCard';
import { BuyModal } from '@/components/BuyModal';
import { ShoppingCart } from 'lucide-react';

const GENRES = ['Afrobeats', 'Amapiano', 'Hip Hop', 'Trap', 'R&B', 'Drill', 'Gqom', 'House'];
const MOODS  = ['Dark', 'Happy', 'Aggressive', 'Chill', 'Romantic', 'Epic'];
const SORTS  = [
  { value: 'newest',     label: 'Newest' },
  { value: 'plays',      label: 'Most Played' },
  { value: 'price_asc',  label: 'Price ↑' },
  { value: 'price_desc', label: 'Price ↓' },
];

export default function StorePage({ defaultFilter }: { defaultFilter?: string }) {
  const [beats,    setBeats]    = useState<any[]>([]);
  const [releases, setReleases] = useState<any[]>([]);
  const [videos,   setVideos]   = useState<any[]>([]);
  const [samples,  setSamples]  = useState<any[]>([]);
  const [merch,    setMerch]    = useState<any[]>([]);
  const [artists,  setArtists]  = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [dbError,  setDbError]  = useState(false);
  const [q,        setQ]        = useState('');
  const [genre,    setGenre]    = useState('');
  const [mood,     setMood]     = useState('');
  const [sort,     setSort]     = useState('newest');
  const [tab, setTab] = useState<'all' | 'beats' | 'releases' | 'videos' | 'samples' | 'merch'>(
    defaultFilter === 'beat'    ? 'beats'    :
    defaultFilter === 'release' ? 'releases' :
    defaultFilter === 'video'   ? 'videos'   :
    defaultFilter === 'sample'  ? 'samples'  :
    defaultFilter === 'merch'   ? 'merch'    : 'all'
  );
  const [buyBeat,  setBuyBeat]  = useState<any>(null);
  const [buyMerch, setBuyMerch] = useState<any>(null);
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  const searchTimer = useRef<NodeJS.Timeout>();

  useEffect(() => {
    fetch('/api/wishlist').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.items) setWishlist(new Set(d.items.map((i: any) => i.itemId)));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      Promise.all([
        fetch(`/api/store/beats?q=${q}&genre=${genre}&mood=${mood}&sort=${sort}`).then(r => r.json()),
        fetch(`/api/store/releases?q=${q}&sort=${sort}`).then(r => r.json()),
        fetch(`/api/store/videos?q=${q}&sort=${sort}`).then(r => r.json()),
        fetch(`/api/store/samples?q=${q}&sort=${sort}`).then(r => r.json()),
        fetch(`/api/store/merch?q=${q}&sort=${sort}`).then(r => r.json()),
        q.length >= 2 ? fetch(`/api/store/artists?q=${q}`).then(r => r.json()) : Promise.resolve({ artists: [] }),
      ]).then(([b, r, v, s, m, a]) => {
        setBeats(b.beats || []);
        setReleases(r.releases || []);
        setVideos(v.videos || []);
        setSamples(s.samples || []);
        setMerch(m.merch || []);
        setArtists(a.artists || []);
        if (b.dbError || r.dbError) setDbError(true);
        setLoading(false);
      }).catch(() => { setDbError(true); setLoading(false); });
    }, q ? 300 : 0);
  }, [q, genre, mood, sort]);

  async function toggleWishlist(itemId: string, itemType: 'beat' | 'release', e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    const res = await fetch('/api/wishlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, itemType }),
    });
    if (res.ok) {
      setWishlist(prev => {
        const next = new Set(prev);
        if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
        return next;
      });
    } else if (res.status === 401) {
      window.location.href = '/auth/login';
    }
  }

  const items =
    tab === 'beats'    ? beats    :
    tab === 'releases' ? releases :
    tab === 'videos'   ? videos   :
    tab === 'samples'  ? samples  :
    tab === 'merch'    ? merch    :
    [...beats, ...releases].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const TABS: { value: typeof tab; label: string; count: number }[] = [
    { value: 'all',      label: 'All',      count: beats.length + releases.length },
    { value: 'beats',    label: 'Beats',    count: beats.length },
    { value: 'releases', label: 'Releases', count: releases.length },
    { value: 'videos',   label: 'Videos',   count: videos.length },
    { value: 'samples',  label: 'Samples',  count: samples.length },
    { value: 'merch',    label: 'Merch',    count: merch.length },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-black mb-1" style={{ color: 'var(--text)' }}>Browse & Support</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Every purchase supports independent artists directly 💚</p>
          </div>
        </div>

        {dbError && (
          <div className="mb-6 p-4 rounded-xl" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--gold)' }}>
            <strong>⚠️ Database not connected</strong> — The store is empty because the database isn&apos;t configured yet.
          </div>
        )}

        {/* Search + filters */}
        <div className="flex flex-col gap-3 mb-8">
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search beats, releases, merch, artists…"
            className="w-full px-4 py-3 rounded-xl"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0" style={{ scrollbarWidth: 'none' }}>
            <select value={genre} onChange={e => setGenre(e.target.value)} className="px-3 py-2.5 rounded-xl flex-shrink-0 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              <option value="">All Genres</option>
              {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select value={mood} onChange={e => setMood(e.target.value)} className="px-3 py-2.5 rounded-xl flex-shrink-0 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              <option value="">All Moods</option>
              {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={sort} onChange={e => setSort(e.target.value)} className="px-3 py-2.5 rounded-xl flex-shrink-0 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {/* Artist search results */}
        {q.length >= 2 && artists.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-bold mb-3 uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Artists</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {artists.map((artist: any) => (
                <a key={artist.id} href={`/artist/${artist.slug}`}
                  className="flex flex-col items-center p-4 rounded-2xl text-center transition-all hover:scale-[1.02]"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="w-16 h-16 rounded-2xl overflow-hidden mb-3 flex items-center justify-center" style={{ background: 'var(--surface2)' }}>
                    {artist.photoUrl
                      ? <img src={artist.photoUrl} alt={artist.name} className="w-full h-full object-cover" />
                      : <span className="text-2xl">🎤</span>}
                  </div>
                  <p className="font-bold text-sm truncate w-full" style={{ color: 'var(--text)' }}>{artist.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{artist.city || artist.country}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--sky)' }}>
                    {artist._count.beats} beats · {artist._count.releases} releases
                  </p>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {TABS.map(t => (
            <button key={t.value} onClick={() => setTab(t.value)}
              className="px-5 py-2 rounded-lg font-medium transition-colors"
              style={{ background: tab === t.value ? 'var(--sky)' : 'var(--surface)', border: '1px solid var(--border)', color: tab === t.value ? 'white' : 'var(--text-muted)' }}>
              {t.label}
              {t.count > 0 && <span className="ml-1.5 text-xs opacity-70">({t.count})</span>}
            </button>
          ))}
        </div>

        {loading ? (
          <div className={`grid gap-4 ${tab === 'videos' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'}`}>
            {[...Array(8)].map((_, i) => (
              <div key={i} className="aspect-square rounded-2xl animate-pulse" style={{ background: 'var(--surface)' }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-4xl mb-4">{tab === 'merch' ? '👕' : '🎵'}</p>
            <p style={{ color: 'var(--text-muted)' }}>Nothing matching that — try something else</p>
          </div>
        ) : (
          <div className={`grid gap-4 ${tab === 'videos' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'}`}>
            {tab === 'merch'
              ? merch.map((item: any) => <MerchCard key={item.id} item={item} onBuy={() => setBuyMerch(item)} />)
              : items.map((item: any) => (
                  item.basicPrice !== undefined ? (
                    <BeatCard key={item.id} beat={item} onBuy={setBuyBeat}
                      wishlisted={wishlist.has(item.id)}
                      onWishlist={(e) => toggleWishlist(item.id, 'beat', e)} />
                  ) : item.videoUrl !== undefined ? (
                    <VideoCard key={item.id} video={item} />
                  ) : item.sampleUrl !== undefined || item.fileUrl !== undefined ? (
                    <SampleCard key={item.id} sample={item} />
                  ) : item.imageUrl !== undefined && item.stock !== undefined ? (
                    <MerchCard key={item.id} item={item} onBuy={() => setBuyMerch(item)} />
                  ) : (
                    <ReleaseCard key={item.id} release={item}
                      wishlisted={wishlist.has(item.id)}
                      onWishlist={(e) => toggleWishlist(item.id, 'release', e)} />
                  )
                ))
            }
          </div>
        )}
      </div>

      {buyBeat && <BuyModal beat={buyBeat} onClose={() => setBuyBeat(null)} />}
      {buyMerch && (
        <BuyModal
          itemType="merch"
          release={{
            id: buyMerch.id,
            title: buyMerch.title,
            artworkUrl: buyMerch.imageUrl || '',
            price: buyMerch.price,
            minPrice: buyMerch.price,
            payWhatWant: false,
            artist: { name: buyMerch.artist?.name || '' },
          }}
          onClose={() => setBuyMerch(null)}
        />
      )}
    </div>
  );
}

function MerchCard({ item, onBuy }: { item: any; onBuy: () => void }) {
  return (
    <div className="group block rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <a href={`/merch/${item.slug}`} className="block">
        <div className="aspect-square overflow-hidden flex items-center justify-center" style={{ background: 'var(--surface2)' }}>
          {item.imageUrl
            ? <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
            : <span className="text-5xl">👕</span>}
        </div>
      </a>
      <div className="p-3">
        <a href={`/merch/${item.slug}`} className="hover:underline">
          <h3 className="font-bold text-sm truncate" style={{ color: 'var(--text)' }}>{item.title}</h3>
        </a>
        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{item.artist?.name}</p>
        <div className="flex items-center justify-between mt-2">
          <span className="font-bold text-sm" style={{ color: 'var(--sky)' }}>R{item.price}</span>
          {item.stock > 0 ? (
            <button onClick={onBuy}
              className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg text-white"
              style={{ background: 'var(--sky)' }}>
              <ShoppingCart size={11} /> Buy
            </button>
          ) : (
            <a href={`/merch/${item.slug}`}
              className="text-xs px-2.5 py-1 rounded-lg"
              style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
              View
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function VideoCard({ video }: { video: any }) {
  return (
    <a href={`/videos/${video.slug}`} className="group block rounded-2xl overflow-hidden transition-transform hover:scale-[1.02]"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="aspect-video overflow-hidden relative" style={{ background: 'var(--surface2)' }}>
        {video.thumbnailUrl
          ? <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-5xl">🎬</div>}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)' }}>
            <span className="text-white text-xl pl-1">▶</span>
          </div>
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-bold truncate" style={{ color: 'var(--text)' }}>{video.title}</h3>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{video.artist?.name}</p>
        <p className="font-bold mt-2" style={{ color: 'var(--sky)' }}>{video.price > 0 ? `R${video.price}` : 'Free'}</p>
      </div>
    </a>
  );
}

function SampleCard({ sample }: { sample: any }) {
  return (
    <a href={`/samples/${sample.slug}`} className="group block rounded-2xl overflow-hidden transition-transform hover:scale-[1.02]"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="aspect-square overflow-hidden relative">
        {sample.artworkUrl
          ? <img src={sample.artworkUrl} alt={sample.title} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-5xl" style={{ background: 'var(--surface2)' }}>🎹</div>}
      </div>
      <div className="p-4">
        <h3 className="font-bold truncate" style={{ color: 'var(--text)' }}>{sample.title}</h3>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{sample.artist?.name}{sample.bpm ? ` · ${sample.bpm} BPM` : ''}</p>
        <p className="font-bold mt-2" style={{ color: 'var(--sky)' }}>R{sample.price}</p>
      </div>
    </a>
  );
}
