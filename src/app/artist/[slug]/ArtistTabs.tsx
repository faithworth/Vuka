'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Music, Disc, Send, Heart, MessageCircle, Repeat2, ExternalLink, Loader2, Video, Package } from 'lucide-react';
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
  type Tab = 'beats' | 'releases' | 'videos' | 'samples' | 'posts';

  // Combine store releases + distribution releases for tab count
  const allReleases = [
    ...(artist.releases ?? []),
    ...(artist.distributionReleases ?? []),
  ];

  const defaultTab: Tab = artist.beats?.length > 0 ? 'beats' : allReleases.length > 0 ? 'releases' : artist.videos?.length > 0 ? 'videos' : artist.samples?.length > 0 ? 'samples' : 'posts';
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsFetched, setPostsFetched] = useState(false);

  useEffect(() => {
    if (activeTab === 'posts' && !postsFetched) {
      setPostsLoading(true);
      fetch(`/api/social/posts?artistSlug=${artist.slug}`)
        .then(r => r.ok ? r.json() : { posts: [] })
        .then(d => { setPosts(d.posts || []); setPostsFetched(true); setPostsLoading(false); })
        .catch(() => setPostsLoading(false));
    }
  }, [activeTab, postsFetched, artist.slug]);

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  const tabs: { key: Tab; label: string; icon: typeof Music; count: number }[] = [
    { key: 'beats', label: 'Beats', icon: Music, count: artist.beats?.length || 0 },
    { key: 'releases', label: 'Releases', icon: Disc, count: allReleases.length },
    { key: 'videos', label: 'Videos', icon: Video, count: artist.videos?.length || 0 },
    { key: 'samples', label: 'Samples', icon: Package, count: artist.samples?.length || 0 },
    { key: 'posts', label: 'Posts', icon: Send, count: 0 },
  ];

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
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

      {/* Beats tab */}
      {activeTab === 'beats' && (
        <section className="mb-12">
          {artist.beats?.length === 0 ? (
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

      {/* Releases tab — store releases + distribution releases combined */}
      {activeTab === 'releases' && (
        <section className="mb-12">
          {allReleases.length === 0 ? (
            <p className="text-center py-10" style={{ color: 'var(--text-muted)' }}>No releases yet</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Store releases (beat store — have a slug and a price) */}
              {artist.releases?.map((r: any) => (
                <ReleaseCard key={r.id} release={{ ...r, artist: { name: artist.name, slug: artist.slug } }} />
              ))}

              {/* Distribution releases (submitted via release wizard — use /releases/[id]) */}
              {artist.distributionReleases?.map((r: any) => (
                <ReleaseCard key={r.id} release={{ ...r, _isDistrib: true, artist: { name: artist.name, slug: artist.slug } }} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Videos tab */}
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

      {/* Samples tab */}
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

      {/* Posts tab */}
      {activeTab === 'posts' && (
        <section className="mb-12 max-w-2xl">
          {postsLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--sky)' }} />
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <Send size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
              <p className="font-semibold" style={{ color: 'var(--text)' }}>No posts yet</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Follow this artist to see their updates in your feed</p>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map(post => (
                <article key={post.id} className="card p-5">
                  <p className="text-sm leading-relaxed mb-3 whitespace-pre-wrap" style={{ color: 'var(--text)' }}>
                    {post.body}
                  </p>

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
                      <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <Heart size={13} /> {post.likeCount}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <MessageCircle size={13} /> {post.commentCount}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <Repeat2 size={13} /> {post.repostCount}
                      </span>
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
