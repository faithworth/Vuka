'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import {
  ShoppingBag, Heart, Download, Music2, ExternalLink, LogOut, UserCheck, Rss, Bell, Users, CheckCheck, MessageCircle, Star, Package, XCircle, AlertCircle,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import VukaLoader from '@/components/brand/VukaLoader';

interface Purchase {
  id: string;
  createdAt: string;
  amount: number;
  currency: string;
  itemType: string;
  downloadToken?: string;
  beat?: { title: string; slug: string; artist: { name: string; slug: string } };
  release?: { title: string; slug: string; artist: { name: string; slug: string } };
  video?: { title: string; slug: string; artist: { name: string; slug: string } };
  sample?: { title: string; slug: string; artist: { name: string; slug: string } };
  merch?: { title: string; slug: string; artist: { name: string; slug: string } };
  artist?: { name: string; slug: string };
}

interface FollowedArtist {
  id: string; name: string; slug: string; photoUrl: string;
  city: string; country: string; genreTags: string[];
  beats: { id: string }[]; releases: { id: string }[];
}

interface Notification {
  id: string; type: string; title: string; body: string;
  isRead: boolean; createdAt: string; linkType: string; linkId: string;
}

interface Membership {
  id: string;
  tierId: string;
  status: string;
  billingInterval: string;
  expiresAt?: string;
  tier: { id: string; name: string; price: number; perks: string[]; artist: { name: string; slug: string; photoUrl?: string } };
}

type Tab = 'library' | 'following' | 'feed' | 'notifications' | 'memberships' | 'wishlist';

const NOTIF_ICON: Record<string, any> = {
  new_sale: ShoppingBag, new_follower: Users, new_comment: MessageCircle,
  new_like: Heart, new_message: MessageCircle, new_post: Music2,
  milestone_followers: Star, milestone_sales: Star,
};
const NOTIF_COLOR: Record<string, string> = {
  new_sale: 'var(--green)', new_follower: 'var(--sky)', new_comment: 'var(--gold)',
  new_like: '#e74c3c', new_message: 'var(--sky)', new_post: 'var(--sky)',
  milestone_followers: 'var(--gold)', milestone_sales: 'var(--gold)',
};

function notifHref(n: Notification): string {
  switch (n.linkType) {
    case 'post':    return '/feed';
    case 'artist':  return `/artist/${n.linkId}`;
    case 'beat':    return `/beat/${n.linkId}`;
    case 'release': return `/release/${n.linkId}`;
    case 'message': return '/messages';
    default:        return '/fan';
  }
}

function itemLabel(p: Purchase): { title: string; href: string | null; type: string } {
  if (p.beat)    return { title: p.beat.title,    href: `/beat/${p.beat.slug}`,       type: 'Beat' };
  if (p.release) return { title: p.release.title, href: `/release/${p.release.slug}`, type: 'Release' };
  if (p.video)   return { title: p.video.title,   href: `/videos/${p.video.slug}`,    type: 'Video' };
  if (p.sample)  return { title: p.sample.title,  href: `/samples/${p.sample.slug}`,  type: 'Sample' };
  if (p.merch)   return { title: p.merch.title,   href: `/merch/${p.merch.slug}`,     type: 'Merch' };
  if (p.itemType === 'membership' && p.artist)
    return { title: `${p.artist.name} Membership`, href: `/artist/${p.artist.slug}?tab=membership`, type: 'Membership' };
  return { title: p.itemType || 'Unknown', href: null, type: p.itemType };
}

function itemArtist(p: Purchase): string {
  return p.beat?.artist?.name || p.release?.artist?.name || p.video?.artist?.name ||
         p.sample?.artist?.name || p.merch?.artist?.name || '';
}

