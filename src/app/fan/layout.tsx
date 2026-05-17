'use client';
// src/app/fan/layout.tsx
import Navbar from '@/components/Navbar';

export default function FanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <main>{children}</main>
    </div>
  );
}
