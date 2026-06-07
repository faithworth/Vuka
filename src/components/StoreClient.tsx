'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BeatCard } from '@/components/BeatCard';
import { BuyModal } from '@/components/BuyModal';
import { Search, Grid, List, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';

type Beat = {
  id: string; slug: string; title: string; genre: string; mood: string;
  bpm: number; keySignature: string; basicPrice: number; premiumPrice: number;
  exclPrice: number; artworkUrl: string; previewUrl: string; waveformData: number[];
  plays: number; sales: number; tags: string[]; isExclusive: boolean;
  artist: { name: string; slug: string };
};
type Release = {
  id: string; slug: string; title: string; releaseType: string; price: number;
  minPrice: number; payWhatWant: boolean; artworkUrl: string; plays: number; description: string;
  artist: { name: string; slug: string };
};

const GENRES = ['Afrobeats','Amapiano','Hip Hop','Trap','Gqom','R&B','Gospel','Kwaito','Drill','Pop'];

export default function StoreClient({ initialBeats, initialReleases }: { initialBeats: Beat[]; initialReleases: Release[] }) {
  const router = useRouter();
  const [beats, setBeats] = useState<Beat[]>(initialBeats);
  const [releases, setReleases] = useState<Release[]>(initialReleases);
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('newest');
  const [view, setView] = useState<'grid'|'list'>('grid');
  const [loading, setLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [buyingBeat, setBuyingBeat] = useState<Beat | null>(null);

  useEffect(() => {
    const h = setTimeout(fetchData, 300);
    return () => clearTimeout(h);
  }, [search, genre, type, sort]);

  async function fetchData() {
    setLoading(true);
    const p = new URLSearchParams();
    if (search) p.set('q', search);
    if (genre) p.set('genre', genre);
    if (sort !== 'newest') p.set('sort', sort);
    try {
      const [br, rr] = await Promise.all([
        type === 'releases' ? Promise.resolve(null) : fetch(`/api/store/beats?${p}`).then(r => r.json()),
        type === 'beats' ? Promise.resolve(null) : fetch(`/api/store/releases?${p}`).then(r => r.json()),
      ]);
      if (br) setBeats(br.beats || []);
      if (rr) setReleases(rr.releases || []);
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Filter bar */}
      <div className="sticky top-16 z-40 border-b" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap gap-3 items-center">
          <div className="flex-1 min-w-[180px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--sky)' }} />
            <input type="text" placeholder="Search beats, artists, genres…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg text-sm border input" />
          </div>
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            {['all','beats','releases'].map(t => (
              <button key={t} onClick={() => setType(t)}
                className="px-3 py-2 text-xs font-semibold transition-colors capitalize"
                style={{ background: type===t?'var(--sky)':'var(--surface)', color: type===t?'white':'var(--text-muted)' }}>
                {t}
              </button>
            ))}
          </div>
          <select value={sort} onChange={e => setSort(e.target.value)} className="input px-3 py-2 text-sm" style={{ width: 'auto' }}>
            <option value="newest">Newest</option>
            <option value="plays">Most Played</option>
            <option value="price_asc">Price ↑</option>
            <option value="price_desc">Price ↓</option>
          </select>
          <div className="flex gap-1">
            <button onClick={() => setView('grid')} className="p-2 rounded" style={{ background: view==='grid'?'var(--sky)':'var(--surface)', color:'white' }}><Grid className="w-4 h-4" /></button>
            <button onClick={() => setView('list')} className="p-2 rounded" style={{ background: view==='list'?'var(--sky)':'var(--surface)', color:'white' }}><List className="w-4 h-4" /></button>
          </div>
          <button onClick={() => setFiltersOpen(!filtersOpen)} className="p-2 rounded flex items-center gap-1 text-sm"
            style={{ background: filtersOpen?'var(--sky)':'var(--surface)', color: filtersOpen?'white':'var(--text-muted)' }}>
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
        {filtersOpen && (
          <div className="max-w-7xl mx-auto px-4 pb-3 flex flex-wrap gap-2">
            {['', ...GENRES].map(g => (
              <button key={g||'all'} onClick={() => setGenre(g)}
                className="px-3 py-1 rounded-full text-xs border transition-colors"
                style={{ background: genre===g?'var(--sky)':'transparent', borderColor:'var(--border)', color: genre===g?'white':'var(--text-muted)' }}>
                {g || 'All Genres'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 pb-24">
        {loading && <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>Just now…</p>}
        {/* Fee transparency banner */}
        <div style={{ background: 'rgba(201,162,39,0.08)', border: '1px solid rgba(201,162,39,0.25)', borderRadius: 8, padding: '8px 14px', marginBottom: 16, fontSize: 12, color: 'var(--text-muted)' }}>
          ✦ Artists keep the majority of every sale. Vuka retains a small platform fee.
        </div>

        {!loading && beats.length === 0 && releases.length === 0 && (
          <div className="text-center py-20">
            <p className="text-3xl mb-2">🎵</p>
            <p style={{ color: 'var(--text-muted)' }}>Nothing matching that — try something else</p>
          </div>
        )}

        {/* Beats */}
        {beats.length > 0 && (type==='all'||type==='beats') && (
          <div className="mb-10">
            {type==='all' && <h2 className="text-lg font-bold mb-4" style={{ color:'var(--text)' }}>Beats</h2>}
            <div className={view==='grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'space-y-3'}>
              {beats.map(beat => (
                <BeatCard key={beat.id} beat={beat} onBuy={() => setBuyingBeat(beat)} />
              ))}
            </div>
          </div>
        )}

        {/* Releases */}
        {releases.length > 0 && (type==='all'||type==='releases') && (
          <div>
            {type==='all' && <h2 className="text-lg font-bold mb-4" style={{ color:'var(--text)' }}>Releases</h2>}
            <div className={view==='grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'space-y-3'}>
              {releases.map(release => (
                <div key={release.id} className="card p-4 cursor-pointer hover:scale-[1.02] transition-transform"
                  onClick={() => router.push(`/release/${release.slug}`)}>
                  <div className="aspect-square rounded-xl mb-3 overflow-hidden flex items-center justify-center text-4xl"
                    style={{ background: 'var(--surface2)' }}>
                    {release.artworkUrl ? <img src={release.artworkUrl} className="w-full h-full object-cover" alt={release.title} /> : '🎵'}
                  </div>
                  <div className="badge badge-sky mb-2">{release.releaseType}</div>
                  <div className="font-semibold text-sm truncate mb-1" style={{ color:'var(--text)' }}>{release.title}</div>
                  <Link href={`/artist/${release.artist.slug}`} onClick={e => e.stopPropagation()}
                    className="text-xs hover:underline" style={{ color:'var(--text-muted)' }}>{release.artist.name}</Link>
                  <div className="mt-3 font-black" style={{ color:'var(--gold)' }}>
                    {release.price === 0 ? 'Free' : `R${release.price}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {buyingBeat && <BuyModal beat={buyingBeat} onClose={() => setBuyingBeat(null)} />}

    </div>
  );
}
