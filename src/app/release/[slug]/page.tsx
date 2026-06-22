'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { BuyModal } from '@/components/BuyModal';
import { formatCurrency } from '@/lib/utils';
import { ShoppingCart, Calendar } from 'lucide-react';
import Link from 'next/link';
import { usePlayer, PreviewPlayButton, PREVIEW_SECONDS, type PreviewTrack } from '@/components/NowPlayingBar';

export default function ReleasePage() {
  const { slug } = useParams<{ slug: string }>();
  const [release, setRelease] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [buyOpen, setBuyOpen] = useState(false);
  const { isTrackPlaying, elapsed } = usePlayer();

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
            <div className="text-xs font-bold mb-2 uppercase tracking-widest" style={{ color: 'var(--sky)' }}>
              {release.releaseType}
            </div>
            <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--text)' }}>{release.title}</h1>
            <Link href={`/artist/${release.artist.slug}`} className="text-lg hover:underline mb-4 block" style={{ color: 'var(--sky)' }}>
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
              style={{ background: 'var(--red)' }}>
              <ShoppingCart className="w-5 h-5" />
              {release.price === 0 ? 'Download Free' : 'Buy Now — Yebo ✓'}
            </button>
          </div>
        </div>

        {/* Track list */}
        {release.tracks?.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Tracks</h2>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{PREVIEW_SECONDS}s previews · for purchase, not streaming</span>
            </div>
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              {release.tracks.map((track: any, i: number) => {
                const playing = isTrackPlaying(track.id);
                const previewTrack: PreviewTrack = {
                  id: track.id,
                  title: track.title,
                  artist: release.artist.name,
                  artworkUrl: release.artworkUrl,
                  previewUrl: track.previewUrl,
                  href: `/release/${release.slug}`,
                  type: 'release',
                  analyticsId: release.id,
                };
                return (
                  <div key={track.id} className="flex items-center gap-4 p-4 border-b last:border-0 hover:opacity-80 transition-opacity"
                    style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    {track.previewUrl ? (
                      <PreviewPlayButton track={previewTrack} size={36} ring={playing} />
                    ) : (
                      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: 'var(--surface2)', color: 'var(--sky)' }}>
                        <span className="text-xs font-bold">{track.trackNumber || i + 1}</span>
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{track.title}</div>
                      {track.duration > 0 && (
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {Math.floor(track.duration/60)}:{String(track.duration%60).padStart(2,'0')}
                        </div>
                      )}
                    </div>
                    {playing && (
                      <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--sky)' }}>
                        0:{String(Math.floor(elapsed)).padStart(2, '0')} / 0:{PREVIEW_SECONDS}
                      </span>
                    )}
                  </div>
                );
              })}
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

