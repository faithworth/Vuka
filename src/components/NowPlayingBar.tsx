'use client';
// ============================================================
// VUKA — Global Preview Player
// One shared <audio> element for the whole app. This guarantees:
//   1. Only ONE beat / release / sample can ever play at a time,
//      anywhere in the app (every card, every detail page).
//   2. Every preview hard-stops at PREVIEW_SECONDS (30s) — these
//      are previews meant to drive a purchase, not a stream.
// Mounted once in the root layout via <Providers>, so it survives
// route changes (true mini-player, like the iPod's now-playing screen).
// ============================================================
import {
  useState, useRef, useEffect, useCallback, createContext, useContext,
} from 'react';
import { usePathname } from 'next/navigation';
import { Play, Pause, X } from 'lucide-react';

export const PREVIEW_SECONDS = 30;

export interface PreviewTrack {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string;
  previewUrl: string;
  href: string;
  type: 'beat' | 'release' | 'sample';
  /** Id to send to /api/play — defaults to `id`. Use this when several
   *  playable tracks (e.g. tracks within one release) should all roll
   *  their play-count up to one parent record. */
  analyticsId?: string;
}

interface PlayerContextType {
  currentTrack: PreviewTrack | null;
  isPlaying: boolean;
  elapsed: number;
  play: (track: PreviewTrack) => void;
  pause: () => void;
  toggle: (track: PreviewTrack) => void;
  isTrackPlaying: (id: string) => boolean;
  close: () => void;
}

const noop = () => {};
const PlayerContext = createContext<PlayerContextType>({
  currentTrack: null,
  isPlaying: false,
  elapsed: 0,
  play: noop,
  pause: noop,
  toggle: noop,
  isTrackPlaying: () => false,
  close: noop,
});

export function usePlayer() {
  return useContext(PlayerContext);
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<PreviewTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<PreviewTrack | null>(null);
  const playedRef = useRef<Set<string>>(new Set());

  const recordPlay = useCallback((track: PreviewTrack) => {
    const key = track.analyticsId || track.id;
    if (playedRef.current.has(key)) return;
    playedRef.current.add(key);
    fetch('/api/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: key, itemType: track.type }),
    }).catch(() => {});
  }, []);

  const teardown = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute('src');
      a.load();
    }
    audioRef.current = null;
  }, []);

  const play = useCallback((track: PreviewTrack) => {
    if (!track.previewUrl) return;

    // Same track already loaded — just resume (replay from 0 if it had hit the cap)
    if (trackRef.current?.id === track.id && audioRef.current) {
      const a = audioRef.current;
      if (a.currentTime >= PREVIEW_SECONDS || a.ended) a.currentTime = 0;
      a.play().catch(() => {});
      setIsPlaying(true);
      return;
    }

    teardown();
    const audio = new Audio(track.previewUrl);
    audioRef.current = audio;
    trackRef.current = track;

    audio.addEventListener('timeupdate', () => {
      const t = audio.currentTime;
      setElapsed(Math.min(t, PREVIEW_SECONDS));
      if (t >= PREVIEW_SECONDS) {
        audio.pause();
        audio.currentTime = 0;
        setIsPlaying(false);
        setElapsed(0);
      }
    });
    audio.addEventListener('ended', () => { setIsPlaying(false); setElapsed(0); });
    audio.addEventListener('play', () => recordPlay(track), { once: true });

    audio.play().catch(() => setIsPlaying(false));
    setCurrentTrack(track);
    setIsPlaying(true);
    setElapsed(0);
  }, [recordPlay, teardown]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const toggle = useCallback((track: PreviewTrack) => {
    if (trackRef.current?.id === track.id && isPlaying) pause();
    else play(track);
  }, [isPlaying, pause, play]);

  const close = useCallback(() => {
    teardown();
    trackRef.current = null;
    setCurrentTrack(null);
    setIsPlaying(false);
    setElapsed(0);
  }, [teardown]);

  const isTrackPlaying = useCallback(
    (id: string) => trackRef.current?.id === id && isPlaying,
    [isPlaying],
  );

  useEffect(() => () => teardown(), [teardown]);

  return (
    <PlayerContext.Provider value={{ currentTrack, isPlaying, elapsed, play, pause, toggle, isTrackPlaying, close }}>
      {children}
      <MiniPlayer />
    </PlayerContext.Provider>
  );
}

