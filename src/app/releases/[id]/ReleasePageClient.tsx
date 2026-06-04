'use client';
// ============================================================
// VUKA — Release Page Client (Phase 4)
// Waveform mini-players, DSP "Listen On" buttons, share tools.
// ============================================================

import { useState, useRef } from 'react';
import Navbar from '@/components/Navbar';
import { BuyModal } from '@/components/BuyModal';
import { formatCurrency } from '@/lib/utils';
import {
  Play, Pause, ShoppingCart, Calendar, Music,
  Share2, Twitter, Link2, Check,
} from 'lucide-react';
import Link from 'next/link';

const DSP_LINKS = [
  { name: 'Spotify',     slug: 'spotify',       color: '#1db954', icon: '🎵' },
  { name: 'Apple Music', slug: 'apple-music',   color: '#fa243c', icon: '🍎' },
  { name: 'YouTube Music', slug: 'youtube-music', color: '#ff0000', icon: '▶' },
  { name: 'Boomplay',   slug: 'boomplay',       color: '#f57c00', icon: '🎧' },
  { name: 'Audiomack',  slug: 'audiomack',      color: '#ff6600', icon: '🎶' },
  { name: 'Deezer',     slug: 'deezer',         color: '#a238ff', icon: '🎼' },
  { name: 'Tidal',      slug: 'tidal',          color: '#00cccb', icon: '🌊' },
  { name: 'SoundCloud', slug: 'soundcloud',     color: '#ff5500', icon: '☁' },
];

