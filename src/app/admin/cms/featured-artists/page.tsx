'use client';
// /admin/cms/featured-artists
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Star, Plus, Trash2, ChevronUp, ChevronDown, Eye, EyeOff, RefreshCw, Search, ExternalLink, Check, X } from 'lucide-react';

type FA = {
  id: string; tagline: string; blurb: string; order: number; isVisible: boolean;
  artist: { id: string; slug: string; name: string; photoUrl: string; genreTags: string[]; city: string; isVerified: boolean; _count: { followers: number; beats: number } };
};
type Artist = { id: string; slug: string; name: string; photoUrl: string; genreTags: string[]; city: string; isVerified: boolean };

export default function FeaturedArtistsAdmin() {
  const [featured, setFeatured] = useState<FA[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [adding,   setAdding]   = useState(false);
  const [q,        setQ]        = useState('');
  const [results,  setResults]  = useState<Artist[]>([]);
  const [searching,setSearching]= useState(false);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [editTag,  setEditTag]  = useState('');
  const [editBlurb,setEditBlurb]= useState('');
  const [saving,   setSaving]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/cms/featured-artists?all=1');
    if (r.ok) setFeatured((await r.json()).artists ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Debounced artist search
  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const r = await fetch(`/api/cms/featured-artists/search?q=${encodeURIComponent(q)}&limit=10`);
      if (r.ok) {
        const d = await r.json();
        const ids = new Set(featured.map(f => f.artist.id));
        setResults((d.artists ?? []).filter((a: Artist) => !ids.has(a.id)));
      }
      setSearching(false);
    }, 400);
    return () => clearTimeout(t);
  }, [q, featured]);

  const add = async (artist: Artist) => {
    const r = await fetch('/api/cms/featured-artists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ artistId: artist.id }) });
    if (!r.ok) { alert((await r.json()).error ?? 'Failed'); return; }
    setAdding(false); setQ(''); setResults([]);
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm('Remove from featured list?')) return;
    await fetch(`/api/cms/featured-artists/${id}`, { method: 'DELETE' });
    await load();
  };

  const toggleVis = async (item: FA) => {
    await fetch(`/api/cms/featured-artists/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isVisible: !item.isVisible }) });
    await load();
  };

  const move = async (item: FA, dir: 'up' | 'down') => {
    const idx = featured.indexOf(item);
    const ni  = dir === 'up' ? idx - 1 : idx + 1;
    if (ni < 0 || ni >= featured.length) return;
    const arr = [...featured]; [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
    const reordered = arr.map((f, i) => ({ ...f, order: i }));
    setFeatured(reordered);
    await fetch('/api/cms/featured-artists', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: reordered.map(f => ({ id: f.id, order: f.order })) }) });
  };

  const startEdit = (item: FA) => { setEditId(item.id); setEditTag(item.tagline); setEditBlurb(item.blurb); };

  const saveEdit = async (id: string) => {
    setSaving(true);
    await fetch(`/api/cms/featured-artists/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tagline: editTag, blurb: editBlurb }) });
    setSaving(false); setEditId(null);
    await load();
  };

  return (
    <div style={{ color: 'var(--text)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/admin/cms" className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}><ArrowLeft size={15} /> Content Pages</Link>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
          </div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Star size={20} style={{ color: 'var(--gold)' }} /> Featured Artists
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Artists shown in the <code className="px-1 rounded text-xs" style={{ background: 'rgba(255,255,255,0.08)' }}>artists_grid</code> block and landing page Featured Artists section.
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'var(--gold)', color: '#000' }}>
          <Plus size={15} /> Feature an Artist
        </button>
      </div>

      {/* Add modal */}
      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Feature an Artist</h2>
              <button onClick={() => { setAdding(false); setQ(''); setResults([]); }} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search artist by name…" autoFocus
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {searching && <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>Searching…</p>}
              {!searching && q && results.length === 0 && <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>No matching artists.</p>}
              {!searching && !q && <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>Start typing to search Vuka artists.</p>}
              {results.map(artist => (
                <button key={artist.id} onClick={() => add(artist)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                  {artist.photoUrl
                    ? <img src={artist.photoUrl} alt={artist.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    : <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: 'rgba(201,162,39,0.2)', color: 'var(--gold)' }}>{artist.name[0]}</div>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm truncate">{artist.name}</span>
                      {artist.isVerified && <span className="text-xs" style={{ color: 'var(--sky)' }}>✓</span>}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{artist.city} · {artist.genreTags.slice(0, 2).join(', ')}</div>
                  </div>
                  <Plus size={16} style={{ color: 'var(--gold)', flexShrink: 0 }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-4 mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
        <span>{featured.length} featured</span><span>·</span>
        <span>{featured.filter(f => f.isVisible).length} visible</span><span>·</span>
        <span>Ordered top-to-bottom = left-to-right on landing page</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><RefreshCw size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
      ) : featured.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ border: '2px dashed var(--border)', color: 'var(--text-muted)' }}>
          <Star size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="mb-1">No featured artists yet</p>
          <p className="text-sm">Click "Feature an Artist" to spotlight artists on the landing page</p>
        </div>
      ) : (
        <div className="space-y-3">
          {featured.map((item, idx) => (
            <div key={item.id} className="rounded-2xl overflow-hidden transition-all"
              style={{ background: 'var(--surface)', border: `1px solid ${item.isVisible ? 'var(--border)' : 'rgba(255,255,255,0.04)'}`, opacity: item.isVisible ? 1 : 0.6 }}>
              <div className="flex items-center gap-4 p-4">
                {/* Order controls */}
                <div className="flex flex-col gap-0.5 items-center">
                  <button onClick={() => move(item, 'up')}   disabled={idx === 0}                  className="p-1 rounded disabled:opacity-20 hover:bg-white/5"><ChevronUp   size={14} style={{ color: 'var(--text-muted)' }} /></button>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-muted)', minWidth: 16, textAlign: 'center' }}>{idx + 1}</span>
                  <button onClick={() => move(item, 'down')} disabled={idx === featured.length - 1} className="p-1 rounded disabled:opacity-20 hover:bg-white/5"><ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /></button>
                </div>

                {/* Photo */}
                {item.artist.photoUrl
                  ? <img src={item.artist.photoUrl} alt={item.artist.name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                  : <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0" style={{ background: 'rgba(201,162,39,0.15)', color: 'var(--gold)' }}>{item.artist.name[0]}</div>}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-semibold">{item.artist.name}</span>
                    {item.artist.isVerified && <span className="text-xs" style={{ color: 'var(--sky)' }}>✓</span>}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {item.artist.city} · {item.artist.genreTags.slice(0, 2).join(', ')} · {item.artist._count.followers.toLocaleString()} followers · {item.artist._count.beats} beats
                  </div>
                  {item.tagline && <p className="text-xs mt-1 italic truncate" style={{ color: 'var(--gold)' }}>{item.tagline}</p>}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <a href={`/artist/${item.artist.slug}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-xl hover:bg-white/5" title="View artist page"><ExternalLink size={14} style={{ color: 'var(--text-muted)' }} /></a>
                  <button onClick={() => toggleVis(item)} className="p-2 rounded-xl hover:bg-white/5" title={item.isVisible ? 'Hide' : 'Show'}>
                    {item.isVisible ? <Eye size={14} style={{ color: 'var(--sky)' }} /> : <EyeOff size={14} style={{ color: 'var(--text-muted)' }} />}
                  </button>
                  <button onClick={() => startEdit(item)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
                    style={{ background: 'rgba(56,182,232,0.1)', color: 'var(--sky)', border: '1px solid rgba(56,182,232,0.2)' }}>
                    Edit
                  </button>
                  <button onClick={() => remove(item.id)} className="p-2 rounded-xl hover:bg-red-500/10"><Trash2 size={14} style={{ color: '#ff4d4d' }} /></button>
                </div>
              </div>

              {/* Inline edit */}
              {editId === item.id && (
                <div className="px-4 pb-4 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Tagline (below name on card)</label>
                      <input value={editTag} onChange={e => setEditTag(e.target.value)} maxLength={80} placeholder="e.g. Rising Afrobeats Producer"
                        className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Blurb (short bio on card)</label>
                      <input value={editBlurb} onChange={e => setEditBlurb(e.target.value)} maxLength={200} placeholder="2-sentence intro"
                        className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                    </div>
                  </div>
                  <div className="flex gap-3 mt-3">
                    <button onClick={() => setEditId(null)} className="px-4 py-2 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>Cancel</button>
                    <button onClick={() => saveEdit(item.id)} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--gold)', color: '#000' }}>
                      <Check size={14} /> {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {featured.length > 0 && (
        <p className="text-xs mt-6 text-center" style={{ color: 'var(--text-muted)' }}>
          Changes apply immediately to published pages.
          <Link href="/" target="_blank" className="ml-1.5 underline" style={{ color: 'var(--sky)' }}>Preview landing page →</Link>
        </p>
      )}
    </div>
  );
}
