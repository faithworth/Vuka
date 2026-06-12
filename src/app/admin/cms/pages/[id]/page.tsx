'use client';
// /admin/cms/pages/[id]  — full block editor
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Save, Globe, Eye, EyeOff, Plus, Trash2, Edit3,
  ChevronUp, ChevronDown, RefreshCw, Users, MessageSquare,
  Clock, CheckCircle, Send, X, Settings, History, Lock, Star,
} from 'lucide-react';
import { BLOCK_TYPES, BlockType } from '@/lib/cms';

type Block = { id: string; pageId: string; type: string; label: string; content: Record<string, unknown>; order: number; isVisible: boolean };
type Page  = { id: string; slug: string; title: string; description: string; status: string; isSystem: boolean; metaTitle: string; metaDesc: string; publishedAt: string | null; blocks: Block[]; collaborators: Array<{ userId: string; canEdit: boolean; canPublish: boolean; user: { id: string; name: string; email: string; role: string } }>; comments: Array<{ id: string; body: string; resolved: boolean; createdAt: string; createdById: string }> };
type Rev   = { id: string; summary: string; createdAt: string; createdById: string };

const SL: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Draft',     color: '#a0a0a0' },
  review:    { label: 'In Review', color: '#e8c87c' },
  approved:  { label: 'Approved',  color: '#38b6e8' },
  published: { label: 'Published', color: '#a0e87c' },
  archived:  { label: 'Archived',  color: '#666'    },
};

// ── Simple field helper ───────────────────────────────────────
function F({ label, value, onChange, multi = false, placeholder = '', type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void;
  multi?: boolean; placeholder?: string; type?: string;
}) {
  const base = "w-full px-3 py-2 rounded-xl text-sm";
  const sty  = { background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' } as React.CSSProperties;
  return (
    <div className="mb-3">
      {label && <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>}
      {multi
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} className={`${base} resize-none`} style={sty} />
        : <input    type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={base} style={sty} />}
    </div>
  );
}

