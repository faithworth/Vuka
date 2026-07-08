'use client';
import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Image as ImageIcon, Send, X, Loader2 } from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

interface Post {
  id: string;
  body: string;
  mediaUrls: string[];
  likeCount: number;
  commentCount: number;
  repostCount: number;
  publishedAt: string;
  isPublished: boolean;
}

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_MEDIA_MB = 10;
const MAX_MEDIA_PER_POST = 4;

export default function DashboardPostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [body, setBody] = useState('');
  const [media, setMedia] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/social/posts')
      .then(r => r.ok ? r.json() : { posts: [] })
      .then(d => { setPosts(d.posts || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (media.length + files.length > MAX_MEDIA_PER_POST) {
      setError(`You can attach up to ${MAX_MEDIA_PER_POST} images per post.`);
      return;
    }
    setUploading(true);
    for (const file of files) {
      if (!ALLOWED_MEDIA_TYPES.includes(file.type)) { setError(`${file.name}: unsupported file type`); continue; }
      if (file.size > MAX_MEDIA_MB * 1024 * 1024) { setError(`${file.name}: over ${MAX_MEDIA_MB}MB`); continue; }
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

  async function createPost() {
    if (!body.trim()) { setError('Post cannot be empty'); return; }
    setPosting(true);
    setError('');
    try {
      const res = await fetch('/api/social/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim(), mediaUrls: media }),
      });
      if (res.ok) {
        const d = await res.json();
        setPosts(prev => [d.post, ...prev]);
        setBody('');
        setMedia([]);
        setShowForm(false);
      } else {
        const d = await res.json();
        setError(d.error || 'Failed to post');
      }
    } catch {
      setError('Failed to post');
    }
    setPosting(false);
  }

  async function deletePost(id: string) {
    if (!confirm('Delete this post?')) return;
    try {
      const res = await fetch(`/api/social/posts/${id}`, { method: 'DELETE' });
      if (res.ok) setPosts(prev => prev.filter(p => p.id !== id));
    } catch {}
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div className="p-6 md:p-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Posts</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Share updates with your followers — also visible in the main Feed</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn btn-primary gap-2">
          <Plus size={16} /> New Post
        </button>
      </div>

      {/* Compose */}
      {showForm && (
        <div className="card p-5 mb-6">
          <h3 className="font-bold mb-3" style={{ color: 'var(--text)' }}>New Post</h3>
          <textarea
            className="input w-full resize-none mb-3"
            rows={4}
            placeholder="Share an update, new release, or anything with your fans…"
            value={body}
            onChange={e => setBody(e.target.value)}
            maxLength={2000}
          />
          {media.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-3">
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" accept={ALLOWED_MEDIA_TYPES.join(',')} multiple className="hidden" onChange={handleFiles} />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading || media.length >= MAX_MEDIA_PER_POST}
                className="p-2 rounded-lg transition-colors hover:bg-[var(--surface2)] disabled:opacity-40" style={{ color: 'var(--text-muted)' }}
                title="Attach images">
                {uploading ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
              </button>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{body.length}/2000</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowForm(false); setBody(''); setMedia([]); setError(''); }}
                className="btn btn-secondary px-4">
                Cancel
              </button>
              <button onClick={createPost} disabled={posting || !body.trim()}
                className="btn btn-primary gap-2 disabled:opacity-50">
                {posting ? <VukaLoader size={14} /> : <Send size={14} />}
                Post
              </button>
            </div>
          </div>
          {error && <p className="text-sm mt-2" style={{ color: 'var(--red)' }}>{error}</p>}
        </div>
      )}

      {/* Posts list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <VukaLoader size={24} />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Send size={36} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
          <p className="font-bold mb-1" style={{ color: 'var(--text)' }}>No posts yet</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Share something with your fans</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <div key={post.id} className="card p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text)' }}>
                  {post.body}
                </p>
                <button onClick={() => deletePost(post.id)}
                  className="p-1.5 rounded-lg flex-shrink-0 transition-colors"
                  style={{ color: 'var(--text-muted)' }}>
                  <Trash2 size={15} />
                </button>
              </div>
              {post.mediaUrls?.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {post.mediaUrls.map((url, i) => (
                    <img key={i} src={url} alt="" className="aspect-square rounded-lg object-cover" />
                  ))}
                </div>
              )}
              <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span>{timeAgo(post.publishedAt)}</span>
                <span>❤️ {post.likeCount}</span>
                <span>💬 {post.commentCount}</span>
                <span>🔁 {post.repostCount}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
