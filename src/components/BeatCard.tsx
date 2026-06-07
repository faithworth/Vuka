'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { formatCurrency, generateWaveformFallback } from '@/lib/utils';

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
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playCountedRef = useRef(false);
  const waveform = beat.waveformData?.length ? beat.waveformData : generateWaveformFallback(beat.id.charCodeAt(0), 40);

  const recordPlay = () => {
    if (playCountedRef.current) return;
    playCountedRef.current = true;
    fetch('/api/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: beat.id, itemType: 'beat' }),
    }).catch(() => {});
  };

  const togglePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!audioRef.current) {
      audioRef.current = new Audio(beat.previewUrl);
      audioRef.current.addEventListener('ended', () => setIsPlaying(false));
      audioRef.current.addEventListener('play', recordPlay, { once: true });
    }
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  return (
    <div className="group rounded-2xl overflow-hidden transition-all hover:scale-[1.02]"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: '0 2px 12px rgba(56,182,232,0.06)',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 32px rgba(56,182,232,0.18)';
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--sky)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(56,182,232,0.06)';
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
      }}>
      {/* Artwork */}
      <div className="relative aspect-square overflow-hidden" style={{ background: 'var(--surface2)' }}>
        {beat.artworkUrl ? (
          <img src={beat.artworkUrl} alt={beat.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-6xl" style={{ background: 'var(--surface2)' }}>🎵</div>
        )}
        {beat.isExclusive && (
          <div className="absolute top-2 right-2 px-3 py-1 rounded-lg text-xs font-bold" style={{ background: 'var(--gold)', color: '#fff' }}>SOLD</div>
        )}
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(15,31,46,0.55)', backdropFilter: 'blur(4px)' }}
        >
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(56,182,232,0.9)' }}>
            <span className="text-2xl text-white">{isPlaying ? '⏸' : '▶'}</span>
          </div>
        </button>
        {onWishlist && (
          <button
            onClick={onWishlist}
            className="absolute top-2 left-2 w-8 h-8 rounded-full flex items-center justify-center transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            style={{ background: wishlisted ? 'var(--gold)' : 'rgba(15,31,46,0.6)', border: '1px solid rgba(255,255,255,0.2)' }}
            title={wishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
          >
            <Heart size={14} className={wishlisted ? 'fill-black text-black' : 'text-white'} />
          </button>
        )}
      </div>

      {/* Waveform */}
      <div className="flex items-end gap-[2px] px-3 pt-3" style={{ height: 36 }}>
        {waveform.slice(0, 40).map((h, i) => (
          <div key={i} className={`flex-1 rounded-sm transition-all duration-200${isPlaying ? ' waveform-bar-playing' : ''}`}
            style={{
              height: `${h * 100}%`,
              background: isPlaying ? 'var(--sky)' : 'var(--border)',
              animationDelay: isPlaying ? `${i * 30}ms` : '0ms',
            }} />
        ))}
      </div>

      {/* Info */}
      <div className="p-4">
        <Link href={`/beat/${beat.slug}`}>
          <h3 className="font-bold text-base truncate transition-colors" style={{ color: 'var(--text)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--sky)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text)')}>
            {beat.title}
          </h3>
        </Link>
        <Link href={`/artist/${beat.artist.slug}`} className="text-sm transition-colors" style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--sky)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
          by {beat.artist.name}
        </Link>
        <div className="flex gap-2 mt-2 flex-wrap">
          {beat.bpm > 0 && <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>🎚️ {beat.bpm} BPM</span>}
          {beat.keySignature && <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>🎼 {beat.keySignature}</span>}
          {beat.genre && <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: 'rgba(56,182,232,0.1)', color: 'var(--sky)' }}>{beat.genre}</span>}
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="font-bold text-lg" style={{ color: 'var(--sky)' }}>
            {formatCurrency(beat.basicPrice)}
          </span>
          <button
            onClick={(e) => { e.preventDefault(); onBuy?.(beat); }}
            disabled={beat.isExclusive}
            className="px-4 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
            style={{
              background: beat.isExclusive ? 'var(--surface2)' : 'var(--red)',
              color: 'white',
              border: 'none',
            }}
            onMouseEnter={e => { if (!beat.isExclusive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--red-dark)'; }}
            onMouseLeave={e => { if (!beat.isExclusive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--red)'; }}
          >
            {beat.isExclusive ? 'Sold Out' : '✓ Buy'}
          </button>
        </div>
        <p className="text-xs mt-2 text-center font-medium" style={{ color: 'var(--gold)' }}>Artist gets {beat.artistSharePct ?? 85}% →</p>
      </div>
    </div>
  );
}
