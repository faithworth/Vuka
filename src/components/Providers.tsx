'use client';
import { PlayerProvider } from '@/components/NowPlayingBar';

export function Providers({ children }: { children: React.ReactNode }) {
  return <PlayerProvider>{children}</PlayerProvider>;
}
