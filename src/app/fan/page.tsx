'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { ShoppingBag, Heart, Download, Music2, ArrowRight, Loader2, ExternalLink, LogOut, UserCheck } from 'lucide-react';
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

export default function FanDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userName, setUserName] = useState('');
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [follows, setFollows] = useState<FollowedArtist[]>([]);
  const [wishlistItems, setWishlistItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'library' | 'following' | 'wishlist'>('library');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/auth/login'); return; }
      setUser(data.user);

      // Check if this user is actually an artist — redirect them
      try {
        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) {
          const me = await meRes.json();
          setUserName(me.name || data.user.email || '');
          if (me.isArtist) { router.replace('/dashboard'); return; }
        }
      } catch {}

      // Load purchases, follows, and wishlist in parallel
      await Promise.all([
        fetch('/api/dashboard/purchases')
          .then(r => r.json())
          .then(d => setPurchases(d.purchases || []))
          .catch(() => {}),
        fetch('/api/fan/follows')
          .then(r => r.json())
          .then(d => setFollows(d.follows || []))
          .catch(() => {}),
        fetch('/api/wishlist')
          .then(r => r.json())
          .then(d => setWishlistItems(d.items || []))
          .catch(() => {}),
      ]);
      setLoading(false);
    });
  }, [router]);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  }

  if (!user || loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <Loader2 size={24} className="animate-spin" style={{ color: 'var(--purple-light)' }} />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>
              {userName ? `Hey, ${userName.split(' ')[0]}` : 'Your Library'}
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Your music, artists, and downloads</p>
          </div>
          <button onClick={logout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-[var(--surface)]"
            style={{ color: 'var(--text-muted)' }}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {[
            { icon: ShoppingBag, label: 'Purchases', value: purchases.length, tab: 'library' as const, color: 'var(--purple-light)' },
            { icon: UserCheck, label: 'Following', value: follows.length, tab: 'following' as const, color: 'var(--red)' },
            { icon: Heart, label: 'Wishlist', value: wishlistItems.length, tab: 'wishlist' as const, color: 'var(--gold)' },
          ].map(s => (
            <button key={s.label} onClick={() => setActiveTab(s.tab)}
              className="flex items-center gap-4 p-5 rounded-2xl cursor-pointer transition-all text-left"
              style={{
                background: 'var(--surface)',
                border: `1px solid ${activeTab === s.tab ? 'var(--purple)' : 'var(--border)'}`,
              }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(124,58,237,0.1)' }}>
                <s.icon size={20} style={{ color: s.color }} />
              </div>
              <div>
                <div className="text-xl font-bold" style={{ color: 'var(--text)' }}>{s.value}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl mb-6 w-fit" style={{ background: 'var(--surface)' }}>
          {(['library', 'following', 'wishlist'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="px-5 py-2 rounded-lg text-sm font-semibold transition-all capitalize"
              style={{
                background: activeTab === tab ? 'var(--surface2)' : 'transparent',
                color: activeTab === tab ? 'var(--text)' : 'var(--text-muted)',
              }}>
              {tab === 'library' ? '🎵 Library' : tab === 'following' ? '❤️ Following' : '🔖 Wishlist'}
            </button>
          ))}
        </div>

        {/* Library Tab */}
        {activeTab === 'library' && (
          <section>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Your Purchases</h2>

            {purchases.length === 0 ? (
              <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <Music2 size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>No purchases yet</h3>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Browse the store and support independent artists</p>
                <Link href="/store" className="btn btn-primary">
                  Browse the Store <ArrowRight size={16} />
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {purchases.map(p => {
                  const title = p.beat?.title || p.release?.title || 'Unknown';
                  const artist = p.beat?.artist || p.release?.artist;
                  return (
                    <div key={p.id} className="flex items-center gap-4 p-4 rounded-xl"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: 'var(--surface2)' }}>
                        <Music2 size={18} style={{ color: 'var(--purple-light)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate" style={{ color: 'var(--text)' }}>{title}</p>
                        {artist && (
                          <Link href={`/artist/${artist.slug}`}
                            className="text-xs hover:underline" style={{ color: 'var(--text-muted)' }}>
                            {artist.name}
                          </Link>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                          {p.currency} {p.amount.toFixed(2)}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {new Date(p.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      {p.downloadToken && (
                        <Link href={`/download/${p.downloadToken}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0"
                          style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--green)', border: '1px solid rgba(16,185,129,0.2)' }}>
                          <Download size={13} />
                          Download
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-8 p-6 rounded-2xl text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <h3 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Can't find a download?</h3>
              <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Use your email to retrieve all past purchases</p>
              <Link href="/redownload" className="btn btn-secondary">
                Re-download Portal <ExternalLink size={15} />
              </Link>
            </div>
          </section>
        )}

        {/* Following Tab */}
        {activeTab === 'following' && (
          <section>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Artists You Follow</h2>

            {follows.length === 0 ? (
              <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <Heart size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Not following anyone yet</h3>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Visit an artist's page and hit Follow to stay connected</p>
                <Link href="/store" className="btn btn-primary">
                  Discover Artists <ArrowRight size={16} />
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {follows.map(artist => (
                  <Link key={artist.id} href={`/artist/${artist.slug}`}
                    className="flex items-center gap-4 p-4 rounded-2xl transition-all hover:scale-[1.01]"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0"
                      style={{ background: 'var(--surface2)' }}>
                      {artist.photoUrl
                        ? <img src={artist.photoUrl} alt={artist.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-2xl">🎤</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold truncate" style={{ color: 'var(--text)' }}>{artist.name}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {artist.city || artist.country}
                        {artist.genreTags?.length > 0 && ` · ${artist.genreTags[0]}`}
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                        {artist.beats.length} beats · {artist.releases.length} releases
                      </p>
                    </div>
                    <ExternalLink size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Wishlist Tab */}
        {activeTab === 'wishlist' && (
          <section>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Your Wishlist</h2>
            {wishlistItems.length === 0 ? (
              <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <Heart size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
                <h3 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Nothing saved yet</h3>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Hit the ♥ on any beat or release to save it here</p>
                <Link href="/store" className="btn btn-primary">Browse the Store <ArrowRight size={16} /></Link>
              </div>
            ) : (
              <div className="space-y-3">
                {wishlistItems.map((item: any) => (
                  <div key={item.id} className="flex items-center gap-4 p-4 rounded-xl"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
                      style={{ background: 'var(--surface2)' }}>
                      {item.detail?.artworkUrl
                        ? <img src={item.detail.artworkUrl} alt="" className="w-full h-full object-cover" />
                        : <span className="text-xl">{item.itemType === 'beat' ? '🎵' : '🎶'}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate" style={{ color: 'var(--text)' }}>
                        {item.detail?.title || item.itemType}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {item.detail?.artist?.name} · {item.itemType === 'beat'
                          ? `R${item.detail?.basicPrice}`
                          : `R${item.detail?.price}`}
                      </p>
                    </div>
                    <Link href={`/${item.itemType === 'beat' ? 'beat' : 'release'}/${item.detail?.slug || item.itemId}`}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0"
                      style={{ background: 'var(--surface2)', color: 'var(--purple-light)', border: '1px solid var(--border)' }}>
                      View →
                    </Link>
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
