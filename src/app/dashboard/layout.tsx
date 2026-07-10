// ============================================================
// src/app/dashboard/layout.tsx
// ============================================================
// REDESIGN: 23 flat nav items → Overview + 5 categories
// (Create, Engage, Grow, Money, Account). Desktop shows them as
// collapsible sections; mobile shows them as a small set of
// category buttons that drill down into a focused sheet.
//
// PLAN-GATING: The "Label" item inside Grow is only shown
// to artists on the 'label' plan (getEffectivePlan checks
// planSlug + planExpiresAt so expired label plans are hidden).
// ============================================================

'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { getEffectivePlan } from '@/lib/plans';
import VukaLoader from '@/components/brand/VukaLoader';
import VukaLogo from '@/components/brand/VukaLogo';
import {
  BarChart2, Music, Disc, Upload, ShoppingBag, Heart, Target,
  Wallet, Settings, LogOut, Music2, ChevronRight, ChevronDown,
  X, Send, Users, Store, Briefcase, Video, Package,
  MessageSquare, Share2, Trophy, Megaphone, GitFork, Calendar,
  Building2, TrendingUp, Sparkles, Rss, Clapperboard, type LucideIcon,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  highlight?: boolean;
  /** If true, only show this item when the effective plan is 'label' */
  labelPlanOnly?: boolean;
}
interface NavGroup { key: string; label: string; icon: LucideIcon; items: NavItem[] }

const OVERVIEW: NavItem = { href: '/dashboard', label: 'Overview', icon: BarChart2, exact: true };

/**
 * The Create group's item order (and the "Upload" quick-action's target)
 * differs by creator type: producers land on Beats/Services first since
 * beats+production services are their primary product, while artists see
 * Releases first. Everything else in the nav is identical for both.
 */
function getNavGroups(isProducer: boolean): NavGroup[] {
  const createItems: NavItem[] = isProducer
    ? [
        { href: '/dashboard/beats',        label: 'Beats',    icon: Music },
        { href: '/dashboard/services',     label: 'Services', icon: Briefcase },
        { href: '/dashboard/uploads',       label: 'Upload',   icon: Upload, highlight: true },
        { href: '/dashboard/videos',       label: 'Videos',   icon: Video },
        { href: '/dashboard/merch',         label: 'Merch',    icon: Package },
        { href: '/dashboard/releases',     label: 'Releases', icon: Disc },
      ]
    : [
        { href: '/dashboard/releases',     label: 'Releases', icon: Disc },
        { href: '/dashboard/releases/new', label: 'Upload',   icon: Upload, highlight: true },
        { href: '/dashboard/beats',        label: 'Beats',    icon: Music },
        { href: '/dashboard/videos',       label: 'Videos',   icon: Video },
        { href: '/dashboard/merch',         label: 'Merch',    icon: Package },
        { href: '/dashboard/services',     label: 'Services', icon: Briefcase },
      ];

  return [
  {
    key: 'create', label: 'Create', icon: Sparkles,
    items: createItems,
  },
  {
    key: 'engage', label: 'Engage', icon: Users,
    items: [
      { href: '/dashboard/social',       label: 'Posts',       icon: Send },
      { href: '/feed',                   label: 'Feed & Stories', icon: Rss },
      { href: '/reels',                  label: 'Reels',        icon: Clapperboard },
      { href: '/dashboard/support',      label: 'Fan Support', icon: Heart },
      { href: '/dashboard/memberships',  label: 'Memberships', icon: Users },
      { href: '/dashboard/storefront',   label: 'Storefront',  icon: Store },
    ],
  },
  {
    key: 'grow', label: 'Grow', icon: TrendingUp,
    items: [
      { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart2 },
      { href: '/dashboard/campaigns', label: 'Campaigns', icon: Megaphone },
      { href: '/dashboard/referrals', label: 'Referrals', icon: Share2 },
      { href: '/dashboard/plaques',   label: 'Plaques',   icon: Trophy },
      { href: '/dashboard/events',    label: 'Events',    icon: Calendar },
      {
        href: '/dashboard/label',
        label: 'Label',
        icon: Building2,
        labelPlanOnly: true,   // ← only shown when effectivePlan.slug === 'label'
      },
    ],
  },
  {
    key: 'money', label: 'Money', icon: Wallet,
    items: [
      { href: '/dashboard/earnings',  label: 'Earnings',     icon: Wallet },
      { href: '/dashboard/purchases', label: 'Sales',        icon: ShoppingBag },
      { href: '/dashboard/payouts',   label: 'Payouts',      icon: Wallet },
      { href: '/dashboard/splits',    label: 'Split Sheets', icon: GitFork },
    ],
  },
  {
    key: 'account', label: 'Account', icon: Settings,
    items: [
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    ],
  },
  ];
}

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname.startsWith(href);
}

