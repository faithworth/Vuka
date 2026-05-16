'use client';
import { useState, useRef, useEffect, createContext, useContext } from 'react';

interface Track {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string;
  previewUrl: string;
  slug: string;
  type: 'beat' | 'release';
}

interface PlayerContextType {
  currentTrack: Track | null;
  isPlaying: boolean;
  play: (track: Track) => void;
  pause: () => void;
  toggle: () => void;
}

const PlayerContext = createContext<PlayerContextType>({
  currentTrack: null,
  isPlaying: false,
  play: () => {},
  pause: () => {},
  toggle: () => {},
});

export function usePlayer() { return useContext(PlayerContext); }

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = (track: Track) => {
    if (currentTrack?.id === track.id) {
      audioRef.current?.play();
      setIsPlaying(true);
      return;
    }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    const audio = new Audio(track.previewUrl);
    audioRef.current = audio;
    audio.addEventListener('ended', () => setIsPlaying(false));
    audio.play();
    setCurrentTrack(track);
    setIsPlaying(true);
  };

  const pause = () => { audioRef.current?.pause(); setIsPlaying(false); };
  const toggle = () => { isPlaying ? pause() : audioRef.current?.play().then(() => setIsPlaying(true)); };

  return (
    <PlayerContext.Provider value={{ currentTrack, isPlaying, play, pause, toggle }}>
      {children}
      {currentTrack && <NowPlayingBar />}
    </PlayerContext.Provider>
  );
}

export function NowPlayingBar() {
  const { currentTrack, isPlaying, toggle, pause } = usePlayer();
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = document.querySelector('audio') as HTMLAudioElement;
    if (!audio) return;
    audioRef.current = audio;
    const update = () => setProgress((audio.currentTime / audio.duration) * 100 || 0);
    audio.addEventListener('timeupdate', update);
    return () => audio.removeEventListener('timeupdate', update);
  }, [currentTrack]);

  if (!currentTrack) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-4 px-4 py-3" style={{ background: 'rgba(13,11,20,0.97)', backdropFilter: 'blur(20px)', borderTop: '1px solid var(--border)', height: 72 }}>
      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
        {currentTrack.artworkUrl
          ? <img src={currentTrack.artworkUrl} className="w-full h-full object-cover" alt="" />
          : <div className="w-full h-full flex items-center justify-center text-lg" style={{ background: 'var(--surface2)' }}>🎵</div>}
      </div>
      <div className="min-w-0 flex-1 md:w-48 md:flex-none">
        <p className="font-bold text-sm truncate" style={{ color: 'var(--text)' }}>{currentTrack.title}</p>
        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{currentTrack.artist}</p>
      </div>
      <div className="flex items-center gap-3 flex-1 justify-center">
        <button onClick={toggle} className="w-10 h-10 rounded-full flex items-center justify-center text-xl" style={{ background: 'var(--purple)' }}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <div className="hidden md:flex items-center gap-2 flex-1 max-w-xs">
          <div
            className="flex-1 h-1 rounded-full cursor-pointer"
            style={{ background: 'var(--surface2)' }}
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              if (audioRef.current) audioRef.current.currentTime = pct * audioRef.current.duration;
            }}
          >
            <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: 'var(--purple-light)' }} />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range" min="0" max="1" step="0.1" value={volume}
          onChange={e => { setVolume(+e.target.value); if (audioRef.current) audioRef.current.volume = +e.target.value; }}
          className="hidden md:block w-20"
        />
        <button onClick={pause} className="text-xl" style={{ color: 'var(--text-muted)' }}>✕</button>
      </div>
    </div>
  );
}
