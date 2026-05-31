'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { Heart, MessageCircle, Repeat2, Music, Disc, ExternalLink, Loader2, Users, Send } from 'lucide-react';

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
  artist: {
    slug: string;
    name: string;
    photoUrl: string;
    isVerified: boolean;
  };
  // optimistic UI state
  _liked?: boolean;
  _reposted?: boolean;
}

export default function FeedPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  // Comment UI state: which post has the comment box open + draft text
  const [commentOpen, setCommentOpen] = useState<Record<string, boolean>>({});
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [commentLoading, setCommentLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/auth/login'); return; }
      setAuthed(true);
      try {
        const res = await fetch('/api/social/feed');
        if (res.ok) {
          const d = await res.json();
          const raw: Post[] = d.items || d.posts || [];
          // Guard: only keep posts where artist is fully defined with a slug
          setPosts(raw.filter(p => p?.artist?.slug));
        }
      } catch {}
      setLoading(false);
    });
  }, [router]);

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  // ── Like toggle ────────────────────────────────────────────
  async function handleLike(postId: string) {
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    const nowLiked = !post._liked;

    // Optimistic update
    setPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, _liked: nowLiked, likeCount: p.likeCount + (nowLiked ? 1 : -1) }
        : p
    ));

    try {
      await fetch('/api/social/likes', {
        method: nowLiked ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      });
    } catch {
      // Roll back on error
      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, _liked: !nowLiked, likeCount: p.likeCount + (nowLiked ? -1 : 1) }
          : p
      ));
    }
  }

  // ── Comment submit ─────────────────────────────────────────
  async function handleComment(postId: string) {
    const text = (commentText[postId] || '').trim();
    if (!text) return;
    setCommentLoading(prev => ({ ...prev, [postId]: true }));

    // Optimistic count increment
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p
    ));
    setCommentText(prev => ({ ...prev, [postId]: '' }));
    setCommentOpen(prev => ({ ...prev, [postId]: false }));

    try {
      await fetch('/api/social/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, body: text }),
      });
    } catch {
      // Roll back count on error
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, commentCount: p.commentCount - 1 } : p
      ));
    } finally {
      setCommentLoading(prev => ({ ...prev, [postId]: false }));
    }
  }

  // ── Repost ─────────────────────────────────────────────────
  async function handleRepost(postId: string) {
    const post = posts.find(p => p.id === postId);
    if (!post || post._reposted) return; // one-shot only

    // Optimistic update
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, _reposted: true, repostCount: p.repostCount + 1 } : p
    ));

    try {
      await fetch('/api/social/reposts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      });
    } catch {
      // Roll back on error
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, _reposted: false, repostCount: p.repostCount - 1 } : p
      ));
    }
  }

  if (!authed || loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <Loader2 size={28} className="animate-spin" style={{ color: 'var(--sky)' }} />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-2xl mx-auto px-4 py-8">

        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
            Your Feed
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Posts from artists you follow
          </p>
        </div>

        {posts.length === 0 ? (
          <div className="text-center py-20 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <Users size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
            <p className="font-bold mb-2" style={{ color: 'var(--text)' }}>Your feed is empty</p>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
              Follow artists to see their posts here
            </p>
            <Link href="/discover" className="btn btn-primary">
              Discover Artists
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map(post => (
              <article key={post.id} className="card p-5">
                {/* Artist header */}
                <div className="flex items-center gap-3 mb-4">
                  <Link href={`/artist/${post.artist.slug}`}>
                    {post.artist.photoUrl ? (
                      <img src={post.artist.photoUrl} alt={post.artist.name}
                        className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white text-sm"
                        style={{ background: 'var(--sky)' }}>
                        {post.artist.name?.[0] ?? '?'}
                      </div>
                    )}
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link href={`/artist/${post.artist.slug}`}
                      className="font-semibold text-sm hover:underline flex items-center gap-1"
                      style={{ color: 'var(--text)' }}>
                      {post.artist.name}
                      {post.artist.isVerified && (
                        <span className="badge badge-sky text-[10px]">✓</span>
                      )}
                    </Link>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{timeAgo(post.publishedAt)}</p>
                  </div>
                </div>

                {/* Post body */}
                <p className="text-sm leading-relaxed mb-4 whitespace-pre-wrap" style={{ color: 'var(--text)' }}>
                  {post.body}
                </p>

                {/* Media */}
                {post.mediaUrls?.length > 0 && (
                  <div className={`grid gap-2 mb-4 ${post.mediaUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {post.mediaUrls.map((url, i) => (
                      <img key={i} src={url} alt="" className="w-full rounded-xl object-cover"
                        style={{ maxHeight: 300 }} />
                    ))}
                  </div>
                )}

                {/* Link card */}
                {post.linkUrl && (
                  <a href={post.linkUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-xl mb-4 transition-colors"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    {post.linkType === 'beat' && <Music size={16} style={{ color: 'var(--sky)' }} />}
                    {post.linkType === 'release' && <Disc size={16} style={{ color: 'var(--sky)' }} />}
                    {(!post.linkType || post.linkType === 'external') && <ExternalLink size={16} style={{ color: 'var(--text-muted)' }} />}
                    <span className="text-sm font-medium" style={{ color: 'var(--sky)' }}>
                      {post.linkType === 'beat' ? 'Listen to beat' : post.linkType === 'release' ? 'Stream release' : 'Open link'}
                    </span>
                  </a>
                )}

                {/* Engagement */}
                <div className="flex items-center gap-5 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                  {/* Like */}
                  <button
                    onClick={() => handleLike(post.id)}
                    className="flex items-center gap-1.5 text-sm transition-colors"
                    style={{ color: post._liked ? 'var(--red, #e53e3e)' : 'var(--text-muted)' }}
                    aria-label={post._liked ? 'Unlike' : 'Like'}
                  >
                    <Heart size={16} fill={post._liked ? 'currentColor' : 'none'} />
                    <span>{post.likeCount}</span>
                  </button>

                  {/* Comment toggle */}
                  <button
                    onClick={() => setCommentOpen(prev => ({ ...prev, [post.id]: !prev[post.id] }))}
                    className="flex items-center gap-1.5 text-sm transition-colors hover:text-sky-400"
                    style={{ color: commentOpen[post.id] ? 'var(--sky)' : 'var(--text-muted)' }}
                    aria-label="Comment"
                  >
                    <MessageCircle size={16} />
                    <span>{post.commentCount}</span>
                  </button>

                  {/* Repost */}
                  <button
                    onClick={() => handleRepost(post.id)}
                    className="flex items-center gap-1.5 text-sm transition-colors"
                    style={{
                      color: post._reposted ? 'var(--green, #38a169)' : 'var(--text-muted)',
                      opacity: post._reposted ? 0.7 : 1,
                      cursor: post._reposted ? 'default' : 'pointer',
                    }}
                    disabled={post._reposted}
                    aria-label={post._reposted ? 'Reposted' : 'Repost'}
                  >
                    <Repeat2 size={16} />
                    <span>{post.repostCount}</span>
                  </button>
                </div>

                {/* Comment box */}
                {commentOpen[post.id] && (
                  <div className="mt-3 flex gap-2" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <input
                      value={commentText[post.id] || ''}
                      onChange={e => setCommentText(prev => ({ ...prev, [post.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleComment(post.id); } }}
                      placeholder="Write a comment…"
                      className="flex-1 px-3 py-2 rounded-xl text-sm"
                      style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
                      disabled={commentLoading[post.id]}
                      autoFocus
                    />
                    <button
                      onClick={() => handleComment(post.id)}
                      disabled={commentLoading[post.id] || !(commentText[post.id] || '').trim()}
                      className="px-3 py-2 rounded-xl transition-colors disabled:opacity-40"
                      style={{ background: 'var(--sky)', color: 'white' }}
                      aria-label="Send comment"
                    >
                      {commentLoading[post.id]
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Send size={14} />}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
