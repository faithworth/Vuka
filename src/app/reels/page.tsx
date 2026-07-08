'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import {
  Heart, MessageCircle, Repeat2, Share2, ShieldCheck, X, Volume2, VolumeX,
  Plus, Loader2, Send, Play,
} from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

interface Reel {
  id: string;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  viewCount: number;
  publishedAt: string;
  isOwn: boolean;
  artist: { id: string; name: string; slug: string; photoUrl: string; isVerified: boolean };
}
interface CommentUser { id: string; name: string }
interface Comment { id: string; body: string; userId: string; createdAt: string; user: CommentUser }

function initials(name: string): string { return (name || '?').trim()[0]?.toUpperCase() ?? '?'; }

function ReelSlide({
  reel, active, muted, onToggleMute, liked, onToggleLike, onOpenComments, onToggleRepost, reposted,
}: {
  reel: Reel; active: boolean; muted: boolean; onToggleMute: () => void;
  liked: boolean; onToggleLike: () => void; onOpenComments: () => void;
  reposted: boolean; onToggleRepost: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const viewedRef = useRef(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) {
      v.currentTime = 0;
      v.play().catch(() => {});
      if (!viewedRef.current) {
        viewedRef.current = true;
        fetch(`/api/social/reels/${reel.id}`, { method: 'POST' }).catch(() => {});
      }
    } else {
      v.pause();
    }
  }, [active, reel.id]);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPaused(false); }
    else { v.pause(); setPaused(true); }
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black snap-start snap-always" style={{ scrollSnapStop: 'always' }}>
      <video
        ref={videoRef}
        src={reel.videoUrl}
        poster={reel.thumbnailUrl || undefined}
        loop
        muted={muted}
        playsInline
        onClick={togglePlay}
        className="max-h-full max-w-full object-contain cursor-pointer"
      />
      {paused && (
        <button onClick={togglePlay} className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-black/40 flex items-center justify-center">
            <Play size={28} className="text-white ml-1" fill="white" />
          </div>
        </button>
      )}

      {/* Mute toggle */}
      <button onClick={onToggleMute} className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/40 flex items-center justify-center text-white">
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-16 p-4 pb-20 md:pb-6" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.7))' }}>
        <Link href={`/artist/${reel.artist.slug}`} className="flex items-center gap-2 mb-2">
          <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center font-bold text-white text-xs flex-shrink-0" style={{ background: 'var(--sky)' }}>
            {reel.artist.photoUrl ? <img src={reel.artist.photoUrl} alt="" className="w-full h-full object-cover" /> : initials(reel.artist.name)}
          </div>
          <span className="text-white text-sm font-semibold flex items-center gap-1">
            {reel.artist.name}
            {reel.artist.isVerified && <ShieldCheck size={13} style={{ color: 'var(--sky)' }} />}
          </span>
        </Link>
        {reel.caption && <p className="text-white text-sm">{reel.caption}</p>}
      </div>

      {/* Right action rail */}
      <div className="absolute right-3 bottom-24 md:bottom-8 flex flex-col items-center gap-5">
        <button onClick={onToggleLike} className="flex flex-col items-center gap-1">
          <div className="w-11 h-11 rounded-full bg-black/40 flex items-center justify-center">
            <Heart size={22} color={liked ? '#ef4444' : 'white'} fill={liked ? '#ef4444' : 'none'} />
          </div>
          <span className="text-white text-xs font-medium">{reel.likeCount}</span>
        </button>
        <button onClick={onOpenComments} className="flex flex-col items-center gap-1">
          <div className="w-11 h-11 rounded-full bg-black/40 flex items-center justify-center">
            <MessageCircle size={22} color="white" />
          </div>
          <span className="text-white text-xs font-medium">{reel.commentCount}</span>
        </button>
        <button onClick={onToggleRepost} className="flex flex-col items-center gap-1">
          <div className="w-11 h-11 rounded-full bg-black/40 flex items-center justify-center">
            <Repeat2 size={22} color={reposted ? '#22c55e' : 'white'} />
          </div>
          <span className="text-white text-xs font-medium">{reel.repostCount}</span>
        </button>
        <button onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/reels?r=${reel.id}`)} className="flex flex-col items-center gap-1">
          <div className="w-11 h-11 rounded-full bg-black/40 flex items-center justify-center">
            <Share2 size={20} color="white" />
          </div>
        </button>
      </div>
    </div>
  );
}

function UploadModal({ artist, onClose, onUploaded }: {
  artist: { id: string; name: string; slug: string; photoUrl: string; isVerified: boolean };
  onClose: () => void;
  onUploaded: (reel: Reel) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(f.type)) { alert('Please choose an MP4, MOV, or WEBM video.'); return; }
    if (f.size > 100 * 1024 * 1024) { alert('Reels must be under 100MB.'); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function submit() {
    if (!file || uploading) return;
    setUploading(true);
    try {
      const presignRes = await fetch('/api/social/upload-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, context: 'reel' }),
      });
      if (!presignRes.ok) throw new Error();
      const { presignedUrl, publicUrl } = await presignRes.json();
      const putRes = await fetch(presignedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!putRes.ok) throw new Error();

      const createRes = await fetch('/api/social/reels', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: publicUrl, caption }),
      });
      if (createRes.ok) {
        const d = await createRes.json();
        onUploaded({ ...d.reel, artist, isOwn: true });
        onClose();
      }
    } catch {
      alert('Upload failed — please try again.');
    }
    setUploading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-bold" style={{ color: 'var(--text)' }}>New Reel</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>
        <div className="p-4">
          {!preview ? (
            <label className="flex flex-col items-center justify-center gap-2 rounded-xl cursor-pointer p-10" style={{ border: '2px dashed var(--border)' }}>
              <Plus size={24} style={{ color: 'var(--text-muted)' }} />
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Choose a video (MP4/MOV, up to 100MB)</span>
              <input type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={handlePick} />
            </label>
          ) : (
            <video src={preview} controls className="w-full rounded-xl max-h-72 bg-black" />
          )}
          <textarea className="input w-full resize-none text-sm mt-3" rows={2} placeholder="Write a caption…"
            value={caption} maxLength={500} onChange={e => setCaption(e.target.value)} />
          <button onClick={submit} disabled={!file || uploading} className="btn btn-primary w-full mt-3 disabled:opacity-40">
            {uploading ? <VukaLoader size={16} /> : 'Post Reel'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReelsPage() {
  const router = useRouter();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [myArtist, setMyArtist] = useState<{ id: string; name: string; slug: string; photoUrl: string; isVerified: boolean } | null>(null);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [repostedMap, setRepostedMap] = useState<Record<string, boolean>>({});
  const [uploadOpen, setUploadOpen] = useState(false);

  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/auth/login'); return; }
      try {
        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) { const me = await meRes.json(); if (me.artist) setMyArtist(me.artist); }
      } catch {}
      await load(null, true);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function load(cursor: string | null, replace: boolean) {
    if (replace) setLoading(true); else setLoadingMore(true);
    try {
      const qs = new URLSearchParams({ tab: 'discover' });
      if (cursor) qs.set('cursor', cursor);
      const res = await fetch(`/api/social/reels?${qs}`);
      if (res.ok) {
        const d = await res.json();
        const items: Reel[] = d.items || [];
        setReels(prev => replace ? items : [...prev, ...items]);
        setNextCursor(d.nextCursor ?? null);
        const ids = items.map(r => r.id);
        if (ids.length) {
          fetch(`/api/social/likes?targetType=reel&targetIds=${ids.join(',')}`)
            .then(r => r.ok ? r.json() : null).then(d2 => { if (d2) setLikedMap(prev => ({ ...prev, ...d2.liked })); }).catch(() => {});
          fetch(`/api/social/reposts?targetType=reel&targetIds=${ids.join(',')}`)
            .then(r => r.ok ? r.json() : null).then(d2 => { if (d2) setRepostedMap(prev => ({ ...prev, ...d2.reposted })); }).catch(() => {});
        }
      }
    } catch {}
    setLoading(false);
    setLoadingMore(false);
  }

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / el.clientHeight);
    setActiveIndex(idx);
    if (idx >= reels.length - 2 && nextCursor && !loadingMore) {
      load(nextCursor, false);
    }
  }, [reels.length, nextCursor, loadingMore]);

  async function toggleLike(id: string) {
    const prev = !!likedMap[id];
    setLikedMap(m => ({ ...m, [id]: !prev }));
    setReels(rs => rs.map(r => r.id === id ? { ...r, likeCount: Math.max(0, r.likeCount + (prev ? -1 : 1)) } : r));
    try {
      const res = await fetch('/api/social/likes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetType: 'reel', targetId: id }) });
      if (!res.ok) throw new Error();
    } catch {
      setLikedMap(m => ({ ...m, [id]: prev }));
      setReels(rs => rs.map(r => r.id === id ? { ...r, likeCount: Math.max(0, r.likeCount + (prev ? 1 : -1)) } : r));
    }
  }

  async function toggleRepost(id: string) {
    const prev = !!repostedMap[id];
    setRepostedMap(m => ({ ...m, [id]: !prev }));
    setReels(rs => rs.map(r => r.id === id ? { ...r, repostCount: Math.max(0, r.repostCount + (prev ? -1 : 1)) } : r));
    try {
      const res = await fetch('/api/social/reposts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetType: 'reel', targetId: id }) });
      if (!res.ok) throw new Error();
    } catch {
      setRepostedMap(m => ({ ...m, [id]: prev }));
      setReels(rs => rs.map(r => r.id === id ? { ...r, repostCount: Math.max(0, r.repostCount + (prev ? 1 : -1)) } : r));
    }
  }

  function openComments(reelId: string) {
    setCommentsFor(reelId);
    setCommentsLoading(true);
    setComments([]);
    fetch(`/api/social/comments?targetType=reel&targetId=${reelId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setComments(d?.comments || []))
      .finally(() => setCommentsLoading(false));
  }

  async function submitComment() {
    if (!commentDraft.trim() || !commentsFor) return;
    const reelId = commentsFor;
    try {
      const res = await fetch('/api/social/comments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentDraft.trim(), targetType: 'reel', targetId: reelId }),
      });
      if (res.ok) {
        const d = await res.json();
        setComments(prev => [d.comment, ...prev]);
        setReels(rs => rs.map(r => r.id === reelId ? { ...r, commentCount: r.commentCount + 1 } : r));
        setCommentDraft('');
      }
    } catch {}
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'black' }}>
      <VukaLoader size={28} />
    </div>
  );

  return (
    <div className="fixed inset-0" style={{ background: 'black' }}>
      <div className="flex items-center justify-between px-4 py-3 absolute top-0 left-0 right-0 z-10" style={{ background: 'linear-gradient(rgba(0,0,0,0.6), transparent)' }}>
        <h1 className="text-white font-bold text-lg">Reels</h1>
        {myArtist && (
          <button onClick={() => setUploadOpen(true)} className="text-white flex items-center gap-1 text-sm font-semibold bg-white/10 px-3 py-1.5 rounded-full">
            <Plus size={16} /> New
          </button>
        )}
      </div>

      {reels.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center px-6">
          <p className="text-white font-semibold">No reels yet</p>
          <p className="text-white/60 text-sm mt-1">
            {myArtist ? 'Be the first to post one.' : 'Check back soon.'}
          </p>
          {myArtist && (
            <button onClick={() => setUploadOpen(true)} className="btn btn-primary text-sm px-4 py-2 mt-4">Post a Reel</button>
          )}
        </div>
      ) : (
        <div ref={containerRef} onScroll={handleScroll}
          className="h-full overflow-y-scroll snap-y snap-mandatory"
          style={{ scrollBehavior: 'smooth' }}>
          {reels.map((reel, i) => (
            <div key={reel.id} ref={el => { slideRefs.current[i] = el; }} className="h-screen w-full">
              <ReelSlide
                reel={reel}
                active={i === activeIndex}
                muted={muted}
                onToggleMute={() => setMuted(m => !m)}
                liked={!!likedMap[reel.id]}
                onToggleLike={() => toggleLike(reel.id)}
                onOpenComments={() => openComments(reel.id)}
                reposted={!!repostedMap[reel.id]}
                onToggleRepost={() => toggleRepost(reel.id)}
              />
            </div>
          ))}
        </div>
      )}

      {uploadOpen && myArtist && (
        <UploadModal artist={myArtist} onClose={() => setUploadOpen(false)} onUploaded={(r) => setReels(prev => [r, ...prev])} />
      )}

      {/* Comments sheet */}
      {commentsFor && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setCommentsFor(null)}>
          <div className="w-full md:max-w-md md:rounded-2xl rounded-t-2xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)', maxHeight: '70vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="font-bold text-sm" style={{ color: 'var(--text)' }}>Comments</h2>
              <button onClick={() => setCommentsFor(null)} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {commentsLoading ? (
                <div className="flex justify-center py-6"><VukaLoader size={18} /></div>
              ) : comments.length === 0 ? (
                <p className="text-xs text-center py-6" style={{ color: 'var(--text-muted)' }}>No comments yet</p>
              ) : comments.map(c => (
                <div key={c.id} className="flex gap-2 py-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-white text-xs flex-shrink-0" style={{ background: 'var(--sky)' }}>{initials(c.user?.name ?? '?')}</div>
                  <div className="rounded-2xl px-3 py-2" style={{ background: 'var(--surface2)' }}>
                    <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{c.user?.name ?? 'Someone'}</p>
                    <p className="text-sm" style={{ color: 'var(--text)' }}>{c.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 p-3" style={{ borderTop: '1px solid var(--border)' }}>
              <input className="input flex-1 text-sm" placeholder="Add a comment…" value={commentDraft}
                onChange={e => setCommentDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitComment()} />
              <button onClick={submitComment} disabled={!commentDraft.trim()} className="btn btn-primary px-3 disabled:opacity-40"><Send size={14} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
