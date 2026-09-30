'use client';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { formatCurrency, generateWaveformFallback } from '@/lib/utils';
import { usePlayer, PreviewPlayButton, type PreviewTrack } from '@/components/NowPlayingBar';

interface Beat {
  id: string;
  slug: string;
  title: string;
  bpm: number;
  keySignature: string;
  genre: string;
  mood: string;
  artworkUrl: string;
  previewUrl: string;
  basicPrice: number;
  plays: number;
  sales: number;
  isExclusive: boolean;
  waveformData: number[];
  artistSharePct?: number;
  artist: { name: string; slug: string };
}

export function BeatCard({ beat, onBuy, wishlisted = false, onWishlist }: {
  beat: Beat;
  onBuy?: (beat: Beat) => void;
  wishlisted?: boolean;
  onWishlist?: (e: React.MouseEvent) => void;
}) {
  const { isTrackPlaying } = usePlayer();
  const isPlaying = isTrackPlaying(beat.id);
  const waveform = beat.waveformData?.length ? beat.waveformData : generateWaveformFallback(beat.id.charCodeAt(0), 40);

  const track: PreviewTrack = {
    id: beat.id,
    title: beat.title,
    artist: beat.artist.name,
    artworkUrl: beat.artworkUrl,
    previewUrl: beat.previewUrl,
    href: `/beat/${beat.slug}`,
    type: 'beat',
  };

  return (
    <div
      className="group relative rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
        boxShadow: isPlaying ? '0 0 0 1px var(--color-accent-green), 0 12px 36px rgba(160,232,124,0.16)' : '0 1px 2px rgba(0,0,0,0.4)',
      }}
      onMouseEnter={e => { if (!isPlaying) (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border-strong)'; }}
      onMouseLeave={e => { if (!isPlaying) (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border)'; }}
    >
      {/* ── Artwork ──────────────────────────────────────────── */}
      <div className="relative aspect-square overflow-hidden" style={{ background: 'var(--color-bg-tertiary)' }}>
        <Link href={`/beat/${beat.slug}`} className="absolute inset-0">
          {beat.artworkUrl ? (
            <img
              src={beat.artworkUrl}
              alt={beat.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-6xl" style={{ background: 'var(--color-bg-tertiary)' }}>🎵</div>
          )}
        </Link>

        {/* Bottom scrim for legibility */}
        <div className="absolute inset-x-0 bottom-0 h-16 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent)' }} />

        {/* Top-left genre pill */}
        {beat.genre && (
          <span
            className="absolute top-2.5 left-2.5 text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider"
            style={{ background: 'rgba(10,10,10,0.65)', backdropFilter: 'blur(6px)', color: '#fff', fontFamily: 'var(--font-mono)' }}
          >
            {beat.genre}
          </span>
        )}

        {/* Exclusive / sold ribbon */}
        {beat.isExclusive && (
          <span
            className="absolute top-2.5 right-2.5 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider"
            style={{ background: 'var(--color-accent-gold)', color: '#000', fontFamily: 'var(--font-mono)' }}
          >
            Sold
          </span>
        )}

        {/* Wishlist */}
        {onWishlist && !beat.isExclusive && (
          <button
            onClick={onWishlist}
            className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            style={{ background: wishlisted ? 'var(--color-accent-gold)' : 'rgba(10,10,10,0.6)', backdropFilter: 'blur(6px)' }}
            title={wishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
          >
            <Heart size={13} className={wishlisted ? 'fill-black text-black' : 'text-white'} />
          </button>
        )}

        {/* Preview play button — bottom-left, overlapping the artwork edge */}
        <div className="absolute -bottom-5 left-3 z-10">
          <PreviewPlayButton track={track} size={48} />
        </div>

        {/* Preview countdown, visible only while this beat is playing */}
        {isPlaying && (
          <span
            className="absolute bottom-2 right-2.5 text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(10,10,10,0.7)', color: 'var(--color-accent-green)', fontFamily: 'var(--font-mono)' }}
          >
            0:30 preview
          </span>
        )}
      </div>

      {/* ── Waveform ─────────────────────────────────────────── */}
      <div className="flex items-end gap-[2px] px-4 pt-7 pb-1" style={{ height: 34 }}>
        {waveform.slice(0, 40).map((h, i) => (
          <div key={i} className={`flex-1 rounded-sm transition-all duration-200${isPlaying ? ' waveform-bar-playing' : ''}`}
            style={{
              height: `${h * 100}%`,
              background: isPlaying ? 'var(--color-accent-green)' : 'var(--color-border-strong)',
              animationDelay: isPlaying ? `${i * 30}ms` : '0ms',
            }} />
        ))}
      </div>

      {/* ── Info ─────────────────────────────────────────────── */}
      <div className="px-4 pb-4 pt-1">
        <Link href={`/beat/${beat.slug}`}>
          <h3
            className="font-bold text-[15px] truncate leading-tight transition-colors"
            style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent-green)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
          >
            {beat.title}
          </h3>
        </Link>
        <Link href={`/artist/${beat.artist.slug}`} className="text-xs transition-colors" style={{ color: 'var(--color-text-secondary)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent-green)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-secondary)')}>
          {beat.artist.name}
        </Link>

        <div className="flex gap-1.5 mt-2.5 flex-wrap">
          {beat.bpm > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {beat.bpm} BPM
            </span>
          )}
          {beat.keySignature && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {beat.keySignature}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <div>
            <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--color-text-tertiary)' }}>From</p>
            <span className="font-black text-base" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
              {formatCurrency(beat.basicPrice)}
            </span>
          </div>
          <button
            onClick={(e) => { e.preventDefault(); onBuy?.(beat); }}
            disabled={beat.isExclusive}
            className="px-4 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: beat.isExclusive ? 'var(--color-bg-tertiary)' : 'var(--color-accent-green)',
              color: beat.isExclusive ? 'var(--color-text-secondary)' : '#000',
            }}
            onMouseEnter={e => { if (!beat.isExclusive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-accent-green-dim)'; }}
            onMouseLeave={e => { if (!beat.isExclusive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-accent-green)'; }}
          >
            {beat.isExclusive ? 'Sold Out' : 'Buy License'}
          </button>
        </div>
      </div>
    </div>
  );
}