// ── Reusable circular play button with a 30s preview progress ring ──
// Used by BeatCard, beat/release/sample detail pages — anywhere a
// preview is offered. Keeps the "only 30s, only one at a time" rule
// visually consistent across the whole app.
export function PreviewPlayButton({
  track, size = 56, ring = true, className = '',
}: {
  track: PreviewTrack;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  const { toggle, isTrackPlaying, elapsed } = usePlayer();
  const playing = isTrackPlaying(track.id);
  const r = (size - 4) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = playing ? elapsed / PREVIEW_SECONDS : 0;

  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(track); }}
      className={`relative flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-label={playing ? 'Pause preview' : 'Play 30s preview'}
    >
      {ring && (
        <svg width={size} height={size} className="absolute inset-0 -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={2} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke="var(--sky)" strokeWidth={2} strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct)}
            style={{ transition: 'stroke-dashoffset 0.2s linear' }}
          />
        </svg>
      )}
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: size - 14, height: size - 14,
          background: 'var(--color-accent-green)',
          boxShadow: '0 4px 16px rgba(160,232,124,0.35)',
        }}
      >
        {playing
          ? <Pause size={Math.round((size - 14) * 0.4)} fill="#000" color="#000" />
          : <Play size={Math.round((size - 14) * 0.4)} fill="#000" color="#000" style={{ marginLeft: 2 }} />}
      </div>
    </button>
  );
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function MiniPlayer() {
  const { currentTrack, isPlaying, elapsed, toggle, close } = usePlayer();
  const pathname = usePathname();
  if (!currentTrack) return null;

  // Sit above the dashboard's mobile bottom tab bar instead of covering it.
  const onDashboard = !!pathname?.startsWith('/dashboard');

  return (
    <div
      className={`fixed left-0 right-0 z-[60] ${onDashboard ? 'bottom-16 md:bottom-0' : 'bottom-0'}`}
      style={{
        background: 'rgba(10,10,10,0.96)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--color-border)',
        paddingBottom: onDashboard ? 0 : 'env(safe-area-inset-bottom)',
      }}
    >
      {/* 30s preview progress */}
      <div className="h-0.5 w-full" style={{ background: 'var(--color-bg-tertiary)' }}>
        <div
          className="h-full"
          style={{
            width: `${(elapsed / PREVIEW_SECONDS) * 100}%`,
            background: 'var(--color-accent-green)',
            transition: 'width 0.2s linear',
          }}
        />
      </div>

      <div className="flex items-center gap-3 px-3 py-2" style={{ minHeight: 60 }}>
        <a href={currentTrack.href} className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
          {currentTrack.artworkUrl
            ? <img src={currentTrack.artworkUrl} className="w-full h-full object-cover" alt="" />
            : <div className="w-full h-full flex items-center justify-center text-lg" style={{ background: 'var(--color-bg-tertiary)' }}>🎵</div>}
        </a>

        <a href={currentTrack.href} className="min-w-0 flex-1">
          <p className="font-bold text-sm truncate" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>
            {currentTrack.title}
          </p>
          <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
            {currentTrack.artist}
          </p>
        </a>

        <span
          className="hidden sm:inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0"
          style={{ background: 'rgba(232,200,124,0.12)', color: 'var(--color-accent-gold)', fontFamily: 'var(--font-mono)' }}
        >
          Preview · {formatTime(elapsed)}/0:30
        </span>

        <button
          onClick={() => toggle(currentTrack)}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--color-accent-green)' }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying
            ? <Pause size={15} fill="#000" color="#000" />
            : <Play size={15} fill="#000" color="#000" style={{ marginLeft: 1 }} />}
        </button>

        <button onClick={close} className="flex-shrink-0" style={{ color: 'var(--color-text-secondary)' }} aria-label="Close preview">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
