'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import {
  Menu, X, Music2, Rss, Compass, MessageSquare, Bell, ChevronDown,
  LayoutDashboard, BookOpen, Briefcase, ShieldCheck, Users,
  LogOut, Settings, TrendingUp, DollarSign, ShoppingBag, Upload,
} from 'lucide-react';

type Role = 'fan' | 'artist' | 'industry' | 'admin' | null;

export function Navbar() {
  const pathname  = usePathname();
  const router    = useRouter();
  const [user,          setUser]          = useState<{ email?: string } | null>(null);
  const [role,          setRole]          = useState<Role>(null);
  const [unreadNotifs,  setUnreadNotifs]  = useState(0);
  const [unreadMsgs,    setUnreadMsgs]    = useState(0);
  const [mobileOpen,    setMobileOpen]    = useState(false);
  const [storeOpen,     setStoreOpen]     = useState(false);
  const storeRef = useRef<HTMLDivElement>(null);

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
      } catch { setRole('fan'); }
    };
    supabase.auth.getUser().then(({ data }) => loadUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      loadUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (storeRef.current && !storeRef.current.contains(e.target as Node))
        setStoreOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  };

  const dashboardHref =
    role === 'admin'    ? '/admin' :
    role === 'industry' ? '/industry-dashboard' :
    role === 'artist'   ? '/dashboard' :
    '/fan';

  const dashboardLabel =
    role === 'admin'    ? 'Admin Panel' :
    role === 'industry' ? 'My Portal' :
    role === 'artist'   ? 'Dashboard' :
    'My Library';

  const DashIcon =
    role === 'admin'    ? ShieldCheck :
    role === 'industry' ? Briefcase :
    role === 'artist'   ? LayoutDashboard :
    BookOpen;

  // Quick links per role — shown in mobile account section
  const quickLinks =
    role === 'artist' ? [
      { href: '/dashboard/uploads',  label: 'Uploads',   icon: Upload },
      { href: '/dashboard/earnings', label: 'Earnings',  icon: DollarSign },
      { href: '/dashboard/analytics',label: 'Analytics', icon: TrendingUp },
      { href: '/dashboard/settings', label: 'Settings',  icon: Settings },
    ] :
    role === 'industry' ? [
      { href: '/industry-dashboard', label: 'My Portal', icon: Briefcase },
      { href: '/browse-artists',     label: 'Find Artists', icon: Users },
    ] :
    role === 'admin' ? [
      { href: '/admin/users',    label: 'Users',    icon: Users },
      { href: '/admin/finance',  label: 'Finance',  icon: DollarSign },
      { href: '/admin/settings', label: 'Settings', icon: Settings },
    ] :
    // fan
    [
      { href: '/fan',                 label: 'My Library',  icon: BookOpen },
      { href: '/dashboard/purchases', label: 'Purchases',   icon: ShoppingBag },
    ];

  // Public links — kept intact, all shown in mobile drawer
  const publicLinks = [
    { href: '/store',          label: 'Store' },
    { href: '/store/beats',    label: 'Beats' },
    { href: '/store/releases', label: 'Releases' },
    { href: '/store/videos',   label: 'Videos' },
    { href: '/store/samples',  label: 'Samples' },
    { href: '/services',       label: 'Services' },
    { href: '/industry',       label: 'For Industry' },
  ];

  // Store sub-links for desktop dropdown
  const storeDropLinks = [
    { href: '/store/beats',    label: 'Beats' },
    { href: '/store/releases', label: 'Releases' },
    { href: '/store/videos',   label: 'Videos' },
    { href: '/store/samples',  label: 'Samples' },
  ];

  // Role-specific extra links
  const roleLinks = user ? [
    ...(role === 'industry' ? [
      { href: '/browse-artists', label: 'Find Artists', icon: Users },
    ] : []),
    { href: '/feed',     label: 'Feed',     icon: Rss },
    { href: '/discover', label: 'Discover', icon: Compass },
  ] : [];

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href));

  const storeActive = ['/store','/store/beats','/store/releases','/store/videos','/store/samples']
    .some(h => isActive(h));

  // ── Shared styles ────────────────────────────────────────────────────────
  const navBg: React.CSSProperties = {
    background: 'rgba(10,10,10,0.95)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderBottom: '1px solid var(--border)',
    boxShadow: '0 1px 20px rgba(0,0,0,0.4)',
  };
  const lnk = (active: boolean): React.CSSProperties => ({
    color:      active ? 'var(--green)' : 'var(--text-muted)',
    background: active ? 'rgba(160,232,124,0.08)' : 'transparent',
  });

  // ── Right-side action buttons (desktop/tablet) ───────────────────────────
  const RightActions = () => (
    <div className="flex items-center gap-2">
      {user ? (
        <>
          <Link href="/messages" className="relative p-2 rounded-lg transition-colors"
            style={{ color: isActive('/messages') ? 'var(--green)' : 'var(--text-muted)' }}>
            <MessageSquare size={18} />
            {unreadMsgs > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold text-black flex items-center justify-center"
                style={{ background: 'var(--green)' }}>
                {unreadMsgs > 9 ? '9+' : unreadMsgs}
              </span>
            )}
          </Link>
          <Link href="/notifications" className="relative p-2 rounded-lg transition-colors"
            style={{ color: isActive('/notifications') ? 'var(--green)' : 'var(--text-muted)' }}>
            <Bell size={18} />
            {unreadNotifs > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
                style={{ background: '#e74c3c' }}>
                {unreadNotifs > 9 ? '9+' : unreadNotifs}
              </span>
            )}
          </Link>
          <Link href={dashboardHref}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <DashIcon size={14} />
            <span>{dashboardLabel}</span>
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
            className="px-4 py-2 rounded-xl text-sm font-bold transition-all text-black"
            style={{ background: 'var(--green)', boxShadow: '0 4px 16px rgba(160,232,124,0.25)' }}>
            Get Started
          </Link>
        </>
      )}
    </div>
  );

  return (
    <nav className="sticky top-0 z-50" style={navBg}>
      <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 max-w-screen-xl mx-auto">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'var(--green)' }}>
            <Music2 size={15} className="text-black" />
          </div>
          <span className="text-base font-bold tracking-tight" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
            Vuka
          </span>
        </Link>

        {/* ── DESKTOP CENTER NAV (lg+) ──────────────────────────────────── */}
        <div className="hidden lg:flex items-center gap-0.5">
          {/* Store dropdown */}
          <div ref={storeRef} className="relative">
            <button
              onClick={() => setStoreOpen(v => !v)}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all"
              style={lnk(storeActive)}>
              Store
              <ChevronDown size={13} style={{
                opacity: 0.7,
                transform: storeOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s',
              }} />
            </button>
            {storeOpen && (
              <div className="absolute top-full left-0 mt-1 z-50"
                style={{ minWidth: 160, background: 'rgba(10,10,10,0.97)', border: '1px solid var(--border)', borderRadius: 12, padding: 6 }}>
                {storeDropLinks.map(l => (
                  <Link key={l.href} href={l.href}
                    onClick={() => setStoreOpen(false)}
                    className="block px-4 py-2.5 rounded-lg text-sm transition-colors"
                    style={{ color: isActive(l.href) ? 'var(--green)' : 'var(--text-muted)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                    {l.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Top-level links */}
          {[{ href: '/services', label: 'Services' }, { href: '/industry', label: 'For Industry' }].map(l => (
            <Link key={l.href} href={l.href}
              className="px-3 py-2 rounded-lg text-sm font-medium transition-all"
              style={lnk(isActive(l.href))}>
              {l.label}
            </Link>
          ))}

          {/* Role links when logged in */}
          {roleLinks.map(l => (
            <Link key={l.href} href={l.href}
              className="px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5"
              style={lnk(isActive(l.href))}>
              {'icon' in l && <l.icon size={13} />}
              {l.label}
            </Link>
          ))}
        </div>

        {/* ── DESKTOP RIGHT (lg+) ───────────────────────────────────────── */}
        <div className="hidden lg:flex">
          <RightActions />
        </div>

        {/* ── TABLET: right actions + hamburger (md–lg) ─────────────────── */}
        <div className="hidden md:flex lg:hidden items-center gap-2">
          <RightActions />
          <button
            className="p-2 rounded-xl transition-colors ml-1"
            style={{ color: 'var(--text-muted)' }}
            onClick={() => setMobileOpen(v => !v)}
            aria-label="Toggle menu">
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* ── MOBILE: icons + hamburger (< md) ──────────────────────────── */}
        <div className="flex md:hidden items-center gap-1">
          {user && (
            <>
              <Link href="/notifications" className="relative p-2 rounded-lg" style={{ color: 'var(--text-muted)' }}>
                <Bell size={19} />
                {unreadNotifs > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full text-[8px] font-bold text-white flex items-center justify-center"
                    style={{ background: '#e74c3c' }}>
                    {unreadNotifs}
                  </span>
                )}
              </Link>
              <Link href="/messages" className="relative p-2 rounded-lg" style={{ color: 'var(--text-muted)' }}>
                <MessageSquare size={19} />
                {unreadMsgs > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full text-[8px] font-bold text-black flex items-center justify-center"
                    style={{ background: 'var(--green)' }}>
                    {unreadMsgs}
                  </span>
                )}
              </Link>
            </>
          )}
          <button
            className="p-2 rounded-xl transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onClick={() => setMobileOpen(v => !v)}
            aria-label="Toggle menu">
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* ── MOBILE / TABLET FULL DRAWER ───────────────────────────────────── */}
      {mobileOpen && (
        <div className="lg:hidden overflow-y-auto"
          style={{ maxHeight: '85vh', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div className="flex flex-col">

            {/* ── Logged-in: account identity header ─────────────────────── */}
            {user && (
              <div className="px-4 pt-4 pb-3"
                style={{ borderBottom: '1px solid var(--border)' }}>
                {/* Email + role badge */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {role === 'admin' ? 'Administrator' :
                       role === 'industry' ? 'Industry Professional' :
                       role === 'artist' ? 'Artist' : 'Fan'}
                    </p>
                    <p className="text-sm font-medium truncate max-w-[220px]" style={{ color: 'var(--text)' }}>
                      {user.email}
                    </p>
                  </div>
                  <Link href={dashboardHref}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: 'rgba(160,232,124,0.12)', color: 'var(--green)', border: '1px solid rgba(160,232,124,0.2)' }}>
                    <DashIcon size={13} />
                    {role === 'admin' ? 'Admin' : role === 'industry' ? 'Portal' : role === 'artist' ? 'Dashboard' : 'Library'}
                  </Link>
                </div>

                {/* Quick-access grid for role-specific pages */}
                <div className="grid grid-cols-2 gap-2">
                  {quickLinks.map(l => (
                    <Link key={l.href} href={l.href}
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
                      style={{ background: isActive(l.href) ? 'rgba(160,232,124,0.1)' : 'rgba(255,255,255,0.04)', color: isActive(l.href) ? 'var(--green)' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      <l.icon size={15} />
                      {l.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* ── Browse / public links ───────────────────────────────────── */}
            <div className="px-4 py-3" style={{ borderBottom: user ? '1px solid var(--border)' : 'none' }}>
              <p className="text-[11px] font-semibold mb-2 px-1"
                style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Browse
              </p>
              <div className="flex flex-col gap-0.5">
                {publicLinks.map(l => (
                  <Link key={l.href} href={l.href}
                    onClick={() => setMobileOpen(false)}
                    className="py-2.5 px-3 rounded-xl text-sm font-medium transition-colors"
                    style={lnk(isActive(l.href))}>
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* ── Logged-in: discover + account footer ───────────────────── */}
            {user && (
              <>
                {/* Discover / Feed / role links */}
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <p className="text-[11px] font-semibold mb-2 px-1"
                    style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    Discover
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {roleLinks.map(l => (
                      <Link key={l.href} href={l.href}
                        onClick={() => setMobileOpen(false)}
                        className="py-2.5 px-3 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                        style={lnk(isActive(l.href))}>
                        {'icon' in l && <l.icon size={15} />}
                        {l.label}
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Sign out */}
                <div className="px-4 py-3">
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium transition-colors"
                    style={{ color: '#e74c3c', background: 'rgba(231,76,60,0.06)' }}>
                    <LogOut size={15} />
                    Sign Out
                  </button>
                </div>
              </>
            )}

            {/* ── Logged-out: auth CTAs ────────────────────────────────────── */}
            {!user && (
              <div className="px-4 py-3 flex flex-col gap-2">
                <Link href="/auth/login"
                  onClick={() => setMobileOpen(false)}
                  className="w-full py-3 px-3 rounded-xl text-sm font-medium text-center"
                  style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  Log In
                </Link>
                <Link href="/auth/register"
                  onClick={() => setMobileOpen(false)}
                  className="w-full py-3 px-3 rounded-xl text-sm font-bold text-black text-center"
                  style={{ background: 'var(--green)', boxShadow: '0 4px 16px rgba(160,232,124,0.25)' }}>
                  Get Started — It's Free
                </Link>
              </div>
            )}

          </div>
        </div>
      )}
    </nav>
  );
}

export default Navbar;
