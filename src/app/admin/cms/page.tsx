'use client';
// /admin/cms  — lists all CMS pages
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Globe, FileText, Archive, Eye, Edit3, Trash2, Clock, CheckCircle, Star, RefreshCw, Search, Lock, Users, AlertCircle, ChevronRight } from 'lucide-react';

type PS = 'draft' | 'review' | 'approved' | 'published' | 'archived';
type Page = { id: string; slug: string; title: string; description: string; status: PS; isSystem: boolean; publishedAt: string | null; updatedAt: string; _count: { blocks: number; collaborators: number; comments: number } };

const SC: Record<PS, { label: string; color: string; icon: typeof Globe }> = {
  draft:     { label: 'Draft',     color: '#a0a0a0', icon: FileText    },
  review:    { label: 'In Review', color: '#e8c87c', icon: Clock       },
  approved:  { label: 'Approved',  color: '#38b6e8', icon: CheckCircle },
  published: { label: 'Published', color: '#a0e87c', icon: Globe       },
  archived:  { label: 'Archived',  color: '#666',    icon: Archive     },
};

export default function CmsPagesAdmin() {
  const [pages, setPages]   = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<PS | 'all'>('all');
  const [creating, setCreating] = useState(false);
  const [nTitle, setNTitle] = useState('');
  const [nSlug,  setNSlug]  = useState('');
  const [nDesc,  setNDesc]  = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const [me, setMe]         = useState<{ role: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [pr, mr] = await Promise.all([fetch('/api/cms/pages'), fetch('/api/auth/me')]);
    if (pr.ok) setPages((await pr.json()).pages ?? []);
    if (mr.ok) setMe({ role: (await mr.json()).role });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onTitle = (v: string) => {
    setNTitle(v);
    setNSlug(v.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''));
  };

  const create = async () => {
    if (!nTitle.trim() || !nSlug.trim()) return;
    setSaving(true); setErr('');
    const res = await fetch('/api/cms/pages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: nTitle, slug: nSlug, description: nDesc }) });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) { setErr(d.error ?? 'Failed'); return; }
    setCreating(false); setNTitle(''); setNSlug(''); setNDesc('');
    await load();
  };

  const del = async (p: Page) => {
    if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    await fetch(`/api/cms/pages/${p.id}`, { method: 'DELETE' });
    await load();
  };

  const filtered = pages.filter(p =>
    (filter === 'all' || p.status === filter) &&
    (!search || p.title.toLowerCase().includes(search.toLowerCase()) || p.slug.includes(search.toLowerCase()))
  );
  const canDel = me && ['owner', 'super_admin'].includes(me.role);

  return (
    <div style={{ color: 'var(--text)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold mb-1">Content Pages</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Manage all website pages — landing, legal, and custom content.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/cms/featured-artists" className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(201,162,39,0.12)', color: 'var(--gold)', border: '1px solid rgba(201,162,39,0.25)' }}>
            <Star size={15} /> Featured Artists
          </Link>
          <button onClick={() => setCreating(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--sky)', color: '#000' }}>
            <Plus size={15} /> New Page
          </button>
        </div>
      </div>

      {/* Create modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h2 className="text-lg font-bold mb-4">Create New Page</h2>
            {err && <p className="text-sm mb-3 p-2 rounded-lg" style={{ background: 'rgba(255,77,77,0.1)', color: '#ff4d4d' }}>{err}</p>}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Page Title *</label>
                <input value={nTitle} onChange={e => onTitle(e.target.value)} placeholder="e.g. About Us" className="w-full px-3 py-2 rounded-xl text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>URL Slug *</label>
                <div className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>vuka.app/</span>
                  <input value={nSlug} onChange={e => setNSlug(e.target.value.toLowerCase().replace(/[^a-z0-9\-\/]/g, ''))}
                    placeholder="about-us" className="flex-1 bg-transparent text-sm" style={{ color: 'var(--text)', outline: 'none' }} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Description (optional)</label>
                <input value={nDesc} onChange={e => setNDesc(e.target.value)} placeholder="Brief description"
                  className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setCreating(false); setErr(''); }} className="flex-1 py-2 rounded-xl text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>Cancel</button>
              <button onClick={create} disabled={saving || !nTitle.trim() || !nSlug.trim()} className="flex-1 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--sky)', color: '#000' }}>{saving ? 'Creating…' : 'Create Page'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search pages…" className="w-full pl-9 pr-3 py-2 rounded-xl text-sm"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'draft', 'review', 'approved', 'published', 'archived'] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)} className="px-3 py-1.5 rounded-xl text-xs font-medium capitalize"
              style={{ background: filter === s ? 'rgba(56,182,232,0.15)' : 'var(--surface)', color: filter === s ? 'var(--sky)' : 'var(--text-muted)', border: `1px solid ${filter === s ? 'rgba(56,182,232,0.3)' : 'var(--border)'}` }}>
              {s === 'all' ? 'All' : SC[s as PS]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><RefreshCw size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>{search ? `No pages matching "${search}"` : 'No pages yet.'}</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(page => {
            const cfg = SC[page.status]; const Icon = cfg.icon;
            return (
              <div key={page.id} className="rounded-2xl p-5 flex items-center gap-4 transition-all"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(56,182,232,0.3)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${cfg.color}18` }}>
                  <Icon size={16} style={{ color: cfg.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-sm truncate">{page.title}</span>
                    {page.isSystem && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(56,182,232,0.1)', color: 'var(--sky)' }}><Lock size={9} /> System</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span>/{page.slug}</span><span>·</span><span>{page._count.blocks} blocks</span>
                    {page._count.collaborators > 0 && <><span>·</span><span className="flex items-center gap-1"><Users size={10} />{page._count.collaborators}</span></>}
                    {page._count.comments     > 0 && <><span>·</span><span className="flex items-center gap-1"><AlertCircle size={10} />{page._count.comments} notes</span></>}
                  </div>
                </div>
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ background: `${cfg.color}18`, color: cfg.color }}>{cfg.label}</span>
                <div className="flex items-center gap-2">
                  {page.status === 'published' && (
                    <a href={`/${page.slug}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-xl" style={{ color: 'var(--text-muted)' }} title="View live page"><Eye size={15} /></a>
                  )}
                  <Link href={`/admin/cms/pages/${page.id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
                    style={{ background: 'rgba(56,182,232,0.1)', color: 'var(--sky)', border: '1px solid rgba(56,182,232,0.2)' }}>
                    <Edit3 size={13} /> Edit <ChevronRight size={12} />
                  </Link>
                  {canDel && !page.isSystem && (
                    <button onClick={() => del(page)} className="p-2 rounded-xl hover:bg-red-500/10" style={{ color: '#ff4d4d' }}><Trash2 size={15} /></button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