export default function FanDashboard() {
  const router = useRouter();
  const [user, setUser]             = useState<any>(null);
  const [userName, setUserName]     = useState('');
  const [purchases, setPurchases]   = useState<Purchase[]>([]);
  const [follows, setFollows]       = useState<FollowedArtist[]>([]);
  const [wishlistItems, setWishlistItems] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState<Tab>('library');
  const [markingAll, setMarkingAll] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState('');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/auth/login'); return; }
      setUser(data.user);
      try {
        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) {
          const me = await meRes.json();
          setUserName(me.name || data.user.email || '');
          if (['admin', 'owner', 'super_admin'].includes(me.role)) { router.replace('/admin'); return; }
          if (me.isIndustry || me.role === 'industry') { router.replace('/industry-dashboard'); return; }
          if (me.isArtist || me.role === 'artist' || me.role === 'producer' || me.role === 'verified_artist') { router.replace('/dashboard'); return; }
        }
      } catch {}

      await fetch('/api/auth/heal-purchases', { method: 'POST' }).catch(() => {});

      await Promise.all([
        fetch('/api/dashboard/purchases').then(r => r.json()).then(d => setPurchases(d.purchases || [])).catch(() => {}),
        fetch('/api/fan/follows').then(r => r.json()).then(d => setFollows(d.follows || [])).catch(() => {}),
        fetch('/api/wishlist').then(r => r.json()).then(d => setWishlistItems(d.items || [])).catch(() => {}),
        fetch('/api/social/notifications').then(r => r.json()).then(d => setNotifications(d.notifications || [])).catch(() => {}),
        fetch('/api/creator/memberships').then(r => r.json()).then(d => setMemberships(d.memberships || [])).catch(() => {}),
      ]);
      setLoading(false);
    });
  }, [router]);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  }

  async function markAllRead() {
    setMarkingAll(true);
    try {
      await fetch('/api/social/notifications', { method: 'PATCH' });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch {}
    setMarkingAll(false);
  }

  async function handleNotifClick(n: Notification) {
    if (!n.isRead) {
      try {
        await fetch('/api/social/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [n.id] }),
        });
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, isRead: true } : x));
      } catch {}
    }
    router.push(notifHref(n));
  }

  async function handleCancelMembership(membership: Membership) {
    setCancellingId(membership.id);
    setCancelError('');
    try {
      const res = await fetch(`/api/creator/memberships?tierId=${membership.tierId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setCancelError(data.error || 'Cancellation failed');
      } else {
        setMemberships(prev => prev.filter(m => m.id !== membership.id));
      }
    } catch {
      setCancelError('Network error. Please try again.');
    }
    setCancellingId(null);
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (!user || loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <VukaLoader size={24} />
    </div>
  );

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'library',       label: '🎵 Library' },
    { key: 'following',     label: '❤️ Following' },
    { key: 'feed',          label: '📡 Feed' },
    { key: 'notifications', label: '🔔 Alerts', badge: unreadCount },
    { key: 'memberships',   label: '👥 Members' },
    { key: 'wishlist',      label: '🔖 Wishlist' },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              {userName ? `Hey, ${userName.split(' ')[0]}` : 'Your Library'}
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Your music, artists, and updates</p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/settings/security"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-[var(--surface)]"
              style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              Security
            </a>
            <button onClick={logout}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-[var(--surface)]"
              style={{ color: 'var(--text-muted)' }}>
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { icon: ShoppingBag, label: 'Purchases',  value: purchases.length,   color: 'var(--sky)',  tab: 'library' as Tab },
            { icon: UserCheck,   label: 'Following',  value: follows.length,     color: 'var(--red)',  tab: 'following' as Tab },
            { icon: Bell,        label: 'Unread',     value: unreadCount,        color: '#e74c3c',     tab: 'notifications' as Tab },
            { icon: Users,       label: 'Memberships',value: memberships.length, color: 'var(--gold)', tab: 'memberships' as Tab },
          ].map(s => (
            <button key={s.label} onClick={() => setActiveTab(s.tab)}
              className="flex items-center gap-3 p-4 rounded-2xl cursor-pointer transition-all text-left"
              style={{ background: 'var(--surface)', border: `1px solid ${activeTab === s.tab ? 'var(--sky)' : 'var(--border)'}` }}>
              <s.icon size={18} style={{ color: s.color }} />
              <div>
                <div className="text-lg font-bold" style={{ color: 'var(--text)' }}>{s.value}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 flex-wrap mb-6">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className="relative px-4 py-2 rounded-xl text-sm font-medium transition-all"
              style={{
                background: activeTab === t.key ? 'var(--sky)' : 'var(--surface)',
                color: activeTab === t.key ? 'white' : 'var(--text-muted)',
                border: `1px solid ${activeTab === t.key ? 'var(--sky)' : 'var(--border)'}`,
              }}>
              {t.label}
              {(t.badge ?? 0) > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
                  style={{ background: '#e74c3c' }}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── LIBRARY ─────────────────────────────────────────── */}
        {activeTab === 'library' && (
          <section>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Your Purchases</h2>
            {!purchases.length ? (
              <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <Music2 size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>No purchases yet</h3>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Browse the store and support independent artists</p>
                <Link href="/store" className="btn btn-primary">Browse Store</Link>
              </div>
            ) : (
              <div className="space-y-3">
                {purchases.map(p => {
                  const { title, href, type } = itemLabel(p);
                  const artist = itemArtist(p);
                  const isMerch = type === 'Merch';
                  return (
                    <div key={p.id} className="card p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: isMerch ? 'rgba(160,232,124,0.1)' : 'rgba(56,182,232,0.1)' }}>
                        {isMerch
                          ? <Package size={18} style={{ color: 'var(--green)' }} />
                          : <ShoppingBag size={18} style={{ color: 'var(--sky)' }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{title}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {type} · {artist} · {timeAgo(p.createdAt)}
                        </p>
                        {isMerch && (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            Physical item — check your email for shipping details
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="font-bold text-sm" style={{ color: 'var(--sky)' }}>R{p.amount}</span>
                        {p.downloadToken && !isMerch && (
                          <Link href={`/download/${p.downloadToken}`}
                            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                            style={{ background: 'var(--surface2)', color: 'var(--sky)', border: '1px solid var(--border)' }}>
                            <Download size={12} /> Download
                          </Link>
                        )}
                        {href && isMerch && (
                          <Link href={href}
                            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                            style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                            View
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── FOLLOWING ───────────────────────────────────────── */}
        {activeTab === 'following' && (
          <section>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Artists You Follow</h2>
            {!follows.length ? (
              <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <UserCheck size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Not following anyone yet</h3>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Follow artists to see their posts in your feed</p>
                <Link href="/discover" className="btn btn-primary">Discover Artists</Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {follows.map(a => (
                  <Link key={a.id} href={`/artist/${a.slug}`} className="card p-4 flex items-center gap-4">
                    {a.photoUrl
                      ? <img src={a.photoUrl} alt={a.name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                      : <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white" style={{ background: 'var(--sky)' }}>{a.name[0]}</div>}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{a.name}</p>
                      {a.genreTags?.length > 0 && (
                        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{a.genreTags.slice(0, 2).join(' · ')}</p>
                      )}
                    </div>
                    <ExternalLink size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── FEED ────────────────────────────────────────────── */}
        {activeTab === 'feed' && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Artist Feed</h2>
              <Link href="/feed" className="text-sm font-medium flex items-center gap-1" style={{ color: 'var(--sky)' }}>
                <Rss size={13} /> Open full feed
              </Link>
            </div>
            {!follows.length ? (
              <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <Rss size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Follow artists to see their posts</h3>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Your feed will show updates from artists you follow</p>
                <Link href="/discover" className="btn btn-primary">Discover Artists</Link>
              </div>
            ) : (
              <div className="text-center py-12 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <Rss size={32} className="mx-auto mb-3" style={{ color: 'var(--sky)' }} />
                <p className="font-semibold mb-2" style={{ color: 'var(--text)' }}>See all posts in the full feed</p>
                <Link href="/feed" className="btn btn-primary gap-2"><Rss size={14} /> Open Feed</Link>
              </div>
            )}
          </section>
        )}

        {/* ── NOTIFICATIONS ───────────────────────────────────── */}
        {activeTab === 'notifications' && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
                Notifications {unreadCount > 0 && <span className="text-sm font-normal ml-1" style={{ color: 'var(--text-muted)' }}>({unreadCount} unread)</span>}
              </h2>
              {unreadCount > 0 && (
                <button onClick={markAllRead} disabled={markingAll}
                  className="flex items-center gap-1.5 text-sm font-medium disabled:opacity-50"
                  style={{ color: 'var(--sky)' }}>
                  {markingAll ? <VukaLoader size={13} /> : <CheckCheck size={13} />} Mark all read
                </button>
              )}
            </div>
            {!notifications.length ? (
              <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <Bell size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
                <p className="font-semibold" style={{ color: 'var(--text)' }}>No notifications yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {notifications.slice(0, 20).map(n => {
                  const Icon = NOTIF_ICON[n.type] || Bell;
                  const color = NOTIF_COLOR[n.type] || 'var(--sky)';
                  return (
                    <button key={n.id} onClick={() => handleNotifClick(n)}
                      className="w-full text-left card p-4 flex gap-3 items-start transition-opacity hover:opacity-90 cursor-pointer"
                      style={{ opacity: n.isRead ? 0.65 : 1 }}>
                      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: `${color}1a` }}>
                        <Icon size={16} style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{n.title}</p>
                          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{timeAgo(n.createdAt)}</span>
                        </div>
                        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{n.body}</p>
                      </div>
                      {!n.isRead && <div className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ background: 'var(--sky)' }} />}
                    </button>
                  );
                })}
                {notifications.length > 20 && (
                  <Link href="/notifications" className="block text-center py-3 text-sm font-medium" style={{ color: 'var(--sky)' }}>
                    View all {notifications.length} notifications →
                  </Link>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── MEMBERSHIPS ─────────────────────────────────────── */}
        {activeTab === 'memberships' && (
          <section>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Active Memberships</h2>

            {cancelError && (
              <div className="mb-4 p-3 rounded-xl flex items-center gap-2 text-sm"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--gold)' }}>
                <AlertCircle size={14} /> {cancelError}
              </div>
            )}

            {!memberships.length ? (
              <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <Users size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
                <p className="font-semibold mb-2" style={{ color: 'var(--text)' }}>No active memberships</p>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                  Support artists by subscribing to their membership tiers — visit any artist profile to join
                </p>
                <Link href="/discover" className="btn btn-primary">Discover Artists</Link>
              </div>
            ) : (
              <div className="space-y-3">
                {memberships.map(m => (
                  <div key={m.id} className="card p-4 flex items-start gap-4">
                    {m.tier?.artist?.photoUrl ? (
                      <img src={m.tier.artist.photoUrl} alt={m.tier.artist.name}
                        className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white"
                        style={{ background: 'var(--sky)' }}>
                        {m.tier?.artist?.name?.[0] || '?'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                        {m.tier?.name} — {m.tier?.artist?.name}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        R{m.tier?.price}/mo · {m.billingInterval} · {m.status}
                        {m.expiresAt && new Date(m.expiresAt) > new Date() && ` · Expires ${new Date(m.expiresAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                      </p>
                      {m.tier?.perks?.length > 0 && (
                        <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                          {m.tier.perks.slice(0, 2).join(' · ')}{m.tier.perks.length > 2 ? ' …' : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <Link href={`/artist/${m.tier?.artist?.slug}`}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg text-center"
                        style={{ background: 'var(--surface2)', color: 'var(--sky)', border: '1px solid var(--border)' }}>
                        View Artist
                      </Link>
                      <button
                        onClick={() => handleCancelMembership(m)}
                        disabled={cancellingId === m.id}
                        className="flex items-center justify-center gap-1 text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
                        style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                        {cancellingId === m.id
                          ? <VukaLoader size={11} />
                          : <XCircle size={11} />}
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── WISHLIST ─────────────────────────────────────────── */}
        {activeTab === 'wishlist' && (
          <section>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Wishlist</h2>
            {!wishlistItems.length ? (
              <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <Heart size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
                <p className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Your wishlist is empty</p>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Save beats, releases, and merch to buy later</p>
                <Link href="/store" className="btn btn-primary">Browse Store</Link>
              </div>
            ) : (
              <div className="space-y-3">
                {wishlistItems.map((item: any) => {
                  const title = item.beat?.title || item.release?.title || item.merch?.title || 'Unknown';
                  const artwork = item.beat?.artworkUrl || item.release?.artworkUrl || item.merch?.imageUrl;
                  const artistName = item.beat?.artist?.name || item.release?.artist?.name || item.merch?.artist?.name;
                  const type = item.beat ? 'Beat' : item.release ? 'Release' : item.merch ? 'Merch' : 'Item';
                  const href = item.beat ? `/beat/${item.beat.slug}` : item.release ? `/release/${item.release.slug}` : item.merch ? `/merch/${item.merch.slug}` : null;
                  return (
                    <div key={item.id} className="card p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0" style={{ background: 'var(--surface2)' }}>
                        {artwork
                          ? <img src={artwork} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center">
                              {type === 'Merch' ? <Package size={16} style={{ color: 'var(--text-muted)' }} /> : <Heart size={16} style={{ color: 'var(--text-muted)' }} />}
                            </div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{title}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{type}{artistName ? ` · ${artistName}` : ''}</p>
                      </div>
                      {href && (
                        <Link href={href}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg flex-shrink-0"
                          style={{ background: 'var(--sky)', color: 'white' }}>
                          View
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

      </div>
    </div>
  );
}
