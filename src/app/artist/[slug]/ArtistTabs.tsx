'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Music, Disc, Send, Heart, MessageCircle, Repeat2, ExternalLink,
  Loader2, Video, Package, ShoppingBag, Users, Check, Zap,
} from 'lucide-react';
import { BeatCard } from '@/components/BeatCard';
import { ReleaseCard } from '@/components/ReleaseCard';

interface Post {
  id: string;
  body: string;
  mediaUrls: string[];
  linkType: string;
  linkUrl: string;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  publishedAt: string;
}

interface ArtistTabsProps {
  artist: any;
}

export default function ArtistTabs({ artist }: ArtistTabsProps) {
  type Tab = 'beats' | 'releases' | 'videos' | 'samples' | 'merch' | 'membership' | 'posts';

  const allReleases = [
    ...(artist.releases ?? []),
    ...(artist.distributionReleases ?? []),
  ];

  const hasMerch       = (artist.merch?.length ?? 0) > 0;
  const hasMemberships = (artist.subscriptionTiers?.length ?? 0) > 0;

  const defaultTab: Tab =
    artist.beats?.length > 0   ? 'beats'      :
    allReleases.length > 0     ? 'releases'   :
    artist.videos?.length > 0  ? 'videos'     :
    artist.samples?.length > 0 ? 'samples'    :
    hasMerch                   ? 'merch'      :
    hasMemberships             ? 'membership' : 'posts';

  const [activeTab, setActiveTab]     = useState<Tab>(defaultTab);
  const [posts, setPosts]             = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsFetched, setPostsFetched] = useState(false);
  const [subscribing, setSubscribing]   = useState<string | null>(null);
  const [subscribeError, setSubscribeError]   = useState('');
  const [subscribeSuccess, setSubscribeSuccess] = useState('');

  useEffect(() => {
    if (activeTab === 'posts' && !postsFetched) {
      setPostsLoading(true);
      fetch(`/api/social/posts?artistSlug=${artist.slug}`)
        .then(r => r.ok ? r.json() : { posts: [] })
        .then(d => { setPosts(d.posts || []); setPostsFetched(true); setPostsLoading(false); })
        .catch(() => setPostsLoading(false));
    }
  }, [activeTab, postsFetched, artist.slug]);

  async function handleSubscribe(tier: any) {
    setSubscribeError(''); setSubscribeSuccess('');
    setSubscribing(tier.id);
    try {
      const res = await fetch('/api/creator/memberships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierId: tier.id, artistId: artist.id, billingInterval: 'monthly' }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { window.location.href = `/auth/login?next=/artist/${artist.slug}`; return; }
        setSubscribeError(data.error || 'Subscription failed. Please try again.');
      } else if (data.authorizationUrl) {
        window.location.href = data.authorizationUrl;
      } else {
        setSubscribeSuccess('Subscribed successfully!');
      }
    } catch {
      setSubscribeError('Network error. Please try again.');
    }
    setSubscribing(null);
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  const tabs: { key: Tab; label: string; icon: any; count: number; show: boolean }[] = [
    { key: 'beats',      label: 'Beats',      icon: Music,       count: artist.beats?.length || 0,              show: true },
    { key: 'releases',   label: 'Releases',   icon: Disc,        count: allReleases.length,                    show: true },
    { key: 'videos',     label: 'Videos',     icon: Video,       count: artist.videos?.length || 0,             show: true },
    { key: 'samples',    label: 'Samples',    icon: Package,     count: artist.samples?.length || 0,            show: true },
    { key: 'merch',      label: 'Merch',      icon: ShoppingBag, count: artist.merch?.length || 0,              show: hasMerch },
    { key: 'membership', label: 'Membership', icon: Users,       count: artist.subscriptionTiers?.length || 0,  show: hasMemberships },
    { key: 'posts',      label: 'Posts',      icon: Send,        count: 0,                                      show: true },
  ].filter(t => t.show);

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 flex-wrap p-1 rounded-xl w-fit" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: activeTab === t.key ? 'var(--sky)' : 'transparent',
              color: activeTab === t.key ? 'white' : 'var(--text-muted)',
            }}>
            <t.icon size={13} />
            {t.label}
            {t.count > 0 && <span className="text-xs opacity-70">({t.count})</span>}
          </button>
        ))}
      </div>

      {/* ── Beats ───────────────────────────────────────────── */}
      {activeTab === 'beats' && (
        <section className="mb-12">
          {!artist.beats?.length ? (
            <p className="text-center py-10" style={{ color: 'var(--text-muted)' }}>No beats yet</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {artist.beats.map((beat: any) => (
                <BeatCard key={beat.id} beat={{ ...beat, artist: { name: artist.name, slug: artist.slug } }} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Releases ────────────────────────────────────────── */}
      {activeTab === 'releases' && (
        <section className="mb-12">
          {!allReleases.length ? (
            <p className="text-center py-10" style={{ color: 'var(--text-muted)' }}>No releases yet</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {artist.releases?.map((r: any) => (
                <ReleaseCard key={r.id}
                  release={{ ...r, artist: { name: artist.name, slug: artist.slug } }} />
              ))}
              {artist.distributionReleases?.map((r: any) => (
                <ReleaseCard key={r.id}
                  release={{ ...r, _isDistrib: true, artist: { name: artist.name, slug: artist.slug } }} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Videos ──────────────────────────────────────────── */}
      {activeTab === 'videos' && (
        <section className="mb-12">
          {!artist.videos?.length ? (
            <p className="text-center py-10" style={{ color: 'var(--text-muted)' }}>No videos yet</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {artist.videos.map((v: any) => (
                <a key={v.id} href={`/videos/${v.slug}`}
                  className="rounded-2xl overflow-hidden hover:scale-[1.02] transition-transform block"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="aspect-video overflow-hidden relative" style={{ background: 'var(--surface2)' }}>
                    {v.thumbnailUrl
                      ? <img src={v.thumbnailUrl} alt={v.title} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-4xl">🎬</div>}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
                        <Video size={20} color="white" />
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="font-bold truncate" style={{ color: 'var(--text)' }}>{v.title}</p>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {v.genre || 'Music Video'}{v.price > 0 ? ` · R${v.price}` : ' · Free'}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Samples ─────────────────────────────────────────── */}
      {activeTab === 'samples' && (
        <section className="mb-12">
          {!artist.samples?.length ? (
            <p className="text-center py-10" style={{ color: 'var(--text-muted)' }}>No samples yet</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {artist.samples.map((s: any) => (
                <a key={s.id} href={`/samples/${s.slug}`}
                  className="rounded-2xl overflow-hidden hover:scale-[1.02] transition-transform block"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="aspect-square overflow-hidden">
                    {s.artworkUrl
                      ? <img src={s.artworkUrl} alt={s.title} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-4xl" style={{ background: 'var(--surface2)' }}>🎹</div>}
                  </div>
                  <div className="p-4">
                    <p className="font-bold truncate" style={{ color: 'var(--text)' }}>{s.title}</p>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {s.genre || 'Sample'}{s.bpm ? ` · ${s.bpm} BPM` : ''} · R{s.price}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Merch ───────────────────────────────────────────── */}
      {activeTab === 'merch' && (
        <section className="mb-12">
          {!artist.merch?.length ? (
            <p className="text-center py-10" style={{ color: 'var(--text-muted)' }}>No merch yet</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {artist.merch.map((m: any) => (
                <a key={m.id} href={`/merch/${m.slug}`}
                  className="rounded-2xl overflow-hidden hover:scale-[1.02] transition-transform block"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="aspect-square overflow-hidden flex items-center justify-center" style={{ background: 'var(--surface2)' }}>
                    {m.imageUrl
                      ? <img src={m.imageUrl} alt={m.title} className="w-full h-full object-cover" />
                      : <span className="text-4xl">👕</span>}
                  </div>
                  <div className="p-4">
                    <p className="font-bold truncate" style={{ color: 'var(--text)' }}>{m.title}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-sm font-bold" style={{ color: 'var(--sky)' }}>R{m.price}</p>
                      {m.stock <= 0 && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Out of stock</span>}
                    </div>
                    {m.sizes?.length > 0 && (
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{m.sizes.join(' · ')}</p>
                    )}
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Membership ──────────────────────────────────────── */}
      {activeTab === 'membership' && (
        <section className="mb-12 max-w-2xl">
          <div className="mb-6">
            <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text)' }}>Support {artist.name}</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Choose a membership tier and get exclusive access directly from the artist
            </p>
          </div>

          {subscribeError && (
            <div className="mb-4 p-3 rounded-xl text-sm"
              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--gold)' }}>
              {subscribeError}
            </div>
          )}
          {subscribeSuccess && (
            <div className="mb-4 p-3 rounded-xl text-sm flex items-center gap-2"
              style={{ background: 'rgba(160,232,124,0.1)', border: '1px solid rgba(160,232,124,0.3)', color: 'var(--green)' }}>
              <Check size={14} /> {subscribeSuccess}
            </div>
          )}

          {!artist.subscriptionTiers?.length ? (
            <p className="text-center py-10" style={{ color: 'var(--text-muted)' }}>No membership tiers available</p>
          ) : (
            <div className="space-y-4">
              {artist.subscriptionTiers.map((tier: any, i: number) => (
                <div key={tier.id} className="rounded-2xl p-6"
                  style={{ background: 'var(--surface)', border: `2px solid ${i === 0 ? 'var(--sky)' : 'var(--border)'}` }}>
                  {i === 0 && (
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full mb-3"
                      style={{ background: 'rgba(56,182,232,0.15)', color: 'var(--sky)' }}>
                      <Zap size={10} fill="currentColor" /> Most Popular
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--text)' }}>{tier.name}</h3>
                      {tier.description && (
                        <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>{tier.description}</p>
                      )}
                      {tier.perks?.length > 0 && (
                        <ul className="space-y-1.5 mb-4">
                          {tier.perks.map((perk: string, j: number) => (
                            <li key={j} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text)' }}>
                              <Check size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--green)' }} />
                              {perk}
                            </li>
                          ))}
                        </ul>
                      )}
                      {tier._count?.memberships > 0 && (
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          <Users size={11} className="inline mr-1" />
                          {tier._count.memberships} member{tier._count.memberships !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-2xl font-black mb-1" style={{ color: 'var(--sky)', fontFamily: 'var(--font-display)' }}>
                        R{tier.price}
                      </div>
                      <div className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>per month</div>
                      <button onClick={() => handleSubscribe(tier)} disabled={subscribing === tier.id}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-opacity disabled:opacity-60"
                        style={{ background: i === 0 ? 'var(--sky)' : 'var(--surface2)', color: i === 0 ? 'white' : 'var(--text)', border: i !== 0 ? '1px solid var(--border)' : 'none' }}>
                        {subscribing === tier.id
                          ? <><Loader2 size={13} className="animate-spin" /> Redirecting…</>
                          : <><Users size={13} /> Join</>}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Posts ───────────────────────────────────────────── */}
      {activeTab === 'posts' && (
        <section className="mb-12 max-w-2xl">
          {postsLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--sky)' }} />
            </div>
          ) : !posts.length ? (
            <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <Send size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
              <p className="font-semibold" style={{ color: 'var(--text)' }}>No posts yet</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Follow this artist to see their updates in your feed</p>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map(post => (
                <article key={post.id} className="card p-5">
                  <p className="text-sm leading-relaxed mb-3 whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{post.body}</p>
                  {post.mediaUrls?.length > 0 && (
                    <div className={`grid gap-2 mb-3 ${post.mediaUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {post.mediaUrls.map((url, i) => (
                        <img key={i} src={url} alt="" className="w-full rounded-xl object-cover" style={{ maxHeight: 280 }} />
                      ))}
                    </div>
                  )}
                  {post.linkUrl && (
                    <a href={post.linkUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 p-3 rounded-xl mb-3 text-sm font-medium"
                      style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--sky)' }}>
                      <ExternalLink size={14} />
                      {post.linkType === 'beat' ? 'Listen to beat' : post.linkType === 'release' ? 'Stream release' : 'Open link'}
                    </a>
                  )}
                  <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-5">
                      <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}><Heart size={13} /> {post.likeCount}</span>
                      <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}><MessageCircle size={13} /> {post.commentCount}</span>
                      <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}><Repeat2 size={13} /> {post.repostCount}</span>
                    </div>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{timeAgo(post.publishedAt)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
