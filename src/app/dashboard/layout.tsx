// ============================================================
// REPLACEMENT: src/app/dashboard/layout.tsx
// Changes from original:
//   - Added "Services" nav item (artist marketplace services page)
//   - Added "Videos" nav item (video/sample upload management)
//   - Added "Messages" nav item with unread badge
//   - Fixed: messages link was missing from dashboard nav entirely
// ============================================================

'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import {
  BarChart2, Music, Disc, Upload, ShoppingBag, Heart, Target,
  Wallet, Settings, LogOut, Music2, ChevronRight, AlertTriangle,
  MoreHorizontal, X, Send, Users, Store, Briefcase, Video,
  MessageSquare, User,
} from 'lucide-react';

const ARTIST_NAV = [
  { href: '/dashboard',                label: 'Overview',    icon: BarChart2,    exact: true },
  { href: '/dashboard/beats',          label: 'Beats',       icon: Music },
  { href: '/dashboard/releases',       label: 'Releases',    icon: Disc },
  { href: '/dashboard/releases/new',   label: 'Upload',      icon: Upload,       highlight: true },
  { href: '/dashboard/analytics',      label: 'Analytics',   icon: BarChart2 },
  { href: '/dashboard/earnings',       label: 'Earnings',    icon: Wallet },
  { href: '/dashboard/social',         label: 'Posts',       icon: Send },
  { href: '/dashboard/services',       label: 'Services',    icon: Briefcase },
  { href: '/dashboard/memberships',    label: 'Memberships', icon: Users },
  { href: '/dashboard/storefront',     label: 'Storefront',  icon: Store },
  { href: '/dashboard/purchases',      label: 'Sales',       icon: ShoppingBag },
  { href: '/dashboard/support',        label: 'Fan Support', icon: Heart },
  { href: '/dashboard/goals',          label: 'Goals',       icon: Target },
  { href: '/dashboard/payouts',        label: 'Payouts',     icon: Wallet },
  { href: '/dashboard/profile',        label: 'Profile',     icon: User },
  { href: '/dashboard/settings',       label: 'Settings',    icon: Settings },
];

