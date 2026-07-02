'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { CheckCircle2, Upload, Video, Music, Image as ImageIcon, X, AlertCircle, Plus, Trash2, Eye, Pencil, Check, AlertTriangle } from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

const GENRES = ['Afrobeats', 'Amapiano', 'Hip Hop', 'Trap', 'R&B', 'Drill', 'Gqom', 'House', 'Jazz', 'Gospel', 'Kwaito', 'Pop', 'Electronic'];

type UploadType = 'video' | 'sample';

function normalizeContentType(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith('.mp4')) return 'video/mp4';
  if (name.endsWith('.mov')) return 'video/quicktime';
  if (name.endsWith('.wav') || file.type === 'audio/x-wav') return 'audio/wav';
  if (name.endsWith('.mp3') || file.type === 'audio/mp3') return 'audio/mpeg';
  if (name.endsWith('.zip')) return 'application/zip';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  return file.type || 'application/octet-stream';
}

async function uploadToR2(presignedUrl: string, file: File, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', normalizeContentType(file));
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
}

export default function VideosPage() {
  const [tab, setTab] = useState<'list' | 'upload'>('list');
  const [uploadType, setUploadType] = useState<UploadType>('video');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});

  // Edit/delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', genre: '', price: '', bpm: '', keySignature: '', tags: '' });
  const [savingId, setSavingId] = useState<string | null>(null);

  // Video fields
  const [videoMeta, setVideoMeta] = useState({ title: '', description: '', genre: '', price: '0', tags: '' });
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);

  // Sample pack fields
  const [sampleMeta, setSampleMeta] = useState({ title: '', description: '', genre: '', price: '50', bpm: '', keySignature: '', tags: '' });
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [sampleArtwork, setSampleArtwork] = useState<File | null>(null);
  const [samplePreview, setSamplePreview] = useState<File | null>(null);

  const videoRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);
  const sampleRef = useRef<HTMLInputElement>(null);
  const artRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLInputElement>(null);

  const setFileProgress = useCallback((key: string, pct: number) => {
    setProgress(p => ({ ...p, [key]: pct }));
  }, []);

  useEffect(() => {
    // Load existing videos and samples
    Promise.all([
      fetch('/api/dashboard/videos').then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),
    ]).then(([vd]) => {
      setItems(vd.items || vd.videos || vd.samples || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function deleteItem(id: string, type: 'video' | 'sample') {
    setDeletingId(id);
    setConfirmDeleteId(null);
    const res = await fetch(`/api/dashboard/videos?itemId=${id}&type=${type}`, { method: 'DELETE' });
    if (res.ok) {
      setItems(prev => prev.filter(i => i.id !== id));
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.error || 'Could not delete this item.');
    }
    setDeletingId(null);
  }

  function startEdit(item: any) {
    setEditingId(item.id);
    setEditForm({
      title: item.title || '',
      description: item.description || '',
      genre: item.genre || '',
      price: String(item.price ?? ''),
      bpm: String(item.bpm ?? ''),
      keySignature: item.keySignature || '',
      tags: Array.isArray(item.tags) ? item.tags.join(', ') : (item.tags || ''),
    });
  }

  async function saveEdit(item: any) {
    setSavingId(item.id);
    const body: any = {
      itemId: item.id,
      type: item._type,
      title: editForm.title,
      description: editForm.description,
      genre: editForm.genre,
      price: editForm.price,
      tags: editForm.tags.split(',').map((t: string) => t.trim()).filter(Boolean),
    };
    if (item._type === 'sample') {
      body.bpm = editForm.bpm;
      body.keySignature = editForm.keySignature;
    }
    const res = await fetch('/api/dashboard/videos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === item.id ? {
        ...i,
        title: editForm.title,
        description: editForm.description,
        genre: editForm.genre,
        price: parseFloat(editForm.price) || 0,
        bpm: editForm.bpm ? parseInt(editForm.bpm) : i.bpm,
        keySignature: editForm.keySignature || i.keySignature,
        tags: editForm.tags.split(',').map((t: string) => t.trim()).filter(Boolean),
      } : i));
      setEditingId(null);
    }
    setSavingId(null);
  }

  async function handleVideoSubmit() {
    if (!videoMeta.title.trim()) { setError('Title is required'); return; }
    if (!videoFile) { setError('Video file is required'); return; }
    setUploading(true); setError('');

    try {
      const res = await fetch('/api/dashboard/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'video',
          title: videoMeta.title,
          description: videoMeta.description,
          genre: videoMeta.genre,
          price: parseFloat(videoMeta.price) || 0,
          tags: videoMeta.tags.split(',').map(t => t.trim()).filter(Boolean),
          videoType: normalizeContentType(videoFile),
          thumbType: thumbFile ? normalizeContentType(thumbFile) : 'image/jpeg',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create video record');

      const { item, uploadUrls, publicUrls } = data;

      if (thumbFile && uploadUrls.thumbnail) {
        await uploadToR2(uploadUrls.thumbnail, thumbFile, p => setFileProgress('thumb', p));
      }
      if (videoFile && uploadUrls.video) {
        await uploadToR2(uploadUrls.video, videoFile, p => setFileProgress('video', p));
      }

      await fetch('/api/dashboard/videos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: item.id,
          type: 'video',
          thumbnailUrl: publicUrls?.thumbnailUrl || '',
          videoUrl: publicUrls?.videoUrl || '',
        }),
      });

      setSuccess(true);
    } catch (e: any) {
      setError(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleSampleSubmit() {
    if (!sampleMeta.title.trim()) { setError('Title is required'); return; }
    if (!sampleFile) { setError('Sample pack file (.zip or .wav) is required'); return; }
    setUploading(true); setError('');

    try {
      const res = await fetch('/api/dashboard/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'sample',
          title: sampleMeta.title,
          description: sampleMeta.description,
          genre: sampleMeta.genre,
          price: parseFloat(sampleMeta.price) || 0,
          bpm: parseInt(sampleMeta.bpm) || 0,
          keySignature: sampleMeta.keySignature,
          tags: sampleMeta.tags.split(',').map(t => t.trim()).filter(Boolean),
          fileType: normalizeContentType(sampleFile),
          artworkType: sampleArtwork ? normalizeContentType(sampleArtwork) : 'image/jpeg',
          previewType: samplePreview ? normalizeContentType(samplePreview) : 'audio/mpeg',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create sample record');

      const { item, uploadUrls, publicUrls } = data;

      if (sampleArtwork && uploadUrls.artwork) {
        await uploadToR2(uploadUrls.artwork, sampleArtwork, p => setFileProgress('artwork', p));
      }
      if (samplePreview && uploadUrls.preview) {
        await uploadToR2(uploadUrls.preview, samplePreview, p => setFileProgress('preview', p));
      }
      if (sampleFile && uploadUrls.file) {
        await uploadToR2(uploadUrls.file, sampleFile, p => setFileProgress('file', p));
      }

      await fetch('/api/dashboard/videos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: item.id,
          type: 'sample',
          artworkUrl: publicUrls?.artworkUrl || '',
          previewUrl: publicUrls?.previewUrl || '',
          fileUrl: publicUrls?.fileUrl || '',
        }),
      });

      setSuccess(true);
    } catch (e: any) {
      setError(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  if (success) return (
    <div className="p-6 md:p-12 flex flex-col items-center justify-center min-h-[70vh] text-center">
      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
        style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}>
        <CheckCircle2 size={40} style={{ color: 'var(--green)' }} />
      </div>
      <h2 className="text-3xl font-bold mb-3" style={{ color: 'var(--text)' }}>
        {uploadType === 'video' ? 'Video live!' : 'Sample pack live!'}
      </h2>
      <p className="mb-8 text-lg" style={{ color: 'var(--text-muted)' }}>
        Your {uploadType === 'video' ? 'video' : 'sample pack'} is now on Vuka Music.
      </p>
      <div className="flex gap-4">
        <button onClick={() => { setSuccess(false); setTab('list'); }}
          className="px-6 py-3 rounded-xl font-semibold" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          View all
        </button>
        <button onClick={() => { setSuccess(false); setError(''); setVideoFile(null); setThumbFile(null); setSampleFile(null); setSampleArtwork(null); setSamplePreview(null); setVideoMeta({ title: '', description: '', genre: '', price: '0', tags: '' }); setSampleMeta({ title: '', description: '', genre: '', price: '50', bpm: '', keySignature: '', tags: '' }); }}
          className="px-6 py-3 rounded-xl font-semibold text-white" style={{ background: 'var(--sky)' }}>
          Upload another
        </button>
      </div>
    </div>
  );

  const totalFiles = Object.values(progress).length;
  const avgProgress = totalFiles > 0 ? Math.round(Object.values(progress).reduce((a: number, b: number) => a + b, 0) / totalFiles) : 0;

  return (
    <div className="p-6 md:p-10 max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>Videos & Samples</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Upload music videos and sample packs for sale</p>
        </div>
        {tab === 'list' && (
          <button onClick={() => setTab('upload')} className="btn btn-primary gap-2">
            <Plus size={16} /> Upload New
          </button>
        )}
      </div>

      {tab === 'list' ? (
        loading ? (
          <div className="flex justify-center py-20">
            <VukaLoader size={24} />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <Video size={36} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
            <p className="font-bold mb-1" style={{ color: 'var(--text)' }}>No videos or samples yet</p>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Upload music videos and sample packs to sell on your page.</p>
            <button onClick={() => setTab('upload')} className="btn btn-primary">
              <Plus size={15} /> Upload First Item
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {items.map(item => {
              const isVideo = item._type === 'video';
              if (editingId === item.id) {
                return (
                  <div key={item.id} className="rounded-2xl p-5 col-span-1 sm:col-span-2"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
                      Editing — {isVideo ? 'Music Video' : 'Sample Pack'}
                    </p>
                    <div className="space-y-3">
                      <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg text-sm"
                        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                        placeholder="Title" />
                      <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg text-sm h-16 resize-none"
                        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                        placeholder="Description" />
                      <div className="grid grid-cols-2 gap-3">
                        <select value={editForm.genre} onChange={e => setEditForm(f => ({ ...f, genre: e.target.value }))}
                          className="px-3 py-2 rounded-lg text-sm"
                          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                          <option value="">Genre…</option>
                          {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <input type="number" value={editForm.price} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))}
                          className="px-3 py-2 rounded-lg text-sm"
                          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                          placeholder="Price (ZAR)" />
                      </div>
                      {!isVideo && (
                        <div className="grid grid-cols-2 gap-3">
                          <input type="number" value={editForm.bpm} onChange={e => setEditForm(f => ({ ...f, bpm: e.target.value }))}
                            className="px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                            placeholder="BPM" />
                          <input value={editForm.keySignature} onChange={e => setEditForm(f => ({ ...f, keySignature: e.target.value }))}
                            className="px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                            placeholder="Key (e.g. C min)" />
                        </div>
                      )}
                      <input value={editForm.tags} onChange={e => setEditForm(f => ({ ...f, tags: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg text-sm"
                        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                        placeholder="Tags (comma separated)" />
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => saveEdit(item)} disabled={!!savingId}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-sm text-white"
                          style={{ background: 'var(--sky)' }}>
                          <Check size={13} /> {savingId === item.id ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => setEditingId(null)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm"
                          style={{ color: 'var(--text-muted)' }}>
                          <X size={13} /> Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div key={item.id} className="rounded-2xl overflow-hidden"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', opacity: deletingId === item.id ? 0.5 : 1 }}>
                  <div className="aspect-video flex items-center justify-center relative overflow-hidden"
                    style={{ background: 'var(--surface2)' }}>
                    {item.thumbnailUrl || item.artworkUrl
                      ? <img src={item.thumbnailUrl || item.artworkUrl} alt={item.title} className="w-full h-full object-cover" />
                      : <Video size={32} style={{ color: 'var(--text-muted)' }} />}
                    <span className="absolute top-2 left-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}>
                      {isVideo ? 'Video' : 'Sample'}
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-bold truncate flex-1" style={{ color: 'var(--text)' }}>{item.title}</p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => startEdit(item)} title="Edit"
                          className="p-1.5 rounded-lg hover:opacity-80" style={{ color: 'var(--text-muted)' }}>
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setConfirmDeleteId(item.id)} title="Delete"
                          className="p-1.5 rounded-lg hover:opacity-80" style={{ color: '#ef4444' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span style={{ color: 'var(--green)' }}>{item.price === 0 ? 'Free' : `R${item.price}`}</span>
                      {item.genre && <span style={{ color: 'var(--text-muted)' }}>{item.genre}</span>}
                      {!isVideo && item.bpm ? <span style={{ color: 'var(--text-muted)' }}>{item.bpm} BPM</span> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div>
          {/* Type picker */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            {(['video', 'sample'] as const).map(t => (
              <button key={t} onClick={() => setUploadType(t)}
                className="p-6 rounded-2xl text-left"
                style={{
                  background: uploadType === t ? 'var(--surface2)' : 'var(--surface)',
                  border: `2px solid ${uploadType === t ? 'var(--sky)' : 'var(--border)'}`,
                }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: uploadType === t ? 'rgba(56,182,232,0.2)' : 'var(--surface2)' }}>
                  {t === 'video' ? <Video size={20} style={{ color: uploadType === t ? 'var(--sky)' : 'var(--text-muted)' }} />
                    : <Music size={20} style={{ color: uploadType === t ? 'var(--sky)' : 'var(--text-muted)' }} />}
                </div>
                <div className="font-semibold capitalize mb-1" style={{ color: 'var(--text)' }}>
                  {t === 'video' ? 'Music Video' : 'Sample Pack'}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {t === 'video' ? 'MP4/MOV, sell or share free' : 'ZIP, WAV bundle for producers'}
                </div>
              </button>
            ))}
          </div>

          {uploadType === 'video' ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Music Video Details</h2>

              <FileBtn label="Video File *" sublabel="MP4 or MOV" icon={<Video size={16} />}
                file={videoFile} inputRef={videoRef} accept="video/mp4,video/quicktime,video/*"
                onFile={setVideoFile} />

              <FileBtn label="Thumbnail" sublabel="JPG or PNG, 16:9 recommended" icon={<ImageIcon size={16} />}
                file={thumbFile} inputRef={thumbRef} accept="image/*"
                onFile={setThumbFile} />

              <Field label="Title *" value={videoMeta.title} onChange={v => setVideoMeta(p => ({ ...p, title: v }))} placeholder="e.g. In My Zone — Official Video" />
              <Field label="Description" value={videoMeta.description} onChange={v => setVideoMeta(p => ({ ...p, description: v }))} placeholder="Short description…" />

              <div className="grid grid-cols-2 gap-4">
                <SelectField label="Genre" value={videoMeta.genre} onChange={v => setVideoMeta(p => ({ ...p, genre: v }))} options={GENRES} />
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Price (ZAR)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>R</span>
                    <input type="number" min="0" value={videoMeta.price} onChange={e => setVideoMeta(p => ({ ...p, price: e.target.value }))}
                      placeholder="0 = free" className="input w-full pl-7" />
                  </div>
                </div>
              </div>
              <Field label="Tags" value={videoMeta.tags} onChange={v => setVideoMeta(p => ({ ...p, tags: v }))} placeholder="amapiano, music video (comma separated)" />
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Sample Pack Details</h2>

              <FileBtn label="Sample Pack File *" sublabel=".zip archive or .wav file" icon={<Music size={16} />}
                file={sampleFile} inputRef={sampleRef} accept=".zip,audio/wav,audio/mpeg"
                onFile={setSampleFile} />

              <FileBtn label="Cover Artwork" sublabel="JPG or PNG, 1:1 recommended" icon={<ImageIcon size={16} />}
                file={sampleArtwork} inputRef={artRef} accept="image/*"
                onFile={setSampleArtwork} />

              <FileBtn label="Preview Clip" sublabel="30s MP3 preview for buyers" icon={<Music size={16} />}
                file={samplePreview} inputRef={previewRef} accept="audio/mpeg,audio/mp3"
                onFile={setSamplePreview} />

              <Field label="Title *" value={sampleMeta.title} onChange={v => setSampleMeta(p => ({ ...p, title: v }))} placeholder="e.g. Amapiano Chord Pack Vol.1" />
              <Field label="Description" value={sampleMeta.description} onChange={v => setSampleMeta(p => ({ ...p, description: v }))} placeholder="What's included in this pack…" />

              <div className="grid grid-cols-3 gap-4">
                <SelectField label="Genre" value={sampleMeta.genre} onChange={v => setSampleMeta(p => ({ ...p, genre: v }))} options={GENRES} />
                <Field label="BPM" value={sampleMeta.bpm} onChange={v => setSampleMeta(p => ({ ...p, bpm: v }))} placeholder="e.g. 113" type="number" />
                <Field label="Key" value={sampleMeta.keySignature} onChange={v => setSampleMeta(p => ({ ...p, keySignature: v }))} placeholder="e.g. C min" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Price (ZAR) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>R</span>
                    <input type="number" min="0" value={sampleMeta.price} onChange={e => setSampleMeta(p => ({ ...p, price: e.target.value }))}
                      className="input w-full pl-7" />
                  </div>
                </div>
                <Field label="Tags" value={sampleMeta.tags} onChange={v => setSampleMeta(p => ({ ...p, tags: v }))} placeholder="one shots, loops (comma sep)" />
              </div>
            </div>
          )}

          {uploading && (
            <div className="mt-4 p-4 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Uploading to secure storage…</span>
                <span className="text-sm font-bold" style={{ color: 'var(--sky)' }}>{avgProgress}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${avgProgress}%`, background: 'var(--sky)' }} />
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 p-3 rounded-xl text-sm"
              style={{ background: 'rgba(232,64,64,0.1)', border: '1px solid rgba(232,64,64,0.3)', color: '#f87171' }}>
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <button onClick={() => { setTab('list'); setError(''); }}
              className="px-6 py-3 rounded-xl font-semibold"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              ← Back
            </button>
            <button
              onClick={uploadType === 'video' ? handleVideoSubmit : handleSampleSubmit}
              disabled={uploading}
              className="flex-1 py-3 rounded-xl font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: 'var(--sky)' }}>
              {uploading ? <><VukaLoader size={16} />Uploading…</> : <><Upload size={16} />Publish {uploadType === 'video' ? 'Video' : 'Sample Pack'}</>}
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDeleteId && (() => {
        const item = items.find(i => i.id === confirmDeleteId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(239,68,68,0.1)' }}>
                  <AlertTriangle size={18} style={{ color: '#ef4444' }} />
                </div>
                <div>
                  <p className="font-bold" style={{ color: 'var(--text)' }}>Delete "{item?.title}"?</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>This cannot be undone.</p>
                </div>
              </div>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                Items with confirmed sales cannot be deleted — hide them instead.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm"
                  style={{ background: 'var(--surface2)', color: 'var(--text)' }}>
                  Cancel
                </button>
                <button onClick={() => item && deleteItem(item.id, item._type)}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white"
                  style={{ background: '#ef4444' }}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function FileBtn({ label, sublabel, accept, onFile, file, inputRef, icon }: {
  label: string; sublabel?: string; accept: string; onFile: (f: File) => void;
  file: File | null; inputRef: React.RefObject<HTMLInputElement>; icon?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</label>
        {sublabel && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{sublabel}</span>}
      </div>
      <button type="button" onClick={() => inputRef.current?.click()}
        className="w-full py-4 rounded-xl border-2 border-dashed text-center transition-all flex items-center justify-center gap-2"
        style={{ borderColor: file ? 'var(--green)' : 'var(--border)', background: file ? 'rgba(16,185,129,0.05)' : 'transparent' }}>
        <span style={{ color: file ? 'var(--green)' : 'var(--text-muted)' }}>{icon}</span>
        {file
          ? <span className="text-sm font-medium" style={{ color: 'var(--green)' }}>✓ {file.name}</span>
          : <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Click to choose file</span>}
      </button>
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="input w-full" />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="input w-full">
        <option value="">Select…</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