// ── Block editor ──────────────────────────────────────────────
function BlockEditor({ block, onUpdate, onDelete, onUp, onDown, canUp, canDown }: {
  block: Block; onUpdate: (c: Record<string, unknown>, o?: { label?: string; isVisible?: boolean }) => void;
  onDelete: () => void; onUp: () => void; onDown: () => void; canUp: boolean; canDown: boolean;
}) {
  const [open, setOpen] = useState(false);
  const c = block.content;
  const meta = BLOCK_TYPES.find(b => b.type === block.type);
  const upd  = (patch: Record<string, unknown>) => onUpdate({ ...c, ...patch });
  const jsonF = (key: string) => (
    <F label="" value={JSON.stringify((c[key] as unknown) ?? [], null, 2)}
      onChange={v => { try { upd({ [key]: JSON.parse(v) }); } catch { /* wait */ } }}
      multi placeholder={`[{"key":"value"}]`} />
  );

  const editor = () => {
    switch (block.type) {
      case 'hero': return (<>
        <F label="Badge"       value={String(c.badge ?? '')}       onChange={v => upd({ badge: v })} />
        <F label="Headline (\\n for line breaks)" value={String(c.headline ?? '')} onChange={v => upd({ headline: v })} multi />
        <F label="Sub-headline" value={String(c.subheadline ?? '')} onChange={v => upd({ subheadline: v })} multi />
        <div className="grid grid-cols-2 gap-3">
          <F label="CTA 1 label" value={String((c.cta_primary  as Record<string,string>)?.label ?? '')} onChange={v => upd({ cta_primary:  { ...(c.cta_primary  as object), label: v } })} />
          <F label="CTA 1 link"  value={String((c.cta_primary  as Record<string,string>)?.href  ?? '')} onChange={v => upd({ cta_primary:  { ...(c.cta_primary  as object), href:  v } })} />
          <F label="CTA 2 label" value={String((c.cta_secondary as Record<string,string>)?.label ?? '')} onChange={v => upd({ cta_secondary: { ...(c.cta_secondary as object), label: v } })} />
          <F label="CTA 2 link"  value={String((c.cta_secondary as Record<string,string>)?.href  ?? '')} onChange={v => upd({ cta_secondary: { ...(c.cta_secondary as object), href:  v } })} />
        </div>
        <F label="Stats JSON" value={JSON.stringify(c.stats ?? [], null, 2)} onChange={v => { try { upd({ stats: JSON.parse(v) }); } catch { /* wait */ } }} multi />
      </>);
      case 'text': return (<>
        <F label="Heading" value={String(c.heading ?? '')} onChange={v => upd({ heading: v })} />
        <F label="Body"    value={String(c.body    ?? '')} onChange={v => upd({ body:    v })} multi />
      </>);
      case 'rich_text': return <F label="HTML" value={String(c.html ?? '')} onChange={v => upd({ html: v })} multi />;
      case 'image': return (<>
        <F label="Image URL" value={String(c.src     ?? '')} onChange={v => upd({ src:     v })} placeholder="https://… or /images/…" />
        <F label="Alt text"  value={String(c.alt     ?? '')} onChange={v => upd({ alt:     v })} />
        <F label="Caption"   value={String(c.caption ?? '')} onChange={v => upd({ caption: v })} />
      </>);
      case 'video': return (<>
        <F label="YouTube / Vimeo URL" value={String(c.url     ?? '')} onChange={v => upd({ url:     v })} placeholder="https://youtube.com/watch?v=…" />
        <F label="Caption"             value={String(c.caption ?? '')} onChange={v => upd({ caption: v })} />
      </>);
      case 'cta': return (<>
        <F label="Heading"    value={String(c.heading    ?? '')} onChange={v => upd({ heading:    v })} />
        <F label="Subheading" value={String(c.subheading ?? '')} onChange={v => upd({ subheading: v })} />
        <F label="Buttons JSON" value={JSON.stringify(c.buttons ?? [], null, 2)} onChange={v => { try { upd({ buttons: JSON.parse(v) }); } catch { /* wait */ } }} multi />
      </>);
      case 'features_grid': return (<>
        <F label="Heading"    value={String(c.heading    ?? '')} onChange={v => upd({ heading:    v })} />
        <F label="Subheading" value={String(c.subheading ?? '')} onChange={v => upd({ subheading: v })} />
        <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Features JSON — each: {"{ \"icon\":\"⚡\", \"title\":\"…\", \"desc\":\"…\" }"}</p>
        {jsonF('features')}
      </>);
      case 'pricing': return (<>
        <F label="Heading"    value={String(c.heading    ?? '')} onChange={v => upd({ heading:    v })} />
        <F label="Subheading" value={String(c.subheading ?? '')} onChange={v => upd({ subheading: v })} />
        <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Tiers JSON array</p>
        {jsonF('tiers')}
      </>);
      case 'artists_grid': return (<>
        <F label="Heading"    value={String(c.heading    ?? '')} onChange={v => upd({ heading:    v })} />
        <F label="Subheading" value={String(c.subheading ?? '')} onChange={v => upd({ subheading: v })} />
        <F label="Max artists" value={String(c.max ?? 6)} onChange={v => upd({ max: parseInt(v) || 6 })} type="number" />
        <p className="text-xs p-2 rounded-lg" style={{ background: 'rgba(56,182,232,0.08)', color: 'var(--text-muted)' }}>
          ℹ️ Artists pulled from <Link href="/admin/cms/featured-artists" className="underline" style={{ color: 'var(--sky)' }}>Featured Artists</Link>.
        </p>
      </>);
      case 'stats':        return <>{jsonF('items')}</>;
      case 'faq': return (<>
        <F label="Heading" value={String(c.heading ?? '')} onChange={v => upd({ heading: v })} />
        <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Items JSON — each: {"{ \"q\":\"…\", \"a\":\"…\" }"}</p>
        {jsonF('items')}
      </>);
      case 'banner': return (<>
        <F label="Banner text" value={String(c.text ?? '')} onChange={v => upd({ text: v })} />
        <div className="mb-3">
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Variant</label>
          <select value={String(c.variant ?? 'info')} onChange={e => upd({ variant: e.target.value })} className="px-3 py-2 rounded-xl text-sm w-full" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            {['info','success','warning','error'].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <F label="Link URL"   value={String(c.link      ?? '')} onChange={v => upd({ link:      v })} placeholder="https://…" />
        <F label="Link label" value={String(c.linkLabel ?? '')} onChange={v => upd({ linkLabel: v })} />
      </>);
      case 'testimonials': return (<>
        <F label="Heading" value={String(c.heading ?? '')} onChange={v => upd({ heading: v })} />
        <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Items JSON — each: {"{ \"quote\":\"…\", \"author\":\"…\", \"role\":\"…\" }"}</p>
        {jsonF('items')}
      </>);
      case 'spacer': return <F label="Height (px)" value={String(c.height ?? 64)} onChange={v => upd({ height: parseInt(v) || 64 })} type="number" />;
      case 'html':   return (<>
        <p className="text-xs mb-2 p-2 rounded-lg" style={{ background: 'rgba(255,77,77,0.08)', color: '#ff4d4d' }}>⚠️ Raw HTML injected directly. Use with care.</p>
        <F label="HTML code" value={String(c.code ?? '')} onChange={v => upd({ code: v })} multi />
      </>);
      default: return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No editor for type: {block.type}</p>;
    }
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: `1px solid ${block.isVisible ? 'var(--border)' : 'rgba(255,255,255,0.04)'}`, opacity: block.isVisible ? 1 : 0.55 }}>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-base">{meta?.icon ?? '📦'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{block.label || meta?.label}</span>
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>{block.type}</span>
            {!block.isVisible && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>Hidden</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onUp}   disabled={!canUp}   className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-white/5"><ChevronUp   size={14} style={{ color: 'var(--text-muted)' }} /></button>
          <button onClick={onDown} disabled={!canDown} className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-white/5"><ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /></button>
          <button onClick={() => onUpdate(c, { isVisible: !block.isVisible })} className="p-1.5 rounded-lg hover:bg-white/5">
            {block.isVisible ? <Eye size={14} style={{ color: 'var(--text-muted)' }} /> : <EyeOff size={14} style={{ color: 'var(--text-muted)' }} />}
          </button>
          <button onClick={() => setOpen(o => !o)} className="p-1.5 rounded-lg hover:bg-white/5">
            <Edit3 size={14} style={{ color: open ? 'var(--sky)' : 'var(--text-muted)' }} />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-500/10"><Trash2 size={14} style={{ color: '#ff4d4d' }} /></button>
        </div>
      </div>
      {open && (
        <div className="px-4 pb-4 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <F label="Block label (internal name)" value={block.label} onChange={v => onUpdate(c, { label: v })} placeholder={meta?.label} />
          <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>{editor()}</div>
        </div>
      )}
    </div>
  );
}