function groupForPath(pathname: string, visibleGroups: NavGroup[]): string | null {
  for (const g of visibleGroups) {
    if (g.items.some(i => isActive(pathname, i.href, i.exact))) return g.key;
  }
  return null;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const path     = pathname || '';

  const [checking, setChecking]     = useState(true);
  const [userEmail, setUserEmail]   = useState('');
  const [artistName, setArtistName] = useState('');
  const [unreadMsgs, setUnreadMsgs] = useState(0);
  // Plan state — resolved via getEffectivePlan once /api/auth/me returns
  const [planSlug, setPlanSlug]         = useState<string>('free');
  const [planExpiresAt, setPlanExpiresAt] = useState<Date | null>(null);
  // Producer vs Artist — reorders the Create group (see getNavGroups)
  const [isProducer, setIsProducer] = useState(false);

  // Desktop: which category sections are expanded
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  // Mobile: which category sheet is open
  const [mobileGroup, setMobileGroup] = useState<string | null>(null);

  // Build the set of visible nav items after plan is known
  const isLabelPlan = getEffectivePlan(planSlug, planExpiresAt).slug === 'label';

  const visibleGroups: NavGroup[] = getNavGroups(isProducer).map(g => ({
    ...g,
    items: g.items.filter(i => !i.labelPlanOnly || isLabelPlan),
  }));

  const activeGroupKey = groupForPath(path, visibleGroups);

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
            setIsProducer(me.role === 'producer');
            // Store plan info from the artist payload
            if (me.artist?.planSlug) setPlanSlug(me.artist.planSlug);
            if (me.artist?.planExpiresAt) setPlanExpiresAt(new Date(me.artist.planExpiresAt));
            try {
              const countsRes = await fetch('/api/notifications/unread-counts');
              if (countsRes.ok) {
                const counts = await countsRes.json();
                setUnreadMsgs(counts.messages || 0);
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

  // Keep the unread-messages badge live without a full reload.
  useEffect(() => {
    if (!artistName) return;
    const poll = () => {
      if (document.hidden) return;
      fetch('/api/notifications/unread-counts')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setUnreadMsgs(d.messages || 0); })
        .catch(() => {});
    };
    const interval = setInterval(poll, 20000);
    document.addEventListener('visibilitychange', poll);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', poll); };
  }, [artistName]);

  // Auto-open the section containing the active route
  useEffect(() => {
    const g = groupForPath(path, visibleGroups);
    if (g) setOpenGroups(prev => (prev.has(g) ? prev : new Set(prev).add(g)));
  }, [path, isLabelPlan]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close mobile sheet on navigation
  useEffect(() => { setMobileGroup(null); }, [pathname]);

  function toggleGroup(key: string) {
    setOpenGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  }

  if (checking) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="flex items-center gap-3">
        <VukaLoader size={20} />
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>

      {/* ── Desktop Sidebar ─────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-64 min-h-screen flex-shrink-0"
        style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>

        <div className="px-5 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <Link href="/" className="flex items-center gap-2.5">
            <VukaLogo size={26} />
          </Link>
          {artistName && (
            <p className="text-xs mt-2 truncate" style={{ color: 'var(--text-muted)' }}>
              {artistName}
            </p>
          )}
          {/* Plan badge */}
          {planSlug !== 'free' && (
            <span className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
              style={{
                background: planSlug === 'label' ? 'rgba(232,200,124,0.15)' : 'rgba(56,182,232,0.12)',
                color: planSlug === 'label' ? 'var(--gold)' : 'var(--sky)',
                border: `1px solid ${planSlug === 'label' ? 'rgba(232,200,124,0.25)' : 'rgba(56,182,232,0.2)'}`,
              }}>
              {planSlug}
            </span>
          )}
        </div>

        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {/* Overview — always visible, top level */}
          <SideLink href={OVERVIEW.href} label={OVERVIEW.label} Icon={OVERVIEW.icon}
            active={isActive(path, OVERVIEW.href, true)} />

          {/* Messages — always visible, top level */}
          <SideLink href="/messages" label="Messages" Icon={MessageSquare}
            active={path === '/messages'} badge={unreadMsgs || undefined} />

          <Divider />

          {/* Categorised groups */}
          {visibleGroups.map(group => {
            const expanded = openGroups.has(group.key);
            const groupActive = activeGroupKey === group.key;
            return (
              <div key={group.key}>
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-semibold text-sm transition-all"
                  style={{ color: groupActive ? 'var(--sky)' : 'var(--text)' }}
                >
                  <group.icon size={16} className="flex-shrink-0" />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown
                    size={14}
                    style={{
                      color: 'var(--text-muted)',
                      transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                      transition: 'transform 0.15s ease',
                    }}
                  />
                </button>

                {expanded && (
                  <div className="ml-3 pl-3 space-y-0.5 mb-1"
                    style={{ borderLeft: '1px solid var(--border)' }}>
                    {group.items.map(item => {
                      const active = isActive(path, item.href, item.exact);
                      return (
                        <Link key={item.href} href={item.href}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-all"
                          style={{
                            background: active
                              ? 'var(--surface2)'
                              : item.highlight && !active
                                ? 'rgba(160,232,124,0.08)'
                                : 'transparent',
                            color: active
                              ? 'var(--text)'
                              : item.highlight
                                ? 'var(--sky)'
                                : 'var(--text-muted)',
                            border: item.highlight && !active
                              ? '1px solid rgba(160,232,124,0.2)'
                              : '1px solid transparent',
                          }}>
                          <item.icon size={15} className="flex-shrink-0" />
                          <span className="flex-1">{item.label}</span>
                          {active && <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="px-3 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{userEmail}</p>
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
        {children}
      </main>

      {/* ── Mobile Bottom Nav ────────────────────────────────── */}
      {/* Overview + Create / Engage / Grow / Money + More (Account + Messages) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 flex z-50"
        style={{
          background: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>

        <MobileTab href={OVERVIEW.href} label="Overview" Icon={OVERVIEW.icon}
          active={isActive(path, OVERVIEW.href, true)} onClick={() => setMobileGroup(null)} />

        {visibleGroups.filter(g => g.key !== 'account').map(group => {
          const groupActive = activeGroupKey === group.key || mobileGroup === group.key;
          return (
            <button key={group.key}
              onClick={() => setMobileGroup(v => v === group.key ? null : group.key)}
              className="flex-1 flex flex-col items-center py-3 gap-0.5 min-h-[56px] justify-center relative"
              style={{ color: groupActive ? 'var(--sky)' : 'var(--text-muted)' }}>
              <group.icon size={20} />
              <span className="text-[10px] font-medium">{group.label}</span>
              {activeGroupKey === group.key && (
                <span className="absolute top-1.5 w-1 h-1 rounded-full" style={{ background: 'var(--sky)' }} />
              )}
            </button>
          );
        })}

        <button
          onClick={() => setMobileGroup(v => v === 'more' ? null : 'more')}
          className="flex-1 flex flex-col items-center py-3 gap-0.5 min-h-[56px] justify-center relative"
          style={{ color: mobileGroup === 'more' || activeGroupKey === 'account' || path === '/messages' ? 'var(--sky)' : 'var(--text-muted)' }}>
          <Settings size={20} />
          <span className="text-[10px] font-medium">More</span>
          {unreadMsgs > 0 && (
            <span className="absolute top-1 right-5 text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center text-black"
              style={{ background: 'var(--sky)' }}>
              {unreadMsgs > 9 ? '9+' : unreadMsgs}
            </span>
          )}
        </button>
      </nav>

      {/* ── Mobile Category Sheet ────────────────────────────── */}
      {mobileGroup && (
        <>
          <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMobileGroup(null)} />
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl"
            style={{
              background: 'var(--surface)',
              borderTop: '1px solid var(--border)',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 80px)',
            }}>

            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>
                {mobileGroup === 'more'
                  ? 'More'
                  : visibleGroups.find(g => g.key === mobileGroup)?.label}
              </p>
              <button onClick={() => setMobileGroup(null)} style={{ color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <div className="p-3 space-y-0.5 max-h-[60vh] overflow-y-auto">
              {mobileGroup === 'more' ? (
                <>
                  <SheetLink href="/messages" label="Messages" Icon={MessageSquare}
                    active={path === '/messages'} badge={unreadMsgs || undefined} />
                  {visibleGroups.find(g => g.key === 'account')!.items.map(item => (
                    <SheetLink key={item.href} href={item.href} label={item.label}
                      Icon={item.icon} active={isActive(path, item.href, item.exact)} />
                  ))}
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
                    <button onClick={logout}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm w-full"
                      style={{ color: 'var(--text-muted)' }}>
                      <LogOut size={18} /><span>Sign out</span>
                    </button>
                  </div>
                </>
              ) : (
                visibleGroups.find(g => g.key === mobileGroup)?.items.map(item => (
                  <SheetLink key={item.href} href={item.href} label={item.label}
                    Icon={item.icon} active={isActive(path, item.href, item.exact)}
                    highlight={item.highlight} />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Small reusable sub-components to keep the JSX above readable ──

function SideLink({ href, label, Icon, active, badge }: {
  href: string; label: string; Icon: LucideIcon; active: boolean; badge?: number;
}) {
  return (
    <Link href={href}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-all"
      style={{
        background: active ? 'var(--surface2)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--text-muted)',
      }}>
      <Icon size={16} className="flex-shrink-0" />
      <span className="flex-1">{label}</span>
      {badge ? (
        <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-black"
          style={{ background: 'var(--sky)', minWidth: 18, textAlign: 'center' }}>
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function MobileTab({ href, label, Icon, active, onClick }: {
  href: string; label: string; Icon: LucideIcon; active: boolean; onClick?: () => void;
}) {
  return (
    <Link href={href} onClick={onClick}
      className="flex-1 flex flex-col items-center py-3 gap-0.5 min-h-[56px] justify-center"
      style={{ color: active ? 'var(--sky)' : 'var(--text-muted)' }}>
      <Icon size={20} />
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  );
}

function SheetLink({ href, label, Icon, active, badge, highlight }: {
  href: string; label: string; Icon: LucideIcon; active: boolean; badge?: number; highlight?: boolean;
}) {
  return (
    <Link href={href}
      className="flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all"
      style={{
        background: active ? 'var(--surface2)' : highlight && !active ? 'rgba(160,232,124,0.08)' : 'transparent',
        color: active ? 'var(--text)' : highlight ? 'var(--sky)' : 'var(--text-muted)',
      }}>
      <Icon size={18} />
      <span className="flex-1">{label}</span>
      {badge ? (
        <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-black"
          style={{ background: 'var(--sky)' }}>
          {badge}
        </span>
      ) : null}
      {active && <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
    </Link>
  );
}

function Divider() {
  return (
    <div className="py-2 px-1">
      <div style={{ borderTop: '1px solid var(--border)' }} />
    </div>
  );
}
