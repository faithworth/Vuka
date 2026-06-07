'use client';
// ============================================================
// VUKA — Admin Layout (Phase 5)
// Wraps all /admin/* pages with sidebar navigation + auth gate.
// ============================================================

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import {
  LayoutDashboard, Users, Music, Radio, DollarSign,
  Settings, Shield, Bell, LogOut, Menu, X, ChevronRight,
  BarChart2, Flag, Loader2, Crown,
} from 'lucide-react';

const ADMIN_NAV = [
  { href: '/admin',              label: 'Overview',     icon: LayoutDashboard, exact: true },
  { href: '/admin/users',        label: 'Users',        icon: Users },
  { href: '/admin/plans',        label: 'Plans',        icon: Crown },
  { href: '/admin/releases',     label: 'Releases',     icon: Music },
  { href: '/admin/distribution', label: 'Distribution', icon: Radio },
  { href: '/admin/finance',      label: 'Finance',      icon: DollarSign },
  { href: '/admin/settings',     label: 'Settings',     icon: Settings },
  { href: '/admin/security',     label: 'Security',     icon: Shield },
  { href: '/admin/db-repair',    label: 'DB Repair',    icon: Flag },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [open, setOpen]         = useState(false);

  useEffect(() => {
    // Use /api/auth/me — DB role is the single source of truth.
    // Do NOT compare emails client-side; NEXT_PUBLIC_ADMIN_EMAIL may not be set.
    fetch('/api/auth/me')
      .then(r => {
        if (r.status === 401) { router.replace('/auth/login?next=/admin'); return null; }
        return r.json();
      })
      .then(me => {
        if (!me) return; // already redirected above
        if (!me.isAdmin) { router.replace('/'); return; }
        setChecking(false);
      })
      .catch(() => router.replace('/auth/login?next=/admin'));
  }, [router]);

  // Don't apply layout to login page - it handles its own auth check
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <Loader2 className="animate-spin" size={32} style={{ color: 'var(--green)' }} />
      </div>
    );
  }

  function isActive(href: string, exact?: boolean) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-60 z-50 flex flex-col transition-transform duration-300
        ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static`}
        style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>

        {/* Logo */}
        <div className="p-6 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <div className="text-xl font-black font-display" style={{ color: 'var(--green)' }}>VUKA</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Admin Console</div>
          </div>
          <button className="lg:hidden" onClick={() => setOpen(false)}>
            <X size={18} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {ADMIN_NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link key={href} href={href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: active ? 'rgba(160,232,124,0.12)' : 'transparent',
                  color: active ? 'var(--green)' : 'var(--text-muted)',
                }}
                onClick={() => setOpen(false)}>
                <Icon size={16} />
                {label}
                {active && <ChevronRight size={12} className="ml-auto" />}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium w-full transition-all hover:bg-red-500/10"
            style={{ color: '#ff4d4d' }}>
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center gap-4 px-4 py-3 border-b"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <button onClick={() => setOpen(true)}>
            <Menu size={20} style={{ color: 'var(--text)' }} />
          </button>
          <span className="font-bold font-display" style={{ color: 'var(--green)' }}>VUKA Admin</span>
        </header>

        <main className="flex-1 overflow-auto p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
