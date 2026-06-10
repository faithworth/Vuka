'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import {
  Menu, X, Music2, Rss, Compass, MessageSquare, Bell,
  LayoutDashboard, BookOpen, Briefcase, ShieldCheck,
} from 'lucide-react';

type Role = 'fan' | 'artist' | 'industry' | 'admin' | null;

export function Navbar() {
  const pathname = usePathname();
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [unreadMsgs, setUnreadMsgs] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const loadUser = async (u: any) => {
      if (!u) { setUser(null); setRole(null); return; }
      setUser(u);
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          const r = data.role;
          if (['admin', 'owner', 'super_admin'].includes(r)) setRole('admin');
          else if (r === 'industry') setRole('industry');
          else if (data.isArtist || r === 'artist' || r === 'producer') setRole('artist');
          else setRole('fan');

          // Load notification + message unread counts
          try {
            const [nRes, mRes] = await Promise.all([
              fetch('/api/social/notifications'),
              fetch('/api/messages/conversations'),
            ]);
            if (nRes.ok) {
              const nd = await nRes.json();
              const notifs: any[] = nd.notifications || [];
              setUnreadNotifs(notifs.filter((n: any) => !n.isRead).length);
            }
            if (mRes.ok) {
              const md = await mRes.json();
              const convs: any[] = md.conversations || [];
              setUnreadMsgs(convs.reduce((sum: number, c: any) => sum + (c.unreadCount || 0), 0));
            }
          } catch {}
        }
      } catch {
        setRole('fan');
      }
    };

    supabase.auth.getUser().then(({ data }) => loadUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      loadUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Close mobile menu on route change
  useEffect(() => setMobileOpen(false), [pathname]);

  const dashboardHref =
    role === 'admin' ? '/admin' :
    role === 'industry' ? '/industry-dashboard' :
    role === 'artist' ? '/dashboard' :
    '/fan';

  const dashboardLabel =
    role === 'admin' ? 'Admin' :
    role === 'industry' ? 'My Portal' :
    role === 'artist' ? 'Dashboard' :
    'My Library';

  const DashIcon =
    role === 'admin' ? ShieldCheck :
    role === 'industry' ? Briefcase :
    role === 'artist' ? LayoutDashboard :
    BookOpen;

  const publicLinks = [
    { href: '/store', label: 'Store' },
    { href: '/store/beats', label: 'Beats' },
    { href: '/store/releases', label: 'Releases' },
    { href: '/store/videos', label: 'Videos' },
    { href: '/store/samples', label: 'Samples' },
    { href: '/marketplace', label: 'Marketplace' },
    { href: '/industry', label: 'Industry' },
  ];

  const authedLinks = user ? [
    { href: '/feed', label: 'Feed', icon: Rss },
    { href: '/discover', label: 'Discover', icon: Compass },
  ] : [];

  const isActive = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <nav
      className="sticky top-0 z-50"
      style={{
        background: 'rgba(232,244,253,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 1px 16px rgba(56,182,232,0.07)',
      }}
    >
      <div className="flex items-center justify-between px-5 py-3.5 max-w-7xl mx-auto">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'var(--sky)' }}>
            <Music2 size={15} className="text-white" />
          </div>
          <span className="text-base font-bold tracking-tight" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
            Vuka
          </span>
        </Link>

        {/* Desktop center links */}
        <div className="hidden md:flex items-center gap-1">
          {publicLinks.map(l => (
            <Link
              key={l.href} href={l.href}
              className="px-3 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                color: isActive(l.href) ? 'var(--sky)' : 'var(--text-muted)',
                background: isActive(l.href) ? 'rgba(56,182,232,0.08)' : 'transparent',
              }}>
              {l.label}
            </Link>
          ))}
          {authedLinks.map(l => (
            <Link
              key={l.href} href={l.href}
              className="px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5"
              style={{
                color: isActive(l.href) ? 'var(--sky)' : 'var(--text-muted)',
                background: isActive(l.href) ? 'rgba(56,182,232,0.08)' : 'transparent',
              }}>
              <l.icon size={13} />
              {l.label}
            </Link>
          ))}
        </div>

        {/* Desktop right side */}
        <div className="hidden md:flex items-center gap-2">
          {user ? (
            <>
              {/* Messages icon */}
              <Link href="/messages" className="relative p-2 rounded-lg transition-colors"
                style={{ color: isActive('/messages') ? 'var(--sky)' : 'var(--text-muted)' }}>
                <MessageSquare size={18} />
                {unreadMsgs > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
                    style={{ background: 'var(--sky)' }}>
                    {unreadMsgs > 9 ? '9+' : unreadMsgs}
                  </span>
                )}
              </Link>

              {/* Notifications icon */}
              <Link href="/notifications" className="relative p-2 rounded-lg transition-colors"
                style={{ color: isActive('/notifications') ? 'var(--sky)' : 'var(--text-muted)' }}>
                <Bell size={18} />
                {unreadNotifs > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
                    style={{ background: '#e74c3c' }}>
                    {unreadNotifs > 9 ? '9+' : unreadNotifs}
                  </span>
                )}
              </Link>

              {/* Dashboard button */}
              <Link
                href={dashboardHref}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                <DashIcon size={14} />
                {dashboardLabel}
              </Link>
            </>
          ) : (
            <>
              <Link href="/auth/login"
                className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{ color: 'var(--text-muted)' }}>
                Log In
              </Link>
              <Link href="/auth/register"
                className="px-4 py-2 rounded-xl text-sm font-bold transition-all text-white"
                style={{ background: 'var(--sky)', boxShadow: '0 4px 16px rgba(56,182,232,0.3)' }}>
                Get Started
              </Link>
            </>
          )}
        </div>

        {/* Mobile right side: icon shortcuts + hamburger */}
        <div className="md:hidden flex items-center gap-1">
          {user && (
            <>
              <Link href="/notifications" className="relative p-2 rounded-lg"
                style={{ color: 'var(--text-muted)' }}>
                <Bell size={19} />
                {unreadNotifs > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full text-[8px] font-bold text-white flex items-center justify-center"
                    style={{ background: '#e74c3c' }}>
                    {unreadNotifs}
                  </span>
                )}
              </Link>
              <Link href="/messages" className="relative p-2 rounded-lg"
                style={{ color: 'var(--text-muted)' }}>
                <MessageSquare size={19} />
                {unreadMsgs > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full text-[8px] font-bold text-white flex items-center justify-center"
                    style={{ background: 'var(--sky)' }}>
                    {unreadMsgs}
                  </span>
                )}
              </Link>
            </>
          )}
          <button
            className="p-2 rounded-xl transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onClick={() => setMobileOpen(v => !v)}>
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div className="px-4 py-3 flex flex-col gap-0.5">
            {publicLinks.map(l => (
              <Link key={l.href} href={l.href}
                className="py-2.5 px-3 rounded-xl text-sm font-medium transition-colors"
                style={{
                  color: isActive(l.href) ? 'var(--sky)' : 'var(--text-muted)',
                  background: isActive(l.href) ? 'rgba(56,182,232,0.08)' : 'transparent',
                }}>
                {l.label}
              </Link>
            ))}

            {user && (
              <>
                <div className="my-1" style={{ borderTop: '1px solid var(--border)' }} />
                {authedLinks.map(l => (
                  <Link key={l.href} href={l.href}
                    className="py-2.5 px-3 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                    style={{
                      color: isActive(l.href) ? 'var(--sky)' : 'var(--text-muted)',
                      background: isActive(l.href) ? 'rgba(56,182,232,0.08)' : 'transparent',
                    }}>
                    <l.icon size={15} />
                    {l.label}
                  </Link>
                ))}
                <div className="my-1" style={{ borderTop: '1px solid var(--border)' }} />
                <Link href={dashboardHref}
                  className="py-2.5 px-3 rounded-xl text-sm font-semibold flex items-center gap-2"
                  style={{ color: 'var(--text)' }}>
                  <DashIcon size={15} />
                  {dashboardLabel}
                </Link>
              </>
            )}

            {!user && (
              <>
                <div className="my-1" style={{ borderTop: '1px solid var(--border)' }} />
                <Link href="/auth/login"
                  className="py-2.5 px-3 rounded-xl text-sm font-medium"
                  style={{ color: 'var(--text-muted)' }}>
                  Log In
                </Link>
                <Link href="/auth/register"
                  className="py-2.5 px-3 rounded-xl text-sm font-bold text-white text-center mt-1"
                  style={{ background: 'var(--sky)' }}>
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

export default Navbar;