export default function ReleasePageClient({ release }: { release: any }) {
  const [buyOpen, setBuyOpen]       = useState(false);
  const [playingId, setPlayingId]   = useState<string | null>(null);
  const [copied, setCopied]         = useState(false);
  const playedRef = useRef<Set<string>>(new Set());

  function handlePlay(trackId: string) {
    if (playingId === trackId) {
      setPlayingId(null);
      return;
    }
    setPlayingId(trackId);
    // Fire play event once per release per page load
    if (!playedRef.current.has(release.id)) {
      playedRef.current.add(release.id);
      fetch('/api/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: release.id, itemType: 'release' }),
      }).catch(() => {});
    }
  }

  function shareTwitter() {
    const url   = `${window.location.origin}/releases/${release.slug || release.id}`;
    const text  = `Check out "${release.title}" by ${release.artist?.name} on @VukaMusic`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
  }

  function copyLink() {
    const url = `${window.location.origin}/releases/${release.slug || release.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  function shareWhatsApp() {
    const url  = `${window.location.origin}/releases/${release.slug || release.id}`;
    const text = `Check out "${release.title}" by ${release.artist?.name} on Vuka: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  // Filter DSP links — only show if release has a matching distribution URL
  const dspLinks = DSP_LINKS.filter(d =>
    release.dspDeliveries?.some((del: any) => del.dsp?.toLowerCase().includes(d.slug) && del.storeUrl)
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">

        {/* JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'MusicAlbum',
              name: release.title,
              byArtist: { '@type': 'MusicGroup', name: release.artist?.name },
              image: release.artworkUrl,
              url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/releases/${release.slug || release.id}`,
            }),
          }}
        />

        <div className="flex flex-col md:flex-row gap-8 mb-10">

          {/* Artwork */}
          <div className="md:w-64 flex-shrink-0">
            <div className="aspect-square rounded-2xl overflow-hidden flex items-center justify-center text-6xl shadow-2xl"
              style={{ background: 'var(--surface2)' }}>
              {release.artworkUrl
                ? <img src={release.artworkUrl} className="w-full h-full object-cover" alt={release.title} />
                : '🎵'}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="text-xs font-bold mb-2 uppercase tracking-widest" style={{ color: 'var(--sky)' }}>
              {release.releaseType}
            </div>

            <h1 className="text-3xl md:text-4xl font-black mb-2 leading-tight" style={{ color: 'var(--text)' }}>
              {release.title}
            </h1>

            <Link href={`/artist/${release.artist?.slug}`}
              className="text-lg hover:underline mb-3 block font-semibold"
              style={{ color: 'var(--sky)' }}>
              {release.artist?.name}
            </Link>

            {/* Meta row */}
            <div className="flex items-center gap-4 text-sm mb-4 flex-wrap" style={{ color: 'var(--text-muted)' }}>
              {release.releaseDate && (
                <div className="flex items-center gap-1.5">
                  <Calendar size={14} />
                  {new Date(release.releaseDate).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              )}
              {release.tracks?.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Music size={14} />
                  {release.tracks.length} {release.tracks.length === 1 ? 'track' : 'tracks'}
                </div>
              )}
            </div>

            {release.description && (
              <p className="mb-5 leading-relaxed text-sm" style={{ color: 'var(--text-muted)' }}>
                {release.description}
              </p>
            )}

            {/* Genre tags */}
            {release.artist?.genreTags?.length > 0 && (
              <div className="flex gap-2 mb-5 flex-wrap">
                {release.artist.genreTags.map((g: string) => (
                  <span key={g} className="text-xs px-2 py-1 rounded-full"
                    style={{ background: 'var(--surface2)', color: 'var(--sky)' }}>
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Price + Buy */}
            {release.price !== undefined && (
              <div className="flex items-center gap-4 mb-5 flex-wrap">
                <div className="text-2xl font-black" style={{ color: 'var(--gold)' }}>
                  {release.payWhatWant
                    ? `Pay what you want — min ${formatCurrency(release.minPrice || 0)}`
                    : release.price === 0 ? 'Free' : formatCurrency(release.price)}
                </div>
              </div>
            )}

            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => setBuyOpen(true)}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white transition-all hover:scale-105"
                style={{ background: 'linear-gradient(135deg, var(--sky), var(--sky-dark))' }}>
                <ShoppingCart size={18} />
                {release.price === 0 ? 'Download Free' : 'Buy Now — Yebo ✓'}
              </button>

              {/* Share buttons */}
              <button onClick={shareWhatsApp}
                className="flex items-center gap-2 px-4 py-3 rounded-xl font-semibold text-white text-sm"
                style={{ background: '#25d366' }}>
                <Share2 size={15} /> WhatsApp
              </button>
              <button onClick={shareTwitter}
                className="p-3 rounded-xl transition-colors"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <Twitter size={16} />
              </button>
              <button onClick={copyLink}
                className="p-3 rounded-xl transition-colors"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: copied ? 'var(--green)' : 'var(--text-muted)' }}>
                {copied ? <Check size={16} /> : <Link2 size={16} />}
              </button>
            </div>
          </div>
        </div>

        {/* Track list with mini waveform players */}
        {release.tracks?.length > 0 && (
          <div className="mb-10">
            <h2 className="text-xl font-black mb-4" style={{ color: 'var(--text)' }}>Tracklist</h2>
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {release.tracks.map((track: any, i: number) => (
                <div key={track.id}
                  className="flex items-center gap-4 p-4 border-b last:border-0 transition-colors hover:opacity-90"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>

                  {/* Track number / play button */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: playingId === track.id ? 'var(--sky)' : 'var(--surface2)' }}>
                    {track.previewUrl ? (
                      <button onClick={() => handlePlay(track.id)} className="w-full h-full flex items-center justify-center"
                        style={{ color: playingId === track.id ? 'white' : 'var(--text-muted)' }}>
                        {playingId === track.id ? <Pause size={14} /> : <Play size={14} />}
                      </button>
                    ) : (
                      <span className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>
                        {track.trackNumber || i + 1}
                      </span>
                    )}
                  </div>

                  {/* Track info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>
                      {track.title}
                    </div>
                    {track.duration > 0 && (
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, '0')}
                      </div>
                    )}
                    {/* Featured artists */}
                    {track.featuredArtists?.length > 0 && (
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        ft. {track.featuredArtists.join(', ')}
                      </div>
                    )}
                  </div>

                  {/* Playing indicator */}
                  {playingId === track.id && (
                    <div className="flex items-end gap-0.5 h-5 flex-shrink-0">
                      {[0, 1, 2].map(j => (
                        <div key={j} className="w-1 rounded-full waveform-bar-playing"
                          style={{
                            height: 8 + j * 4,
                            background: 'var(--sky)',
                            animationDelay: `${j * 0.15}s`,
                          }} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DSP "Listen On" buttons */}
        {dspLinks.length > 0 && (
          <div className="mb-10">
            <h2 className="text-xl font-black mb-4" style={{ color: 'var(--text)' }}>Listen On</h2>
            <div className="flex flex-wrap gap-3">
              {dspLinks.map(dsp => {
                const delivery = release.dspDeliveries?.find((d: any) =>
                  d.dsp?.toLowerCase().includes(dsp.slug)
                );
                return (
                  <a key={dsp.name} href={delivery?.storeUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white transition-all hover:scale-105"
                    style={{ background: dsp.color }}>
                    <span>{dsp.icon}</span>
                    {dsp.name}
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Credits */}
        {(release.credits || release.copyrightHolder) && (
          <div className="p-5 rounded-2xl mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="font-black text-sm mb-3" style={{ color: 'var(--text)' }}>Credits</h3>
            {release.credits && (
              <p className="text-sm whitespace-pre-line leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {release.credits}
              </p>
            )}
            {release.copyrightHolder && (
              <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                © {release.copyrightYear || new Date().getFullYear()} {release.copyrightHolder}
              </p>
            )}
          </div>
        )}

        {/* Fee note */}
        <div className="text-center text-xs py-4" style={{ color: 'var(--text-muted)' }}>
          Vuka retains 2% of each sale to cover platform costs. The artist receives 98%.
        </div>
      </div>

      {/* Buy modal */}
      {buyOpen && (
        <BuyModal release={release} onClose={() => setBuyOpen(false)} />
      )}

      {/* Hidden audio player */}
      {playingId && (
        <audio
          key={playingId}
          src={release.tracks?.find((t: any) => t.id === playingId)?.previewUrl}
          autoPlay
          onEnded={() => setPlayingId(null)}
        />
      )}
    </div>
  );
}
