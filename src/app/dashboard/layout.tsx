'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';

const NAV = [
  { href: '/dashboard', label: 'Your Hustle', icon: '📊' },
  { href: '/dashboard/beats', label: 'Beats', icon: '🎵' },
  { href: '/dashboard/releases', label: 'Releases', icon: '🎶' },
  { href: '/dashboard/uploads', label: 'Upload', icon: '⬆️' },
  { href: '/dashboard/purchases', label: 'Purchases', icon: '💳' },
  { href: '/dashboard/support', label: 'Your Riders', icon: '♥' },
  { href: '/dashboard/goals', label: 'Goals', icon: '🎯' },
  { href: '/dashboard/payouts', label: 'Payouts', icon: '💰' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace('/auth/login'); return; }
      setUser(data.user);
      setChecking(false);
    });
  }, [router]);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  }

  if (checking) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <p style={{ color: 'var(--text-muted)' }}>Just now…</p>
    </div>
  );

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 min-h-screen p-6 flex-shrink-0" style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>
        <Link href="/" className="text-2xl font-black mb-8 block" style={{ background: 'linear-gradient(135deg,#a78bfa,#7c3aed,#f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          VUKA
        </Link>
        <nav className="flex-1 space-y-1">
          {NAV.map(n => (
            <Link key={n.href} href={n.href}
              className="flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors"
              style={{
                background: pathname === n.href ? 'var(--surface2)' : 'transparent',
                color: pathname === n.href ? 'var(--text)' : 'var(--text-muted)',
                borderLeft: pathname === n.href ? '3px solid var(--purple)' : '3px solid transparent',
              }}>
              <span>{n.icon}</span>
              <span>{n.label}</span>
            </Link>
          ))}
        </nav>
        <button onClick={logout} className="mt-6 px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Sign Out</button>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 pb-24 md:pb-0">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 flex z-50" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
        {NAV.slice(0, 5).map(n => (
          <Link key={n.href} href={n.href} className="flex-1 flex flex-col items-center py-3 gap-1 text-xs"
            style={{ color: pathname === n.href ? 'var(--purple-light)' : 'var(--text-muted)' }}>
            <span className="text-lg">{n.icon}</span>
            <span className="hidden sm:block">{n.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
