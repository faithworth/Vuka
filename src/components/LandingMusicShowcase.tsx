'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Music2 } from 'lucide-react';

type Beat = { id: string; slug: string; title: string; artworkUrl: string | null; previewUrl: string | null; basicPrice: number; artist: { name: string; slug: string } };
type Release = { id: string; slug: string; title: string; artworkUrl: string | null; price: number | null; minPrice: number | null; tracks: { previewUrl: string | null }[]; artist: { name: string; slug: string } };
type Artist = { id: string; slug: string; name: string; photoUrl: string | null; city: string; country: string; genreTags: string[] };

export default function LandingMusicShowcase() {
  const [beats, setBeats] = useState<Beat[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [playing, setPlaying] = useState('');
  useEffect(() => {
    let live = true;
    Promise.all([
      fetch('/api/store/beats?sort=newest').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/store/releases?sort=newest').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/cms/featured-artists').then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([b, r, a]) => {
      if (!live) return;
      setBeats((b?.beats || []).slice(0, 4));
      setReleases((r?.releases || []).slice(0, 4));
      setArtists((a?.artists || []).map((x: any) => x.artist || x).filter((x: any) => x?.slug && x?.name).slice(0, 6));
    });
    return () => { live = false; };
  }, []);
  const items = [
    ...beats.map(x => ({ ...x, kind: 'Beat', href: '/store', audio: x.previewUrl || '', price: x.basicPrice })),
    ...releases.map(x => ({ ...x, kind: 'Release', href: '/store', audio: x.tracks?.find(t => t.previewUrl)?.previewUrl || '', price: x.price ?? x.minPrice })),
  ].slice(0, 8);
  const play = (id: string, src: string) => {
    const audio = document.getElementById('landing-showcase-audio') as HTMLAudioElement | null;
    if (!audio) return;
    if (playing === id) { audio.pause(); setPlaying(''); return; }
    audio.src = src;
    void audio.play().then(() => setPlaying(id)).catch(() => setPlaying(''));
  };
  return <>
    <section className="py-20 px-4" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div><p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--sky)' }}>Fresh from Vuka</p><h2 className="text-3xl md:text-4xl font-bold">Live Vuka Music Catalogue</h2><p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>Music uploaded by artists and producers on Vuka.</p></div>
          <Link href="/store" className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--sky)' }}>Explore the store <ArrowRight size={16} /></Link>
        </div>
        {items.length ? <div className="grid grid-cols-2 md:grid-cols-4 gap-5">{items.map(x => <article key={x.kind + x.id} className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Link href={x.href} className="block aspect-square" style={{ background: 'var(--surface2)' }}>{x.artworkUrl ? <img src={x.artworkUrl} alt={x.title} loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Music2 size={32} /></div>}</Link>
          <div className="p-3"><p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--sky)' }}>{x.kind}</p><Link href={x.href} className="font-semibold text-sm block truncate">{x.title}</Link><Link href={'/artist/' + x.artist.slug} className="text-xs block mt-1 truncate" style={{ color: 'var(--text-muted)' }}>{x.artist.name}</Link><div className="flex items-center justify-between mt-3"><span className="text-xs font-semibold">{typeof x.price === 'number' && x.price > 0 ? 'R' + x.price.toFixed(2) : 'View in store'}</span>{x.audio ? <button type="button" onClick={() => play(x.id, x.audio)} aria-label="Play preview" className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'var(--sky)', color: '#fff' }}>{playing === x.id ? 'Pause' : 'Play'}</button> : null}</div></div>
        </article>)}</div> : <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Browse the latest music in the <Link href="/store" className="underline">Vuka store</Link>.</p>}
        <audio id="landing-showcase-audio" onEnded={() => setPlaying('')} className="hidden" />
      </div>
    </section>
    <section className="py-20 px-4" style={{ background: 'var(--surface)', color: 'var(--text)' }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8"><div><p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--sky)' }}>The artists</p><h2 className="text-3xl md:text-4xl font-bold">Meet the People Behind the Sound</h2><p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>Get to know the artists creating music on Vuka.</p></div><Link href="/browse-artists" className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--sky)' }}>Discover artists <ArrowRight size={16} /></Link></div>
        {artists.length ? <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">{artists.map(a => <Link key={a.id} href={'/artist/' + a.slug} className="rounded-2xl p-3 text-center transition-transform hover:-translate-y-1" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}><div className="aspect-square rounded-xl overflow-hidden mb-3" style={{ background: 'var(--surface2)' }}>{a.photoUrl ? <img src={a.photoUrl} alt={a.name} loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Music2 size={28} /></div>}</div><p className="font-semibold text-sm truncate">{a.name}</p><p className="text-xs mt-1 truncate" style={{ color: 'var(--text-muted)' }}>{a.genreTags?.slice(0, 2).join(' · ') || a.city || a.country || 'Independent artist'}</p></Link>)}</div> : <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Visit <Link href="/browse-artists" className="underline">Browse Artists</Link> to discover artist profiles.</p>}
      </div>
    </section>
  </>;
}
