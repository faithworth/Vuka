'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { Image as ImageIcon, Loader2, X, Users } from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';
import PostCard, { type Post, Avatar } from '@/components/social/PostCard';
import StoriesBar from './StoriesBar';

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_MEDIA_MB = 10;
const MAX_MEDIA_PER_POST = 4;
const MAX_POST_LEN = 2000;


// ── Composer (artists only) ──────────────────────────────────────

function Composer({ artist, onPosted }: { artist: { id: string; name: string; slug: string; photoUrl: string; isVerified: boolean }; onPosted: (p: Post) => void }) {
  const [body, setBody] = useState('');
  const [media, setMedia] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (media.length + files.length > MAX_MEDIA_PER_POST) {
      alert(`You can attach up to ${MAX_MEDIA_PER_POST} images per post.`);
      return;
    }
    setUploading(true);
    for (const file of files) {
      if (!ALLOWED_MEDIA_TYPES.includes(file.type)) { alert(`${file.name}: unsupported file type`); continue; }
      if (file.size > MAX_MEDIA_MB * 1024 * 1024) { alert(`${file.name}: over ${MAX_MEDIA_MB}MB`); continue; }
      try {
        const presignRes = await fetch('/api/social/upload-url', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentType: file.type, context: 'post' }),
        });
        if (!presignRes.ok) continue;
        const { presignedUrl, publicUrl } = await presignRes.json();
        const putRes = await fetch(presignedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (putRes.ok) setMedia(prev => [...prev, publicUrl]);
      } catch {}
    }
    setUploading(false);
  }

  async function submitPost() {
    if (!body.trim() || posting) return;
    setPosting(true);
    try {
      const res = await fetch('/api/social/posts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim(), mediaUrls: media }),
      });
      if (res.ok) {
        const d = await res.json();
        onPosted({
          ...d.post,
          artist: { id: artist.id, slug: artist.slug, name: artist.name, photoUrl: artist.photoUrl, isVerified: artist.isVerified },
        });
        setBody(''); setMedia([]);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to post');
      }
    } catch {}
    setPosting(false);
  }

  return (
    <div className="rounded-2xl p-4 md:p-5 mb-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex gap-3">
        <Avatar name={artist.name} photoUrl={artist.photoUrl} size={40} />
        <div className="flex-1">
          <textarea
            className="input w-full resize-none text-sm py-2.5"
            rows={2}
            placeholder="Share an update with your fans…"
            value={body}
            maxLength={MAX_POST_LEN}
            onChange={e => setBody(e.target.value)}
          />
          {media.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mt-2">
              {media.map((url, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => setMedia(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between mt-2">
            <input ref={fileInputRef} type="file" accept={ALLOWED_MEDIA_TYPES.join(',')} multiple className="hidden" onChange={handleFiles} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading || media.length >= MAX_MEDIA_PER_POST}
              className="p-2 rounded-lg transition-colors hover:bg-[var(--surface2)] disabled:opacity-40" style={{ color: 'var(--text-muted)' }}>
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
            </button>
            <div className="flex items-center gap-3">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{body.length}/{MAX_POST_LEN}</span>
              <button onClick={submitPost} disabled={posting || !body.trim()} className="btn btn-primary text-sm px-4 py-1.5 disabled:opacity-40">
                {posting ? <VukaLoader size={14} /> : 'Post'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────

export default function FeedPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tab, setTab] = useState<'following' | 'discover'>('following');
  const [followingIsEmpty, setFollowingIsEmpty] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [myId, setMyId] = useState('');
  const [myArtist, setMyArtist] = useState<{ id: string; name: string; slug: string; photoUrl: string; isVerified: boolean } | null>(null);

  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>({});
  const [repostedMap, setRepostedMap] = useState<Record<string, boolean>>({});
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});

  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/auth/login'); return; }
      try {
        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) {
          const me = await meRes.json();
          setMyId(me.id);
          if (me.artist) setMyArtist(me.artist);
        }
      } catch {}
      await loadFeed('following', null, true);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function fetchStatuses(items: Post[]) {
    const ids = items.map(p => p.id);
    const artistIds = Array.from(new Set(items.map(p => p.artist.id)));
    if (ids.length === 0) return;
    try {
      const [likesRes, savesRes, repostsRes, followRes] = await Promise.all([
        fetch(`/api/social/likes?targetType=post&targetIds=${ids.join(',')}`),
        fetch(`/api/social/saves?targetType=post&targetIds=${ids.join(',')}`),
        fetch(`/api/social/reposts?targetType=post&targetIds=${ids.join(',')}`),
        artistIds.length ? fetch(`/api/follow?artistIds=${artistIds.join(',')}`) : Promise.resolve(null),
      ]);
      if (likesRes.ok) { const d = await likesRes.json(); setLikedMap(prev => ({ ...prev, ...d.liked })); }
      if (savesRes.ok) { const d = await savesRes.json(); setSavedMap(prev => ({ ...prev, ...d.saved })); }
      if (repostsRes.ok) { const d = await repostsRes.json(); setRepostedMap(prev => ({ ...prev, ...d.reposted })); }
      if (followRes && followRes.ok) { const d = await followRes.json(); setFollowingMap(prev => ({ ...prev, ...d.following })); }
    } catch {}
  }

  async function loadFeed(whichTab: 'following' | 'discover', cursor: string | null, replace: boolean) {
    if (replace) setLoading(true); else setLoadingMore(true);
    try {
      const qs = new URLSearchParams({ tab: whichTab });
      if (cursor) qs.set('cursor', cursor);
      const res = await fetch(`/api/social/feed?${qs}`);
      if (res.ok) {
        const d = await res.json();
        const items: Post[] = (d.items || []).filter((p: Post) => p?.artist?.slug);
        setPosts(prev => replace ? items : [...prev, ...items]);
        setNextCursor(d.nextCursor ?? null);
        setFollowingIsEmpty(!!d.isEmpty);
        fetchStatuses(items);
      }
    } catch {}
    setLoading(false);
    setLoadingMore(false);
  }

  function switchTab(next: 'following' | 'discover') {
    if (next === tab) return;
    setTab(next);
    setPosts([]);
    setNextCursor(null);
    loadFeed(next, null, true);
  }

  // Bulk endpoint response key mismatch guard: likes route returns { liked }
  // We already destructure correctly above.

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && nextCursor && !loadingMore && !loading) {
        loadFeed(tab, nextCursor, false);
      }
    }, { rootMargin: '400px' });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextCursor, loadingMore, loading, tab]);

  async function toggleLike(id: string) {
    const prevLiked = !!likedMap[id];
    setLikedMap(prev => ({ ...prev, [id]: !prevLiked }));
    setPosts(prev => prev.map(p => p.id === id ? { ...p, likeCount: Math.max(0, p.likeCount + (prevLiked ? -1 : 1)) } : p));
    try {
      const res = await fetch('/api/social/likes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType: 'post', targetId: id }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setLikedMap(prev => ({ ...prev, [id]: prevLiked }));
      setPosts(prev => prev.map(p => p.id === id ? { ...p, likeCount: Math.max(0, p.likeCount + (prevLiked ? 1 : -1)) } : p));
    }
  }

  async function toggleSave(id: string) {
    const prevSaved = !!savedMap[id];
    setSavedMap(prev => ({ ...prev, [id]: !prevSaved }));
    try {
      const res = await fetch('/api/social/saves', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType: 'post', targetId: id }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setSavedMap(prev => ({ ...prev, [id]: prevSaved }));
    }
  }

  async function toggleRepost(id: string) {
    const prevReposted = !!repostedMap[id];
    setRepostedMap(prev => ({ ...prev, [id]: !prevReposted }));
    setPosts(prev => prev.map(p => p.id === id ? { ...p, repostCount: Math.max(0, p.repostCount + (prevReposted ? -1 : 1)) } : p));
    try {
      const res = await fetch('/api/social/reposts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType: 'post', targetId: id }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setRepostedMap(prev => ({ ...prev, [id]: prevReposted }));
      setPosts(prev => prev.map(p => p.id === id ? { ...p, repostCount: Math.max(0, p.repostCount + (prevReposted ? 1 : -1)) } : p));
    }
  }

  async function toggleFollow(artistId: string) {
    const prevFollowing = !!followingMap[artistId];
    setFollowingMap(prev => ({ ...prev, [artistId]: !prevFollowing }));
    try {
      const res = await fetch('/api/follow', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setFollowingMap(prev => ({ ...prev, [artistId]: prevFollowing }));
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <VukaLoader size={28} />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
        <h1 className="text-2xl font-bold mb-4" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
          Feed
        </h1>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 p-1 rounded-xl w-fit" style={{ background: 'var(--surface2)' }}>
          {(['following', 'discover'] as const).map(t => (
            <button key={t} onClick={() => switchTab(t)}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition-colors"
              style={{ background: tab === t ? 'var(--surface)' : 'transparent', color: tab === t ? 'var(--text)' : 'var(--text-muted)' }}>
              {t}
            </button>
          ))}
        </div>

        <StoriesBar myArtist={myArtist} />

        {myArtist && <Composer artist={myArtist} onPosted={(p) => setPosts(prev => [p, ...prev])} />}

        {posts.length === 0 ? (
          <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <Users size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            {tab === 'following' && followingIsEmpty ? (
              <>
                <p className="font-semibold" style={{ color: 'var(--text)' }}>Follow some artists to build your feed</p>
                <p className="text-sm mt-1 mb-4" style={{ color: 'var(--text-muted)' }}>
                  Or explore what's happening across Vuka right now
                </p>
                <button onClick={() => switchTab('discover')} className="btn btn-primary text-sm px-4 py-2">
                  Discover artists
                </button>
              </>
            ) : (
              <p className="font-semibold" style={{ color: 'var(--text)' }}>Nothing here yet</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                isOwn={!!myArtist && myArtist.id === post.artist.id}
                liked={!!likedMap[post.id]}
                saved={!!savedMap[post.id]}
                reposted={!!repostedMap[post.id]}
                isFollowing={!!followingMap[post.artist.id]}
                onToggleLike={toggleLike}
                onToggleSave={toggleSave}
                onToggleRepost={toggleRepost}
                onToggleFollow={toggleFollow}
                onOpenLightbox={(urls, index) => setLightbox({ urls, index })}
              />
            ))}
            <div ref={sentinelRef} className="h-8 flex items-center justify-center">
              {loadingMore && <VukaLoader size={20} />}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.9)' }}
          onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white" onClick={() => setLightbox(null)}><X size={28} /></button>
          <img src={lightbox.urls[lightbox.index]} alt="" className="max-h-[85vh] max-w-full object-contain" onClick={e => e.stopPropagation()} />
          {lightbox.urls.length > 1 && (
            <div className="absolute bottom-6 flex gap-2">
              {lightbox.urls.map((_, i) => (
                <button key={i} onClick={(e) => { e.stopPropagation(); setLightbox({ ...lightbox, index: i }); }}
                  className="w-2 h-2 rounded-full" style={{ background: i === lightbox.index ? 'white' : 'rgba(255,255,255,0.4)' }} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
