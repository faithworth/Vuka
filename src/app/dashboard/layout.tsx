'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import {
  BarChart2, Music, Disc, Upload, ShoppingBag, Heart, Target, Wallet, Settings, LogOut, Music2, ChevronRight
} from 'lucide-react';

const ARTIST_NAV = [
  { href: '/dashboard', label: 'Overview', icon: BarChart2, exact: true },
  { href: '/dashboard/beats', label: 'Beats', icon: Music },
  { href: '/dashboard/releases', label: 'Releases', icon: Disc },
  { href: '/dashboard/uploads', label: 'Upload', icon: Upload, highlight: true },
  { href: '/dashboard/purchases', label: 'Sales', icon: ShoppingBag },
  { href: '/dashboard/support', label: 'Fan Support', icon: Heart },
  { href: '/dashboard/goals', label: 'Goals', icon: Target },
  { href: '/dashboard/payouts', label: 'Payouts', icon: Wallet },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [artistName, setArtistName] = useState('');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/auth/login'); return; }
      setUserEmail(data.user.email || '');
      // Check role — redirect fans away from the artist dashboard
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const me = await res.json();
          if (!me.isArtist) {
            // Fan — they don't belong here
            router.replace('/fan');
            return;
          }
          setArtistName(me.name || '');
        }
      } catch {}
      setChecking(false);
    });
  }, [router]);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  if (checking) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--purple)' }} />
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>

      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-60 min-h-screen flex-shrink-0"
        style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>

        {/* Logo */}
        <div className="px-5 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--purple)' }}>
              <Music2 size={13} className="text-white" />
            </div>
            <span className="font-semibold text-base" style={{ color: 'var(--text)' }}>Vuka</span>
          </Link>
          {artistName && (
            <p className="text-xs mt-2 truncate" style={{ color: 'var(--text-muted)' }}>Artist Dashboard</p>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {ARTIST_NAV.map(n => {
            const active = isActive(n.href, n.exact);
            return (
              <Link key={n.href} href={n.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-all group"
                style={{
                  background: active ? 'var(--surface2)' : n.highlight && !active ? 'rgba(124,58,237,0.08)' : 'transparent',
                  color: active ? 'var(--text)' : n.highlight ? 'var(--purple-light)' : 'var(--text-muted)',
                  border: n.highlight && !active ? '1px solid rgba(124,58,237,0.2)' : '1px solid transparent',
                }}>
                <n.icon size={16} className="flex-shrink-0" />
                <span className="flex-1">{n.label}</span>
                {active && <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="px-3 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{userEmail}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Artist</p>
          </div>
          <button onClick={logout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm w-full transition-colors hover:bg-[var(--surface2)]"
            style={{ color: 'var(--text-muted)' }}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 pb-20 md:pb-0">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 flex z-50 px-1 pb-safe"
        style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
        {ARTIST_NAV.slice(0, 5).map(n => {
          const active = isActive(n.href, n.exact);
          return (
            <Link key={n.href} href={n.href}
              className="flex-1 flex flex-col items-center py-3 gap-1 transition-colors"
              style={{ color: active ? 'var(--purple-light)' : 'var(--text-muted)' }}>
              <n.icon size={20} />
              <span className="text-xs">{n.label.split(' ')[0]}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
