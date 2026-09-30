'use client';
import { PlayerProvider } from '@/components/NowPlayingBar';
import { CurrencyProvider } from '@/components/CurrencyProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return <CurrencyProvider><PlayerProvider>{children}</PlayerProvider></CurrencyProvider>;
}
