'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { BuyModal } from '@/components/BuyModal';
import { formatCurrency } from '@/lib/utils';
import { Play, ShoppingCart, Heart, Calendar, Music } from 'lucide-react';
import Link from 'next/link';

export default function ReleasePage() {
  const { slug } = useParams<{ slug: string }>();
  const [release, setRelease] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [buyOpen, setBuyOpen] = useState(false);
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/store/releases?slug=${slug}`)
      .then(r => r.json())
      .then(d => { setRelease(d.releases?.[0] || null); setLoading(false); });
  }, [slug]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <p style={{ color: 'var(--text-muted)' }}>Just now…</p>
    </div>
  );

  if (!release) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <p style={{ color: 'var(--text-muted)' }}>Eish. This release doesn't exist.</p>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Artwork */}
          <div className="md:w-64 flex-shrink-0">
            <div className="aspect-square rounded-2xl overflow-hidden flex items-center justify-center text-6xl"
              style={{ background: 'var(--surface2)' }}>
              {release.artworkUrl ? <img src={release.artworkUrl} className="w-full h-full object-cover" alt={release.title} /> : '🎵'}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="text-xs font-bold mb-2 uppercase tracking-widest" style={{ color: 'var(--purple-light)' }}>
              {release.releaseType}
            </div>
            <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--text)' }}>{release.title}</h1>
            <Link href={`/artist/${release.artist.slug}`} className="text-lg hover:underline mb-4 block" style={{ color: 'var(--purple-light)' }}>
              {release.artist.name}
            </Link>

            {release.releaseDate && (
              <div className="flex items-center gap-2 text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                <Calendar className="w-4 h-4" />
                {new Date(release.releaseDate).toLocaleDateString('en-ZA')}
              </div>
            )}

            {release.description && (
              <p className="mb-6 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{release.description}</p>
            )}

            {/* Price + Buy */}
            <div className="flex items-center gap-4 mb-6">
              <div className="text-3xl font-black" style={{ color: 'var(--gold)' }}>
                {release.payWhatWant ? `Pay what you want (min ${formatCurrency(release.minPrice)})` :
                  release.price === 0 ? 'Free' : formatCurrency(release.price)}
              </div>
            </div>

            <button onClick={() => setBuyOpen(true)}
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white transition-all hover:scale-105"
              style={{ background: 'linear-gradient(135deg, var(--purple), #5b21b6)' }}>
              <ShoppingCart className="w-5 h-5" />
              {release.price === 0 ? 'Download Free' : 'Buy Now — Yebo ✓'}
            </button>
          </div>
        </div>

        {/* Track list */}
        {release.tracks?.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text)' }}>Tracks</h2>
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              {release.tracks.map((track: any, i: number) => (
                <div key={track.id} className="flex items-center gap-4 p-4 border-b last:border-0 hover:opacity-80 transition-opacity"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--surface2)', color: 'var(--purple-light)' }}>
                    {playingTrack === track.id ? '▐▐' : <span className="text-xs font-bold">{track.trackNumber}</span>}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{track.title}</div>
                    {track.duration > 0 && (
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {Math.floor(track.duration/60)}:{String(track.duration%60).padStart(2,'0')}
                      </div>
                    )}
                  </div>
                  {track.previewUrl && (
                    <button onClick={() => setPlayingTrack(playingTrack===track.id?null:track.id)}
                      className="p-2 rounded-full" style={{ background: 'var(--purple)', color: 'white' }}>
                      <Play className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {release.credits && (
          <div className="mt-8 p-4 rounded-xl" style={{ background: 'var(--surface)' }}>
            <h3 className="font-bold mb-2" style={{ color: 'var(--text)' }}>Credits</h3>
            <p className="text-sm whitespace-pre-line" style={{ color: 'var(--text-muted)' }}>{release.credits}</p>
          </div>
        )}
      </div>

      {buyOpen && (
        <BuyModal release={release} onClose={() => setBuyOpen(false)} />
      )}
    </div>
  );
}
