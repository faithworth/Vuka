'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
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
  artist: { name: string; slug: string };
}

export function BeatCard({ beat, onBuy }: { beat: Beat; onBuy?: (beat: Beat) => void }) {
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
    <div className="group rounded-2xl overflow-hidden transition-all hover:scale-[1.02] hover:shadow-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {/* Artwork */}
      <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-purple-900/30 to-orange-900/20">
        {beat.artworkUrl ? (
          <img src={beat.artworkUrl} alt={beat.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-6xl" style={{ background: 'var(--surface2)' }}>🎵</div>
        )}
        {beat.isExclusive && (
          <div className="absolute top-2 right-2 px-3 py-1 rounded-lg text-xs font-bold animate-pulse" style={{ background: 'var(--gold)', color: '#000' }}>SOLD</div>
        )}
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
          style={{ background: 'rgba(0,0,0,0.5)' }}
        >
          <span className="text-5xl">{isPlaying ? '⏸️' : '▶️'}</span>
        </button>
      </div>

      {/* Waveform */}
      <div className="flex items-end gap-[2px] px-3 pt-3" style={{ height: 36 }}>
        {waveform.slice(0, 40).map((h, i) => (
          <div key={i} className="flex-1 rounded-sm transition-all duration-200" style={{ height: `${h * 100}%`, background: isPlaying ? 'var(--purple-light)' : 'var(--border)', transition: 'background 0.2s' }} />
        ))}
      </div>

      {/* Info */}
      <div className="p-4">
        <Link href={`/beat/${beat.slug}`}>
          <h3 className="font-bold text-base truncate hover:text-purple-400 transition-colors" style={{ color: 'var(--text)' }}>{beat.title}</h3>
        </Link>
        <Link href={`/artist/${beat.artist.slug}`} className="text-sm hover:underline transition-colors" style={{ color: 'var(--text-muted)' }}>
          by {beat.artist.name}
        </Link>
        <div className="flex gap-2 mt-2 flex-wrap">
          {beat.bpm > 0 && <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>🎚️ {beat.bpm} BPM</span>}
          {beat.keySignature && <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>🎼 {beat.keySignature}</span>}
          {beat.genre && <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: 'var(--surface2)', color: 'var(--purple-light)' }}>{beat.genre}</span>}
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="font-bold text-lg" style={{ color: 'var(--purple-light)' }}>
            {formatCurrency(beat.basicPrice)}
          </span>
          <button
            onClick={(e) => { e.preventDefault(); onBuy?.(beat); }}
            disabled={beat.isExclusive}
            className="px-4 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
            style={{ background: beat.isExclusive ? 'var(--surface2)' : 'linear-gradient(135deg,var(--purple),#5b21b6)', color: 'white' }}
          >
            {beat.isExclusive ? 'Sold Out' : '✓ Buy'}
          </button>
        </div>
        <p className="text-xs mt-2 text-center" style={{ color: 'var(--green)' }}>Artist gets 99% →</p>
      </div>
    </div>
  );
}
