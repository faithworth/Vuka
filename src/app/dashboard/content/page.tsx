'use client';
import { useEffect, useState, useRef } from 'react';
import { Plus, Lock, Unlock, Edit2, Trash2, Check, X, FileText, Music, Video as VideoIcon, Link as LinkIcon, Image as ImageIcon } from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

interface Tier { id: string; name: string; }

interface ContentItem {
  id: string;
  title: string;
  description: string;
  contentType: string;
  fileUrl?: string;
  thumbnailUrl?: string;
  externalUrl?: string;
  body?: string;
  accessTierIds: string[];
  isFreePreview: boolean;
  isPublished: boolean;
  publishedAt: string | null;
}

const TYPE_ICON: Record<string, any> = { audio: Music, video: VideoIcon, pdf: FileText, link: LinkIcon, text: FileText };

async function uploadToR2(presignedUrl: string, file: File, onProgress?: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    if (onProgress) xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(file);
  });
}

export default function ExclusiveContentPage() {
  const [artistId, setArtistId] = useState('');
  const [items, setItems] = useState<ContentItem[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contentType, setContentType] = useState('text');
  const [body, setBody] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [selectedTiers, setSelectedTiers] = useState<string[]>([]);
  const [isFreePreview, setIsFreePreview] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [fileProgress, setFileProgress] = useState<number | null>(null);
  const [thumbProgress, setThumbProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch('/api/auth/me');
        const me = await meRes.json();
        const aid = me?.artist?.id;
        if (!aid) { setLoading(false); return; }
        setArtistId(aid);

        const [contentRes, tiersRes] = await Promise.all([
          fetch(`/api/creator/content?artistId=${aid}`),
          fetch('/api/creator/tiers'),
        ]);
        const contentData = contentRes.ok ? await contentRes.json() : { content: [] };
        const tiersData = tiersRes.ok ? await tiersRes.json() : { tiers: [] };
        setItems(contentData.content || []);
        setTiers(tiersData.tiers || []);
      } catch {}
      setLoading(false);
    })();
  }, []);

  function resetForm() {
    setTitle(''); setDescription(''); setContentType('text'); setBody('');
    setExternalUrl(''); setFileUrl(''); setThumbnailUrl('');
    setSelectedTiers([]); setIsFreePreview(false); setIsPublished(false);
    setError(''); setFileProgress(null); setThumbProgress(null);
  }

  function openCreate() { setEditing(null); resetForm(); setShowForm(true); }

  function openEdit(item: ContentItem) {
    setEditing(item);
    setTitle(item.title);
    setDescription(item.description || '');
    setContentType(item.contentType);
    setBody(item.body || '');
    setExternalUrl(item.externalUrl || '');
    setFileUrl(item.fileUrl || '');
    setThumbnailUrl(item.thumbnailUrl || '');
    setSelectedTiers(item.accessTierIds || []);
    setIsFreePreview(item.isFreePreview);
    setIsPublished(item.isPublished);
    setError('');
    setShowForm(true);
  }

  function closeForm() { setShowForm(false); setEditing(null); }

  async function pickAndUpload(file: File, kind: 'exclusiveContent' | 'exclusiveThumb', onProgress: (p: number | null) => void, setUrl: (u: string) => void) {
    onProgress(0);
    try {
      const initRes = await fetch('/api/dashboard/settings/upload-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, fileType: kind }),
      });
      if (!initRes.ok) { setError('Failed to prepare upload'); onProgress(null); return; }
      const { presignedUrl, publicUrl } = await initRes.json();
      await uploadToR2(presignedUrl, file, p => onProgress(p));
      setUrl(publicUrl);
    } catch {
      setError('Upload failed');
    }
    onProgress(null);
  }

  function toggleTier(id: string) {
    setSelectedTiers(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  }

  async function save() {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        contentType,
        body,
        externalUrl,
        fileUrl,
        thumbnailUrl,
        accessTierIds: selectedTiers,
        isFreePreview,
        isPublished,
      };
      let res: Response;
      if (editing) {
        res = await fetch('/api/creator/content', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentId: editing.id, ...payload }),
        });
      } else {
        res = await fetch('/api/creator/content', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      if (res.ok) {
        const d = await res.json();
        if (editing) setItems(prev => prev.map(i => i.id === editing.id ? d.content : i));
        else setItems(prev => [d.content, ...prev]);
        closeForm();
      } else {
        const d = await res.json();
        setError(d.error || 'Failed to save');
      }
    } catch {
      setError('Network error');
    }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm('Delete this content? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/creator/content?contentId=${id}`, { method: 'DELETE' });
      if (res.ok) setItems(prev => prev.filter(i => i.id !== id));
    } catch {}
  }

  return (
    <div className="p-6 md:p-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
            Exclusive Content
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Content only your paying members can access
          </p>
        </div>
        <button onClick={openCreate} className="btn btn-primary gap-2">
          <Plus size={15} /> New Content
        </button>
      </div>

      {tiers.length === 0 && (
        <div className="mb-6 p-4 rounded-xl text-sm" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          You haven't created any membership tiers yet — content can still be posted, but you'll want a tier to gate it behind. <a href="/dashboard/memberships" className="underline" style={{ color: 'var(--sky)' }}>Create one →</a>
        </div>
      )}

      {showForm && (
        <div className="card p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold" style={{ color: 'var(--text)' }}>{editing ? 'Edit Content' : 'New Exclusive Content'}</h3>
            <button onClick={closeForm} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>TITLE</label>
              <input className="input" placeholder="e.g. Unreleased demo, Behind the scenes video"
                value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>TYPE</label>
              <select className="input" value={contentType} onChange={e => setContentType(e.target.value)}>
                <option value="text">Text post</option>
                <option value="audio">Audio</option>
                <option value="video">Video</option>
                <option value="pdf">PDF</option>
                <option value="link">External link</option>
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>DESCRIPTION</label>
            <input className="input" placeholder="Short description"
              value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          {contentType === 'text' && (
            <div className="mb-4">
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>BODY</label>
              <textarea className="input resize-none" rows={5} placeholder="Write your post…"
                value={body} onChange={e => setBody(e.target.value)} />
            </div>
          )}

          {contentType === 'link' && (
            <div className="mb-4">
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>EXTERNAL URL</label>
              <input className="input" placeholder="https://…" value={externalUrl} onChange={e => setExternalUrl(e.target.value)} />
            </div>
          )}

          {(contentType === 'audio' || contentType === 'video' || contentType === 'pdf') && (
            <div className="mb-4">
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>FILE</label>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  {fileUrl ? 'Replace File' : 'Upload File'}
                </button>
                {fileUrl && !fileProgress && <span className="text-xs" style={{ color: 'var(--green)' }}>✓ Uploaded</span>}
                {fileProgress !== null && <span className="text-sm" style={{ color: 'var(--sky)' }}>Uploading {fileProgress}%…</span>}
              </div>
              <input ref={fileInputRef} type="file" accept={contentType === 'audio' ? 'audio/*' : contentType === 'video' ? 'video/*' : 'application/pdf'}
                className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) pickAndUpload(f, 'exclusiveContent', setFileProgress, setFileUrl); }} />
            </div>
          )}

          <div className="mb-4">
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>THUMBNAIL (optional)</label>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                {thumbnailUrl ? <img src={thumbnailUrl} className="w-full h-full object-cover" alt="" /> : <ImageIcon size={16} style={{ color: 'var(--text-muted)' }} />}
              </div>
              <button type="button" onClick={() => thumbInputRef.current?.click()}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                {thumbnailUrl ? 'Change' : 'Upload'}
              </button>
              {thumbProgress !== null && <span className="text-sm" style={{ color: 'var(--sky)' }}>Uploading {thumbProgress}%…</span>}
            </div>
            <input ref={thumbInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) pickAndUpload(f, 'exclusiveThumb', setThumbProgress, setThumbnailUrl); }} />
          </div>

          <div className="mb-4">
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>WHO CAN ACCESS</label>
            {tiers.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No tiers yet — this will be visible to all members once you create one.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tiers.map(t => (
                  <button key={t.id} type="button" onClick={() => toggleTier(t.id)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                    style={{
                      background: selectedTiers.includes(t.id) ? 'var(--sky)' : 'var(--surface2)',
                      color: selectedTiers.includes(t.id) ? 'white' : 'var(--text-muted)',
                      border: '1px solid var(--border)',
                    }}>
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-5 mb-5">
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={isFreePreview} onChange={e => setIsFreePreview(e.target.checked)} />
              Free preview (visible to everyone)
            </label>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={isPublished} onChange={e => setIsPublished(e.target.checked)} />
              Publish now
            </label>
          </div>

          {error && <p className="text-sm mb-3" style={{ color: 'var(--red)' }}>{error}</p>}

          <div className="flex gap-2 justify-end">
            <button onClick={closeForm} className="btn btn-secondary px-5">Cancel</button>
            <button onClick={save} disabled={saving} className="btn btn-primary gap-2 disabled:opacity-50">
              {saving ? <VukaLoader size={14} /> : <Check size={14} />}
              {editing ? 'Save Changes' : 'Create Content'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><VukaLoader size={24} /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Lock size={36} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
          <p className="font-bold mb-1" style={{ color: 'var(--text)' }}>No exclusive content yet</p>
          <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>Reward your paying members with something only they can see</p>
          <button onClick={openCreate} className="btn btn-primary gap-2"><Plus size={15} /> Create First Post</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => {
            const Icon = TYPE_ICON[item.contentType] || FileText;
            return (
              <div key={item.id} className="card p-5 flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon size={15} style={{ color: 'var(--text-muted)' }} />
                    <h3 className="font-bold" style={{ color: 'var(--text)' }}>{item.title}</h3>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-[var(--surface2)]" style={{ color: 'var(--text-muted)' }}><Edit2 size={14} /></button>
                    <button onClick={() => remove(item.id)} className="p-1.5 rounded-lg hover:bg-[var(--surface2)]" style={{ color: 'var(--text-muted)' }}><Trash2 size={14} /></button>
                  </div>
                </div>
                {item.description && <p className="text-sm mb-3 flex-1" style={{ color: 'var(--text-muted)' }}>{item.description}</p>}
                <div className="flex items-center gap-2 text-xs mt-2 pt-3" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  {item.isPublished ? (
                    <span className="flex items-center gap-1" style={{ color: 'var(--green)' }}><Unlock size={12} /> Published</span>
                  ) : (
                    <span className="flex items-center gap-1"><Lock size={12} /> Draft</span>
                  )}
                  {item.isFreePreview && <span>· Free preview</span>}
                  {!item.isFreePreview && <span>· {item.accessTierIds?.length || 0} tier{item.accessTierIds?.length !== 1 ? 's' : ''}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
