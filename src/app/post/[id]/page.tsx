'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import VukaLoader from '@/components/brand/VukaLoader';
import PostCard, { type Post } from '@/components/social/PostCard';

export default function PostPermalinkPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [myId, setMyId] = useState('');
  const [myArtistId, setMyArtistId] = useState<string | null>(null);

  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);

  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        try {
          const meRes = await fetch('/api/auth/me');
          if (meRes.ok) {
            const me = await meRes.json();
            setMyId(me.id);
            if (me.artist) setMyArtistId(me.artist.id);
          }
        } catch {}
      }
      await load();
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function load() {
    try {
      const res = await fetch(`/api/social/posts/${params.id}`);
      if (!res.ok) { setNotFound(true); return; }
      const d = await res.json();
      const p: Post = d.post;
      setPost(p);

      const [likesRes, savesRes, repostsRes, followRes] = await Promise.all([
        fetch(`/api/social/likes?targetType=post&targetIds=${p.id}`),
        fetch(`/api/social/saves?targetType=post&targetIds=${p.id}`),
        fetch(`/api/social/reposts?targetType=post&targetIds=${p.id}`),
        fetch(`/api/follow?artistIds=${p.artist.id}`),
      ]);
      if (likesRes.ok) setLiked(!!(await likesRes.json()).liked?.[p.id]);
      if (savesRes.ok) setSaved(!!(await savesRes.json()).saved?.[p.id]);
      if (repostsRes.ok) setReposted(!!(await repostsRes.json()).reposted?.[p.id]);
      if (followRes.ok) setIsFollowing(!!(await followRes.json()).following?.[p.artist.id]);
    } catch {
      setNotFound(true);
    }
  }

  async function toggleLike() {
    if (!post) return;
    const prev = liked;
    setLiked(!prev);
    setPost(p => p ? { ...p, likeCount: Math.max(0, p.likeCount + (prev ? -1 : 1)) } : p);
    try {
      const res = await fetch('/api/social/likes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetType: 'post', targetId: post.id }) });
      if (!res.ok) throw new Error();
    } catch {
      setLiked(prev);
      setPost(p => p ? { ...p, likeCount: Math.max(0, p.likeCount + (prev ? 1 : -1)) } : p);
    }
  }

  async function toggleSave() {
    if (!post) return;
    const prev = saved;
    setSaved(!prev);
    try {
      const res = await fetch('/api/social/saves', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetType: 'post', targetId: post.id }) });
      if (!res.ok) throw new Error();
    } catch { setSaved(prev); }
  }

  async function toggleRepost() {
    if (!post) return;
    const prev = reposted;
    setReposted(!prev);
    setPost(p => p ? { ...p, repostCount: Math.max(0, p.repostCount + (prev ? -1 : 1)) } : p);
    try {
      const res = await fetch('/api/social/reposts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetType: 'post', targetId: post.id }) });
      if (!res.ok) throw new Error();
    } catch {
      setReposted(prev);
      setPost(p => p ? { ...p, repostCount: Math.max(0, p.repostCount + (prev ? 1 : -1)) } : p);
    }
  }

  async function toggleFollow(artistId: string) {
    const prev = isFollowing;
    setIsFollowing(!prev);
    try {
      const res = await fetch('/api/follow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ artistId }) });
      if (!res.ok) throw new Error();
    } catch { setIsFollowing(prev); }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <VukaLoader size={28} />
    </div>
  );

  if (notFound || !post) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: 'var(--bg)' }}>
      <p className="font-semibold" style={{ color: 'var(--text)' }}>This post isn't available</p>
      <Link href="/feed" className="text-sm" style={{ color: 'var(--sky)' }}>Back to Feed</Link>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft size={16} /> Back
        </button>

        <PostCard
          post={post}
          isOwn={!!myArtistId && myArtistId === post.artist.id}
          liked={liked}
          saved={saved}
          reposted={reposted}
          isFollowing={isFollowing}
          onToggleLike={toggleLike}
          onToggleSave={toggleSave}
          onToggleRepost={toggleRepost}
          onToggleFollow={toggleFollow}
          onOpenLightbox={(urls, index) => setLightbox({ urls, index })}
          defaultCommentsOpen
        />
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.9)' }}
          onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white" onClick={() => setLightbox(null)}><X size={28} /></button>
          <img src={lightbox.urls[lightbox.index]} alt="" className="max-h-[85vh] max-w-full object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
