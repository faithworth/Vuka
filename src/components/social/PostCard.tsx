'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Heart, MessageCircle, Repeat2, Share2, Bookmark, ShieldCheck, Send } from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';
export interface Post {
  id: string;
  body: string;
  mediaUrls: string[];
  linkType: string;
  linkUrl: string;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  isPinned?: boolean;
  publishedAt: string;
  artist: {
    id: string;
    slug: string;
    name: string;
    photoUrl: string;
    isVerified: boolean;
  };
  /** Present when this post is showing up in your feed because someone
   * you follow reshared it (not because you follow the original poster). */
  repostedBy?: {
    id: string;
    name: string;
    slug?: string;
    photoUrl: string;
    isVerified: boolean;
  };
}

export interface CommentUser { id: string; name: string }
export interface Comment {
  id: string;
  body: string;
  userId: string;
  createdAt: string;
  user: CommentUser;
  replies?: Comment[];
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function initials(name: string): string {
  return (name || '?').trim()[0]?.toUpperCase() ?? '?';
}

export function Avatar({ name, photoUrl, size = 44 }: { name: string; photoUrl?: string; size?: number }) {
  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white overflow-hidden"
      style={{ width: size, height: size, background: 'var(--sky)', fontSize: size * 0.4 }}>
      {photoUrl ? <img src={photoUrl} alt="" className="w-full h-full object-cover" /> : initials(name)}
    </div>
  );
}

