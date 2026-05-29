'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import {
  ShoppingBag, Heart, Download, Music2, Loader2, ExternalLink,
  LogOut, UserCheck, Rss, Bell, Users, CheckCheck,
} from 'lucide-react';
import Navbar from '@/components/Navbar';

interface Purchase {
  id: string;
  createdAt: string;
  amount: number;
  currency: string;
  downloadToken?: string;
  beat?: { title: string; artist: { name: string; slug: string } };
  release?: { title: string; artist: { name: string; slug: string } };
}

interface FollowedArtist {
  id: string;
  name: string;
  slug: string;
  photoUrl: string;
  city: string;
  country: string;
  genreTags: string[];
  beats: { id: string }[];
  releases: { id: string }[];
}

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

interface Membership {
  id: string;
  tier: { name: string; price: number; artist: { name: string; slug: string } };
  status: string;
  renewsAt?: string;
}

type Tab = 'library' | 'following' | 'feed' | 'notifications' | 'memberships' | 'wishlist';

export default function FanDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userName, setUserName] = useState('');
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [follows, setFollows] = useState<FollowedArtist[]>([]);
  const [wishlistItems, setWishlistItems] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('library');
  const [markingAll, setMarkingAll] = useState(false);

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
          if (me.role === 'admin' || me.role === 'owner' || me.role === 'super_admin') { router.replace('/admin'); return; }
          if (me.isIndustry || me.role === 'industry') { router.replace('/industry-dashboard'); return; }
          if (me.isArtist) { router.replace('/dashboard'); return; }
        }
      } catch {}

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
      <Loader2 size={24} className="animate-spin" style={{ color: 'var(--sky)' }} />
    </div>
  );

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'library', label: '🎵 Library' },
    { key: 'following', label: '❤️ Following' },
    { key: 'feed', label: '📡 Feed' },
    { key: 'notifications', label: '🔔 Alerts', badge: unreadCount },
    { key: 'memberships', label: '👥 Members' },
    { key: 'wishlist', label: '🔖 Wishlist' },
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
          <button onClick={logout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-[var(--surface)]"
            style={{ color: 'var(--text-muted)' }}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { icon: ShoppingBag, label: 'Purchases', value: purchases.length, color: 'var(--sky)', tab: 'library' as Tab },
            { icon: UserCheck, label: 'Following', value: follows.length, color: 'var(--red)', tab: 'following' as Tab },
            { icon: Bell, label: 'Unread', value: unreadCount, color: '#e74c3c', tab: 'notifications' as Tab },
            { icon: Users, label: 'Memberships', value: memberships.length, color: 'var(--gold)', tab: 'memberships' as Tab },
          ].map(s => (
            <button key={s.label} onClick={() => setActiveTab(s.tab)}
              className="flex items-center gap-3 p-4 rounded-2xl cursor-pointer transition-all text-left"
              style={{
                background: 'var(--surface)',
                border: `1px solid ${activeTab === s.tab ? 'var(--sky)' : 'var(--border)'}`,
              }}>
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

        {/* ── LIBRARY TAB ─────────────────────────────────────── */}
        {activeTab === 'library' && (
          <section>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Your Purchases</h2>
            {purchases.length === 0 ? (
              <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <Music2 size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>No purchases yet</h3>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Browse the store and support independent artists</p>
                <Link href="/store" className="btn btn-primary">Browse Store</Link>
              </div>
            ) : (
              <div className="space-y-3">
                {purchases.map(p => {
                  const item = p.beat || p.release;
                  const type = p.beat ? 'Beat' : 'Release';
                  return (
                    <div key={p.id} className="card p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(56,182,232,0.1)' }}>
                        <ShoppingBag size={18} style={{ color: 'var(--sky)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>
                          {item?.title || 'Unknown'}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {type} · {item?.artist?.name} · {timeAgo(p.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="font-bold text-sm" style={{ color: 'var(--sky)' }}>
                          R{p.amount}
                        </span>
                        {p.downloadToken && (
                          <Link href={`/download/${p.downloadToken}`}
                            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                            style={{ background: 'var(--surface2)', color: 'var(--sky)', border: '1px solid var(--border)' }}>
                            <Download size={12} /> Download
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

        {/* ── FOLLOWING TAB ───────────────────────────────────── */}
        {activeTab === 'following' && (
          <section>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Artists You Follow</h2>
            {follows.length === 0 ? (
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
                    {a.photoUrl ? (
                      <img src={a.photoUrl} alt={a.name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white"
                        style={{ background: 'var(--sky)' }}>
                        {a.name[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{a.name}</p>
                      {a.genreTags?.length > 0 && (
                        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                          {a.genreTags.slice(0, 2).join(' · ')}
                        </p>
                      )}
                    </div>
                    <ExternalLink size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── FEED TAB ────────────────────────────────────────── */}
        {activeTab === 'feed' && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Artist Feed</h2>
              <Link href="/feed" className="text-sm font-medium flex items-center gap-1" style={{ color: 'var(--sky)' }}>
                <Rss size={13} /> Open full feed
              </Link>
            </div>
            {follows.length === 0 ? (
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
                <Link href="/feed" className="btn btn-primary gap-2">
                  <Rss size={14} /> Open Feed
                </Link>
              </div>
            )}
          </section>
        )}

        {/* ── NOTIFICATIONS TAB ───────────────────────────────── */}
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
                  {markingAll ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} />}
                  Mark all read
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <Bell size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
                <p className="font-semibold" style={{ color: 'var(--text)' }}>No notifications yet</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>You'll be notified about new releases and messages</p>
              </div>
            ) : (
              <div className="space-y-2">
                {notifications.slice(0, 20).map(n => (
                  <div key={n.id} className="card p-4 flex gap-3 items-start"
                    style={{ opacity: n.isRead ? 0.65 : 1 }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{n.title}</p>
                        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{timeAgo(n.createdAt)}</span>
                      </div>
                      <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{n.body}</p>
                    </div>
                    {!n.isRead && <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: 'var(--sky)' }} />}
                  </div>
                ))}
                {notifications.length > 20 && (
                  <Link href="/notifications" className="block text-center py-3 text-sm font-medium" style={{ color: 'var(--sky)' }}>
                    View all {notifications.length} notifications →
                  </Link>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── MEMBERSHIPS TAB ─────────────────────────────────── */}
        {activeTab === 'memberships' && (
          <section>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Active Memberships</h2>
            {memberships.length === 0 ? (
              <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <Users size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
                <p className="font-semibold mb-2" style={{ color: 'var(--text)' }}>No active memberships</p>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Support artists by subscribing to their membership tiers</p>
                <Link href="/discover" className="btn btn-primary">Discover Artists</Link>
              </div>
            ) : (
              <div className="space-y-3">
                {memberships.map(m => (
                  <div key={m.id} className="card p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(56,182,232,0.1)' }}>
                      <Users size={18} style={{ color: 'var(--sky)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                        {m.tier?.name} — {m.tier?.artist?.name}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        R{m.tier?.price}/mo · {m.status}
                        {m.renewsAt && ` · Renews ${timeAgo(m.renewsAt)}`}
                      </p>
                    </div>
                    <Link href={`/artist/${m.tier?.artist?.slug}`}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg"
                      style={{ background: 'var(--surface2)', color: 'var(--sky)', border: '1px solid var(--border)' }}>
                      View Artist
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── WISHLIST TAB ────────────────────────────────────── */}
        {activeTab === 'wishlist' && (
          <section>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Wishlist</h2>
            {wishlistItems.length === 0 ? (
              <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <Heart size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
                <p className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Your wishlist is empty</p>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Save beats and releases to buy later</p>
                <Link href="/store" className="btn btn-primary">Browse Store</Link>
              </div>
            ) : (
              <div className="space-y-3">
                {wishlistItems.map((item: any) => (
                  <div key={item.id} className="card p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0" style={{ background: 'var(--surface2)' }}>
                      {item.beat?.artworkUrl || item.release?.artworkUrl
                        ? <img src={item.beat?.artworkUrl || item.release?.artworkUrl} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Heart size={16} style={{ color: 'var(--text-muted)' }} /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>
                        {item.beat?.title || item.release?.title || 'Unknown'}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {item.beat ? 'Beat' : 'Release'} · {item.beat?.artist?.name || item.release?.artist?.name}
                      </p>
                    </div>
                    {item.beat && (
                      <Link href={`/beat/${item.beat.slug}`}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg flex-shrink-0"
                        style={{ background: 'var(--sky)', color: 'white' }}>
                        View
                      </Link>
                    )}
                    {item.release && (
                      <Link href={`/release/${item.release.slug}`}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg flex-shrink-0"
                        style={{ background: 'var(--sky)', color: 'white' }}>
                        View
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

      </div>
    </div>
  );
}
