'use client';
import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Image, Link2, Send } from 'lucide-react';

interface Post {
  id: string;
  body: string;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  publishedAt: string;
  isPublished: boolean;
}

export default function DashboardPostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/social/posts')
      .then(r => r.ok ? r.json() : { posts: [] })
      .then(d => { setPosts(d.posts || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function createPost() {
    if (!body.trim()) { setError('Post cannot be empty'); return; }
    setPosting(true);
    setError('');
    try {
      const res = await fetch('/api/social/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim() }),
      });
      if (res.ok) {
        const d = await res.json();
        setPosts(prev => [d.post, ...prev]);
        setBody('');
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
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Share updates with your followers</p>
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
            maxLength={1000}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{body.length}/1000</span>
            <div className="flex gap-2">
              <button onClick={() => { setShowForm(false); setBody(''); setError(''); }}
                className="btn btn-secondary px-4">
                Cancel
              </button>
              <button onClick={createPost} disabled={posting || !body.trim()}
                className="btn btn-primary gap-2 disabled:opacity-50">
                {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
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
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--sky)' }} />
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