// ── Page editor ───────────────────────────────────────────────
export default function CmsPageEditor() {
  const params = useParams();
  const pageId = params.id as string;
  const [page, setPage]   = useState<Page | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [tab, setTab] = useState<'content' | 'settings' | 'collaborate' | 'revisions'>('content');
  const [addingBlock, setAddingBlock] = useState(false);
  const [me, setMe] = useState<{ id: string; role: string; name: string } | null>(null);
  const [eTitle, setETitle] = useState(''); const [eDesc, setEDesc] = useState('');
  const [eMeta, setEMeta]   = useState(''); const [eMetaD, setEMetaD] = useState('');
  const [comment, setComment] = useState('');
  const [revisions, setRevisions] = useState<Rev[]>([]);
  const [allUsers, setAllUsers]   = useState<Array<{ id: string; name: string; email: string; role: string }>>([]);
  const [collabQ, setCollabQ]     = useState('');

  const pending = useRef<Map<string, Record<string, unknown>>>(new Map());
  const timer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [pr, mr] = await Promise.all([fetch(`/api/cms/pages/${pageId}`), fetch('/api/auth/me')]);
    if (pr.ok) {
      const d = await pr.json();
      setPage(d.page); setBlocks(d.page.blocks ?? []);
      setETitle(d.page.title); setEDesc(d.page.description);
      setEMeta(d.page.metaTitle); setEMetaD(d.page.metaDesc);
    }
    if (mr.ok) { const d = await mr.json(); setMe({ id: d.id, role: d.role, name: d.name }); }
    setLoading(false);
  }, [pageId]);

  useEffect(() => { load(); }, [load]);

  const schedSave = useCallback((id: string, content: Record<string, unknown>, opts?: { label?: string; isVisible?: boolean }) => {
    const payload: Record<string, unknown> = { content };
    if (opts?.label     !== undefined) payload.label     = opts.label;
    if (opts?.isVisible !== undefined) payload.isVisible = opts.isVisible;
    pending.current.set(id, payload);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaving(true);
      const updates = Array.from(pending.current.entries()); pending.current.clear();
      await Promise.all(updates.map(([bid, data]) => fetch(`/api/cms/blocks/${bid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })));
      setSaving(false); setSavedAt(new Date());
    }, 1500);
  }, []);

  const updBlock = useCallback((id: string, content: Record<string, unknown>, opts?: { label?: string; isVisible?: boolean }) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, content, label: opts?.label !== undefined ? opts.label : b.label, isVisible: opts?.isVisible !== undefined ? opts.isVisible : b.isVisible } : b));
    schedSave(id, content, opts);
  }, [schedSave]);

  const delBlock = useCallback(async (id: string) => {
    if (!confirm('Delete this block?')) return;
    setBlocks(prev => prev.filter(b => b.id !== id));
    await fetch(`/api/cms/blocks/${id}`, { method: 'DELETE' });
  }, []);

  const moveBlock = useCallback((id: string, dir: 'up' | 'down') => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id); if (idx === -1) return prev;
      const ni = dir === 'up' ? idx - 1 : idx + 1; if (ni < 0 || ni >= prev.length) return prev;
      const next = [...prev]; [next[idx], next[ni]] = [next[ni], next[idx]];
      const reordered = next.map((b, i) => ({ ...b, order: i }));
      fetch(`/api/cms/pages/${pageId}/blocks`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: reordered.map(b => ({ id: b.id, order: b.order })) }) });
      return reordered;
    });
  }, [pageId]);

  const addBlock = useCallback(async (type: BlockType) => {
    const res = await fetch(`/api/cms/pages/${pageId}/blocks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }) });
    if (res.ok) { const d = await res.json(); setBlocks(prev => [...prev, d.block]); }
    setAddingBlock(false);
  }, [pageId]);

  const saveSettings = async () => {
    setSaving(true);
    await fetch(`/api/cms/pages/${pageId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: eTitle, description: eDesc, metaTitle: eMeta, metaDesc: eMetaD }) });
    setSaving(false); setSavedAt(new Date()); await load();
  };

  const changeStatus = async (action: string) => {
    setSaving(true);
    const res = await fetch(`/api/cms/pages/${pageId}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    setSaving(false);
    if (res.ok) await load(); else alert((await res.json()).error ?? 'Failed');
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    await fetch(`/api/cms/pages/${pageId}/collaborate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'comment', body: comment }) });
    setComment(''); await load();
  };

  const resolveComment = async (cid: string) => {
    await fetch(`/api/cms/pages/${pageId}/collaborate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'resolve_comment', commentId: cid }) });
    await load();
  };

  const loadRevisions = async () => { const r = await fetch(`/api/cms/pages/${pageId}/revisions`); if (r.ok) setRevisions((await r.json()).revisions); };
  const saveSnap      = async () => { const s = prompt('Revision summary:', 'Manual save'); if (s === null) return; await fetch(`/api/cms/pages/${pageId}/revisions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ summary: s }) }); await loadRevisions(); };
  const restoreRev    = async (rid: string) => { if (!confirm('Restore this revision? Current state saved first.')) return; await fetch(`/api/cms/pages/${pageId}/revisions/${rid}`, { method: 'POST' }); await load(); };
  const loadUsers     = async () => { const r = await fetch('/api/admin/users'); if (r.ok) setAllUsers((await r.json()).users ?? []); };
  const addCollab     = async (uid: string) => { await fetch(`/api/cms/pages/${pageId}/collaborate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'collaborator', userId: uid }) }); await load(); };
  const rmCollab      = async (uid: string) => { await fetch(`/api/cms/pages/${pageId}/collaborate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'remove_collaborator', userId: uid }) }); await load(); };

  useEffect(() => { if (tab === 'revisions') loadRevisions(); if (tab === 'collaborate') loadUsers(); }, [tab]);

  if (loading) return <div className="flex items-center justify-center py-20"><RefreshCw size={28} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>;
  if (!page)   return <div className="text-center py-20"><p style={{ color: 'var(--text-muted)' }}>Page not found.</p><Link href="/admin/cms" className="text-sm mt-2 inline-block" style={{ color: 'var(--sky)' }}>← Back</Link></div>;

  const sc    = SL[page.status] ?? SL.draft;
  const canPub  = me && ['owner', 'super_admin', 'admin'].includes(me.role);
  const isLive  = page.status === 'published';
  const openCom = page.comments.filter(c => !c.resolved);

  return (
    <div style={{ color: 'var(--text)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Link href="/admin/cms" className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}><ArrowLeft size={16} /> Pages</Link>
        <div className="flex-1" />
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
          style={{ background: `${sc.color}18`, color: sc.color, border: `1px solid ${sc.color}30` }}>{sc.label}</span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{saving ? '⏳ Saving…' : savedAt ? `✓ ${savedAt.toLocaleTimeString()}` : ''}</span>
        {page.status === 'draft'    && <button onClick={() => changeStatus('review')}   className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium" style={{ background: 'rgba(232,200,124,0.1)', color: 'var(--gold)', border: '1px solid rgba(232,200,124,0.25)' }}><Send size={14} /> Submit for Review</button>}
        {page.status === 'review'   && canPub && <button onClick={() => changeStatus('approve')} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium" style={{ background: 'rgba(56,182,232,0.1)', color: 'var(--sky)', border: '1px solid rgba(56,182,232,0.25)' }}><CheckCircle size={14} /> Approve</button>}
        {['approved','draft'].includes(page.status) && canPub && <button onClick={() => changeStatus('publish')} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'var(--sky)', color: '#000' }}><Globe size={14} /> Publish</button>}
        {isLive && canPub && <button onClick={() => changeStatus('unpublish')} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium" style={{ background: 'rgba(255,77,77,0.1)', color: '#ff4d4d', border: '1px solid rgba(255,77,77,0.2)' }}><EyeOff size={14} /> Unpublish</button>}
        {isLive && <a href={`/${page.slug}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium" style={{ background: 'rgba(160,232,124,0.1)', color: 'var(--green)', border: '1px solid rgba(160,232,124,0.2)' }}><Eye size={14} /> View Live</a>}
      </div>

      <div className="flex items-center gap-2 mb-6">
        <h1 className="text-2xl font-bold">{page.title}</h1>
        {page.isSystem && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(56,182,232,0.1)', color: 'var(--sky)' }}><Lock size={9} /> System</span>}
        <span className="text-sm ml-1" style={{ color: 'var(--text-muted)' }}>/{page.slug}</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 'fit-content' }}>
        {([['content','Content',Edit3],['settings','Settings',Settings],['collaborate',`Collaborate${openCom.length ? ` (${openCom.length})` : ''}`,Users],['revisions','History',History]] as const).map(([id,label,Icon]) => (
          <button key={id} onClick={() => setTab(id as typeof tab)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: tab === id ? 'var(--bg)' : 'transparent', color: tab === id ? 'var(--text)' : 'var(--text-muted)' }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ── Content tab ── */}
      {tab === 'content' && (
        <div>
          {blocks.length === 0 && <div className="text-center py-16 rounded-2xl mb-6" style={{ border: '2px dashed var(--border)', color: 'var(--text-muted)' }}><p>No blocks yet — add one below</p></div>}
          <div className="space-y-3 mb-6">
            {blocks.map((b, i) => (
              <BlockEditor key={b.id} block={b}
                onUpdate={(c, o) => updBlock(b.id, c, o)}
                onDelete={() => delBlock(b.id)}
                onUp={()   => moveBlock(b.id, 'up')}
                onDown={()  => moveBlock(b.id, 'down')}
                canUp={i > 0} canDown={i < blocks.length - 1} />
            ))}
          </div>
          {!addingBlock ? (
            <button onClick={() => setAddingBlock(true)} className="w-full py-4 rounded-2xl flex items-center justify-center gap-2 text-sm font-medium transition-all"
              style={{ border: '2px dashed var(--border)', color: 'var(--text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--sky)'; e.currentTarget.style.color = 'var(--sky)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
              <Plus size={18} /> Add Block
            </button>
          ) : (
            <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm">Choose block type</h3>
                <button onClick={() => setAddingBlock(false)} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {BLOCK_TYPES.map(bt => (
                  <button key={bt.type} onClick={() => addBlock(bt.type as BlockType)}
                    className="flex items-start gap-2 p-3 rounded-xl text-left transition-all"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--sky)'; e.currentTarget.style.background = 'rgba(56,182,232,0.05)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg)'; }}>
                    <span className="text-lg">{bt.icon}</span>
                    <div><div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{bt.label}</div><div className="text-xs mt-0.5 leading-tight" style={{ color: 'var(--text-muted)' }}>{bt.desc}</div></div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Settings tab ── */}
      {tab === 'settings' && (
        <div className="max-w-xl space-y-4">
          <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="font-semibold mb-4">Page Settings</h3>
            <F label="Page Title"   value={eTitle} onChange={setETitle} />
            <F label="Description" value={eDesc}  onChange={setEDesc} multi />
          </div>
          <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="font-semibold mb-4">SEO / Meta</h3>
            <F label="Meta Title (50-60 chars)"       value={eMeta}  onChange={setEMeta}  placeholder={eTitle} />
            <F label="Meta Description (150-160 chars)" value={eMetaD} onChange={setEMetaD} multi placeholder="Brief description for search engines" />
          </div>
          <button onClick={saveSettings} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--sky)', color: '#000' }}>
            <Save size={15} /> {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      )}

      {/* ── Collaborate tab ── */}
      {tab === 'collaborate' && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Collaborators */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Users size={16} style={{ color: 'var(--sky)' }} /> Collaborators</h3>
            {page.collaborators.length === 0 && <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>No collaborators yet.</p>}
            <div className="space-y-2 mb-4">
              {page.collaborators.map(col => (
                <div key={col.userId} className="flex items-center gap-3 p-2 rounded-xl" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(56,182,232,0.15)', color: 'var(--sky)' }}>{col.user.name[0].toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{col.user.name}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{col.user.role}</div>
                  </div>
                  <div className="flex gap-1 text-xs">
                    {col.canEdit    && <span className="px-1.5 py-0.5 rounded" style={{ background: 'rgba(56,182,232,0.1)', color: 'var(--sky)' }}>edit</span>}
                    {col.canPublish && <span className="px-1.5 py-0.5 rounded" style={{ background: 'rgba(160,232,124,0.1)', color: 'var(--green)' }}>publish</span>}
                  </div>
                  {canPub && <button onClick={() => rmCollab(col.userId)} className="text-xs px-2 py-1 rounded-lg hover:bg-red-500/10" style={{ color: '#ff4d4d' }}>✕</button>}
                </div>
              ))}
            </div>
            {canPub && (
              <>
                <input value={collabQ} onChange={e => setCollabQ(e.target.value)} placeholder="Search admin/moderator users…" className="w-full px-3 py-2 rounded-xl text-sm mb-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {allUsers.filter(u => ['admin','moderator','owner','super_admin'].includes(u.role) && u.id !== me?.id && !page.collaborators.some(c => c.userId === u.id) && (!collabQ || u.name.toLowerCase().includes(collabQ.toLowerCase()))).slice(0,8).map(u => (
                    <button key={u.id} onClick={() => addCollab(u.id)} className="w-full flex items-center gap-3 p-2 rounded-xl text-left" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--sky)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: 'rgba(160,232,124,0.15)', color: 'var(--green)' }}>{u.name[0]}</div>
                      <div className="flex-1 min-w-0"><div className="text-xs font-medium truncate">{u.name}</div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>{u.role}</div></div>
                      <Plus size={12} style={{ color: 'var(--sky)' }} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Review comments */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <MessageSquare size={16} style={{ color: 'var(--gold)' }} /> Review Notes
              {openCom.length > 0 && <span className="px-1.5 py-0.5 rounded-full text-xs" style={{ background: 'rgba(232,200,124,0.15)', color: 'var(--gold)' }}>{openCom.length}</span>}
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
              {page.comments.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No notes yet.</p>}
              {page.comments.map(c => (
                <div key={c.id} className="p-3 rounded-xl text-sm" style={{ background: 'var(--bg)', border: `1px solid ${c.resolved ? 'var(--border)' : 'rgba(232,200,124,0.25)'}`, opacity: c.resolved ? 0.5 : 1 }}>
                  <p>{c.body}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(c.createdAt).toLocaleDateString()}</span>
                    {!c.resolved && <button onClick={() => resolveComment(c.id)} className="text-xs" style={{ color: 'var(--green)' }}>✓ Resolve</button>}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && addComment()} placeholder="Add a review note…" className="flex-1 px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              <button onClick={addComment} disabled={!comment.trim()} className="px-3 py-2 rounded-xl disabled:opacity-40" style={{ background: 'var(--gold)', color: '#000' }}><Send size={14} /></button>
            </div>
          </div>
        </div>
      )}

      {/* ── Revisions tab ── */}
      {tab === 'revisions' && (
        <div className="max-w-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Version History</h3>
            <button onClick={saveSnap} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium" style={{ background: 'rgba(56,182,232,0.1)', color: 'var(--sky)', border: '1px solid rgba(56,182,232,0.2)' }}><Save size={14} /> Save Snapshot</button>
          </div>
          {revisions.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--text-muted)' }}>No history yet. Snapshots are saved on publish.</p>
          ) : (
            <div className="space-y-2">
              {revisions.map(r => (
                <div key={r.id} className="flex items-center gap-4 p-4 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <Clock size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.summary || 'Snapshot'}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(r.createdAt).toLocaleString()}</div>
                  </div>
                  <button onClick={() => restoreRev(r.id)} className="text-xs px-3 py-1.5 rounded-xl font-medium" style={{ background: 'rgba(160,232,124,0.1)', color: 'var(--green)', border: '1px solid rgba(160,232,124,0.2)' }}>Restore</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