function MediaGrid({ urls, onOpen }: { urls: string[]; onOpen: (i: number) => void }) {
  if (urls.length === 0) return null;
  const cols = urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2';
  return (
    <div className={`grid ${cols} gap-1 mt-3 rounded-xl overflow-hidden`} style={{ border: '1px solid var(--border)' }}>
      {urls.slice(0, 4).map((url, i) => (
        <button key={i} onClick={() => onOpen(i)} className="relative bg-black/5" style={{ aspectRatio: urls.length === 1 ? '16/10' : '1/1' }}>
          <img src={url} alt="" className="w-full h-full object-cover" />
          {i === 3 && urls.length > 4 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white font-bold text-lg">
              +{urls.length - 4}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Comment thread ───────────────────────────────────────────────

function CommentRow({ comment, depth = 0 }: { comment: Comment; depth?: number }) {
  return (
    <div style={{ marginLeft: depth * 28 }} className="flex gap-2 py-2">
      <Avatar name={comment.user?.name ?? '?'} size={28} />
      <div className="flex-1 min-w-0">
        <div className="rounded-2xl px-3 py-2 inline-block max-w-full" style={{ background: 'var(--surface2)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{comment.user?.name ?? 'Someone'}</p>
          <p className="text-sm break-words" style={{ color: 'var(--text)' }}>{comment.body}</p>
        </div>
        <p className="text-[11px] mt-0.5 ml-1" style={{ color: 'var(--text-muted)' }}>{timeAgo(comment.createdAt)}</p>
        {comment.replies?.map(r => <CommentRow key={r.id} comment={r} depth={depth + 1} />)}
      </div>
    </div>
  );
}

// ── Post card ─────────────────────────────────────────────────────

export interface PostCardProps {
  post: Post;
  isOwn: boolean;
  liked: boolean;
  saved: boolean;
  reposted: boolean;
  isFollowing: boolean;
  onToggleLike: (id: string) => void;
  onToggleSave: (id: string) => void;
  onToggleRepost: (id: string) => void;
  onToggleFollow: (artistId: string) => void;
  onOpenLightbox: (urls: string[], index: number) => void;
  defaultCommentsOpen?: boolean;
}

export default function PostCard({
  post, isOwn, liked, saved, reposted, isFollowing,
  onToggleLike, onToggleSave, onToggleRepost, onToggleFollow, onOpenLightbox,
  defaultCommentsOpen = false,
}: PostCardProps) {
  const [commentsOpen, setCommentsOpen] = useState(defaultCommentsOpen);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  async function loadComments() {
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/social/comments?targetType=post&targetId=${post.id}`);
      if (res.ok) setComments((await res.json()).comments || []);
    } catch {}
    setCommentsLoading(false);
  }

  // Auto-load comments when opened by default (permalink page)
  useEffect(() => { if (defaultCommentsOpen) loadComments(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleComments() {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next && comments.length === 0) loadComments();
  }

  async function submitComment() {
    if (!commentDraft.trim() || postingComment) return;
    setPostingComment(true);
    try {
      const res = await fetch('/api/social/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentDraft.trim(), targetType: 'post', targetId: post.id }),
      });
      if (res.ok) {
        const d = await res.json();
        setComments(prev => [d.comment, ...prev]);
        setCommentDraft('');
      }
    } catch {}
    setPostingComment(false);
  }

  function handleShare() {
    const url = `${window.location.origin}/post/${post.id}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    });
  }

  return (
    <div className="rounded-2xl p-4 md:p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {post.repostedBy && (
        <Link href={post.repostedBy.slug ? `/artist/${post.repostedBy.slug}` : '#'}
          className="flex items-center gap-2 mb-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
          <Repeat2 size={14} style={{ color: '#22c55e' }} />
          {post.repostedBy.name} reposted
          {post.repostedBy.isVerified && <ShieldCheck size={12} style={{ color: 'var(--sky)' }} />}
        </Link>
      )}
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href={`/artist/${post.artist.slug}`}>
          <Avatar name={post.artist.name} photoUrl={post.artist.photoUrl} size={44} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/artist/${post.artist.slug}`} className="flex items-center gap-1 min-w-0">
              <span className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{post.artist.name}</span>
              {post.artist.isVerified && <ShieldCheck size={14} style={{ color: 'var(--sky)' }} className="flex-shrink-0" />}
            </Link>
            {!isOwn && (
              <button onClick={() => onToggleFollow(post.artist.id)}
                className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 transition-colors"
                style={{
                  background: isFollowing ? 'transparent' : 'var(--sky)',
                  color: isFollowing ? 'var(--text-muted)' : 'white',
                  border: isFollowing ? '1px solid var(--border)' : 'none',
                }}>
                {isFollowing ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
          <Link href={`/post/${post.id}`} className="text-xs hover:underline" style={{ color: 'var(--text-muted)' }}>
            {post.isPinned && '📌 Pinned · '}{timeAgo(post.publishedAt)}
          </Link>
        </div>
      </div>

      {/* Body */}
      {post.body && (
        <p className="text-sm mt-3 whitespace-pre-wrap break-words" style={{ color: 'var(--text)' }}>{post.body}</p>
      )}

      <MediaGrid urls={post.mediaUrls || []} onOpen={(i) => onOpenLightbox(post.mediaUrls, i)} />

      {post.linkUrl && (
        <a href={post.linkUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 mt-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors hover:bg-[var(--surface2)]"
          style={{ border: '1px solid var(--border)', color: 'var(--sky)' }}>
          🔗 {post.linkType ? `View ${post.linkType}` : 'View link'}
        </a>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-1 mt-3 -ml-2">
        <button onClick={() => onToggleLike(post.id)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--surface2)]"
          style={{ color: liked ? '#ef4444' : 'var(--text-muted)' }}>
          <Heart size={17} fill={liked ? '#ef4444' : 'none'} /> {post.likeCount > 0 && post.likeCount}
        </button>
        <button onClick={toggleComments}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--surface2)]"
          style={{ color: commentsOpen ? 'var(--sky)' : 'var(--text-muted)' }}>
          <MessageCircle size={17} /> {post.commentCount > 0 && post.commentCount}
        </button>
        <button onClick={() => onToggleRepost(post.id)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--surface2)]"
          style={{ color: reposted ? '#22c55e' : 'var(--text-muted)' }}>
          <Repeat2 size={17} /> {post.repostCount > 0 && post.repostCount}
        </button>
        <div className="flex-1" />
        <button onClick={handleShare} className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface2)]" style={{ color: 'var(--text-muted)' }} title="Copy link">
          <Share2 size={16} />
        </button>
        <button onClick={() => onToggleSave(post.id)} className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface2)]"
          style={{ color: saved ? 'var(--gold)' : 'var(--text-muted)' }}>
          <Bookmark size={16} fill={saved ? 'var(--gold)' : 'none'} />
        </button>
      </div>
      {copiedLink && <p className="text-[11px] mt-1" style={{ color: 'var(--sky)' }}>Link copied</p>}

      {/* Comments */}
      {commentsOpen && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex gap-2 mb-2">
            <input
              className="input flex-1 text-sm py-2"
              placeholder="Write a comment…"
              value={commentDraft}
              onChange={e => setCommentDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitComment()}
            />
            <button onClick={submitComment} disabled={postingComment || !commentDraft.trim()}
              className="btn btn-primary px-3 disabled:opacity-40">
              {postingComment ? <VukaLoader size={14} /> : <Send size={14} />}
            </button>
          </div>
          {commentsLoading ? (
            <div className="flex justify-center py-4"><VukaLoader size={18} /></div>
          ) : comments.length === 0 ? (
            <p className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>No comments yet — be the first</p>
          ) : (
            <div>{comments.map(c => <CommentRow key={c.id} comment={c} />)}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Composer (artists only) ──────────────────────────────────────