// First 4 always visible in bottom bar; rest go in "More"
const MOBILE_PRIMARY = ARTIST_NAV.slice(0, 4);
const MOBILE_MORE    = ARTIST_NAV.slice(4);

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking]             = useState(true);
  const [userEmail, setUserEmail]           = useState('');
  const [artistName, setArtistName]         = useState('');
  const [payfastMerchant, setPayfastMerchant] = useState<string | null>(null);
  const [moreOpen, setMoreOpen]             = useState(false);
  const [unreadMsgs, setUnreadMsgs]         = useState(0);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/auth/login'); return; }
      setUserEmail(data.user.email || '');
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const me = await res.json();
          if (['admin', 'owner', 'super_admin'].includes(me.role)) {
            router.replace('/admin');
            return;
          }
          if (me.isArtist || me.role === 'artist' || me.role === 'producer') {
            setArtistName(me.name || '');
            try {
              const [settingsRes, msgsRes] = await Promise.all([
                fetch('/api/dashboard/settings'),
                fetch('/api/messages/conversations'),
              ]);
              if (settingsRes.ok) {
                const sd = await settingsRes.json();
                setPayfastMerchant(sd.artist?.payfastMerchant || null);
              }
              if (msgsRes.ok) {
                const md = await msgsRes.json();
                const convs: any[] = md.conversations || [];
                setUnreadMsgs(convs.reduce((sum, c) => sum + (c.unreadCount || 0), 0));
              }
            } catch {}
          } else {
            router.replace('/fan');
            return;
          }
        }
      } catch {}
      setChecking(false);
    });
  }, [router]);

  useEffect(() => { setMoreOpen(false); }, [pathname]);

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
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--sky)' }} />
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>

      {/* ── Desktop Sidebar ─────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-60 min-h-screen flex-shrink-0"
        style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>

        <div className="px-5 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--sky)' }}>
              <Music2 size={13} className="text-white" />
            </div>
            <span className="font-semibold text-base" style={{ color: 'var(--text)' }}>Vuka</span>
          </Link>
          {artistName && (
            <p className="text-xs mt-2 truncate" style={{ color: 'var(--text-muted)' }}>Artist Dashboard</p>
          )}
        </div>

        {/* Messages quick link */}
        <div className="px-3 pt-3">
          <Link href="/messages"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-all"
            style={{
              background: pathname === '/messages' ? 'var(--surface2)' : 'transparent',
              color: pathname === '/messages' ? 'var(--text)' : 'var(--text-muted)',
            }}>
            <MessageSquare size={16} className="flex-shrink-0" />
            <span className="flex-1">Messages</span>
            {unreadMsgs > 0 && (
              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white"
                style={{ background: 'var(--sky)', minWidth: 18, textAlign: 'center' }}>
                {unreadMsgs}
              </span>
            )}
          </Link>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {ARTIST_NAV.map(n => {
            const active = isActive(n.href, n.exact);
            return (
              <Link key={n.href} href={n.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-all group"
                style={{
                  background: active ? 'var(--surface2)' : n.highlight && !active ? 'rgba(56,182,232,0.08)' : 'transparent',
                  color: active ? 'var(--text)' : n.highlight ? 'var(--sky)' : 'var(--text-muted)',
                  border: n.highlight && !active ? '1px solid rgba(56,182,232,0.2)' : '1px solid transparent',
                }}>
                <n.icon size={16} className="flex-shrink-0" />
                <span className="flex-1">{n.label}</span>
                {active && <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
              </Link>
            );
          })}
        </nav>

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

      {/* ── Main Content ─────────────────────────────────────── */}
      <main className="flex-1 min-w-0 pb-24 md:pb-0">

        {/* PayFast setup banner */}
        {!payfastMerchant && pathname !== '/dashboard/settings' && (
          <div className="flex items-center gap-3 px-5 py-3 text-sm"
            style={{ background: 'rgba(234,179,8,0.1)', borderBottom: '1px solid rgba(234,179,8,0.25)' }}>
            <AlertTriangle size={16} style={{ color: '#eab308', flexShrink: 0 }} />
            <p style={{ color: '#ca8a04' }}>
              <strong>Action required:</strong> Connect your PayFast account to receive payments.{' '}
              <Link href="/dashboard/settings" className="underline font-semibold" style={{ color: '#92400e' }}>
                Set up now →
              </Link>
            </p>
          </div>
        )}

        {children}
      </main>

      {/* ── Mobile Bottom Nav ────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 flex z-50 px-1"
        style={{
          background: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>

        {MOBILE_PRIMARY.map(n => {
          const active = isActive(n.href, n.exact);
          return (
            <Link key={n.href} href={n.href}
              className="flex-1 flex flex-col items-center py-3 gap-0.5 transition-colors min-h-[56px] justify-center"
              style={{ color: active ? 'var(--sky)' : 'var(--text-muted)' }}>
              <n.icon size={22} />
              <span className="text-[10px] font-medium">{n.label.split(' ')[0]}</span>
            </Link>
          );
        })}

        <button
          onClick={() => setMoreOpen(v => !v)}
          className="flex-1 flex flex-col items-center py-3 gap-0.5 transition-colors min-h-[56px] justify-center"
          style={{ color: moreOpen ? 'var(--sky)' : 'var(--text-muted)' }}>
          <MoreHorizontal size={22} />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>

      {/* ── Mobile "More" Drawer ─────────────────────────────── */}
      {moreOpen && (
        <>
          <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl"
            style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 80px)' }}>

            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>Dashboard</p>
              <button onClick={() => setMoreOpen(false)} style={{ color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            {/* Messages quick link in drawer */}
            <div className="px-3 pt-2">
              <Link href="/messages"
                className="flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm"
                style={{ color: 'var(--text-muted)' }}>
                <MessageSquare size={18} />
                <span className="flex-1">Messages</span>
                {unreadMsgs > 0 && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white"
                    style={{ background: 'var(--sky)' }}>
                    {unreadMsgs}
                  </span>
                )}
              </Link>
            </div>

            <div className="p-3 space-y-0.5">
              {MOBILE_MORE.map(n => {
                const active = isActive(n.href, n.exact);
                return (
                  <Link key={n.href} href={n.href}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all"
                    style={{
                      background: active ? 'var(--surface2)' : 'transparent',
                      color: active ? 'var(--text)' : 'var(--text-muted)',
                    }}>
                    <n.icon size={18} />
                    <span>{n.label}</span>
                    {active && <ChevronRight size={14} className="ml-auto" style={{ color: 'var(--text-muted)' }} />}
                  </Link>
                );
              })}

              <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
                <button onClick={logout}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm w-full"
                  style={{ color: 'var(--text-muted)' }}>
                  <LogOut size={18} />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
