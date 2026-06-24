'use client';
import { useState, useRef, useEffect } from 'react';
import {
  Loader2, Plus, Package, Pencil, Trash2, Check, X,
  Image as ImageIcon, AlertCircle, Eye, EyeOff, ShoppingBag,
} from 'lucide-react';

const SIZES_PRESETS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size'];

async function uploadToR2(presignedUrl: string, file: File, onProgress?: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    if (onProgress) {
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror  = () => reject(new Error('Network error'));
    xhr.send(file);
  });
}

interface MerchItem {
  id: string;
  title: string;
  description: string;
  price: number;
  stock: number;
  sizes: string[];
  imageUrl: string;
  isActive: boolean;
  slug: string;
  createdAt: string;
}

export default function DashboardMerchPage() {
  const [items, setItems]         = useState<MerchItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState<MerchItem | null>(null);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [imgProgress, setImgProgress] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Form state
  const [title, setTitle]           = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice]           = useState('');
  const [stock, setStock]           = useState('');
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [imageFile, setImageFile]   = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const imgInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/dashboard/merch')
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => { setItems(d.items || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function openCreate() {
    setEditing(null);
    setTitle(''); setDescription(''); setPrice(''); setStock('');
    setSelectedSizes([]); setImageFile(null); setImagePreview('');
    setError(''); setSuccess('');
    setShowForm(true);
  }

  function openEdit(item: MerchItem) {
    setEditing(item);
    setTitle(item.title);
    setDescription(item.description || '');
    setPrice(String(item.price));
    setStock(String(item.stock));
    setSelectedSizes(item.sizes || []);
    setImagePreview(item.imageUrl || '');
    setImageFile(null);
    setError(''); setSuccess('');
    setShowForm(true);
  }

  function closeForm() { setShowForm(false); setEditing(null); }

  function toggleSize(s: string) {
    setSelectedSizes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }

  function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    if (!title.trim()) { setError('Title is required'); return; }
    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice < 0) { setError('Enter a valid price'); return; }
    const numStock = parseInt(stock);
    if (isNaN(numStock) || numStock < 0) { setError('Enter a valid stock quantity'); return; }

    setSaving(true); setError('');

    try {
      if (editing) {
        // PATCH existing
        const payload: any = { id: editing.id, title: title.trim(), description, price: numPrice, stock: numStock, sizes: selectedSizes };
        if (imageFile) {
          // Get a new upload URL for the image
          const initRes = await fetch('/api/dashboard/merch', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editing.id, getImageUploadUrl: true, imageMime: imageFile.type }),
          });
          if (initRes.ok) {
            const initData = await initRes.json();
            if (initData.imageUploadUrl) {
              await uploadToR2(initData.imageUploadUrl, imageFile, p => setImgProgress(p));
              setImgProgress(null);
              payload.imageUrl = initData.imagePublicUrl;
            }
          }
        }
        const res = await fetch('/api/dashboard/merch', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Update failed'); setSaving(false); return; }
        setItems(prev => prev.map(i => i.id === editing.id ? data.item : i));
        setSuccess('Item updated');
      } else {
        // POST create
        const res = await fetch('/api/dashboard/merch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(), description, price: numPrice, stock: numStock,
            sizes: selectedSizes,
            imageMime: imageFile?.type || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Create failed'); setSaving(false); return; }

        // Upload image if selected
        if (imageFile && data.imageUploadUrl) {
          await uploadToR2(data.imageUploadUrl, imageFile, p => setImgProgress(p));
          setImgProgress(null);
          // Mark active after image upload
          const activateRes = await fetch('/api/dashboard/merch', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: data.item.id, isActive: true }),
          });
          if (activateRes.ok) {
            const activateData = await activateRes.json();
            setItems(prev => [activateData.item, ...prev]);
          } else {
            setItems(prev => [data.item, ...prev]);
          }
        } else {
          setItems(prev => [data.item, ...prev]);
        }
        setSuccess('Item created');
      }
      closeForm();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    }
    setSaving(false);
  }

  async function toggleActive(item: MerchItem) {
    const res = await fetch('/api/dashboard/merch', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, isActive: !item.isActive }),
    });
    if (res.ok) {
      const data = await res.json();
      setItems(prev => prev.map(i => i.id === item.id ? data.item : i));
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/dashboard/merch?id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Delete failed'); setConfirmDeleteId(null); return; }
    setItems(prev => prev.filter(i => i.id !== id));
    setConfirmDeleteId(null);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin" style={{ color: 'var(--sky)' }} />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
            Merch
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Create and manage your physical products</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-white text-sm"
          style={{ background: 'var(--sky)' }}>
          <Plus size={16} /> Add Item
        </button>
      </div>

      {success && (
        <div className="mb-4 p-3 rounded-xl flex items-center gap-2 text-sm"
          style={{ background: 'rgba(160,232,124,0.1)', border: '1px solid rgba(160,232,124,0.3)', color: 'var(--green)' }}>
          <Check size={14} /> {success}
        </div>
      )}
      {error && !showForm && (
        <div className="mb-4 p-3 rounded-xl flex items-center gap-2 text-sm"
          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--gold)' }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-lg rounded-2xl p-6 space-y-4 overflow-y-auto max-h-[90vh]"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg" style={{ color: 'var(--text)' }}>
                {editing ? 'Edit Item' : 'New Merch Item'}
              </h2>
              <button onClick={closeForm} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>

            {error && (
              <div className="p-3 rounded-xl flex items-center gap-2 text-sm"
                style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--gold)' }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}

            {/* Image upload */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>Image</label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  {imagePreview
                    ? <img src={imagePreview} className="w-full h-full object-cover" alt="" />
                    : <ImageIcon size={24} style={{ color: 'var(--text-muted)' }} />}
                </div>
                <button type="button" onClick={() => imgInputRef.current?.click()}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  {imagePreview ? 'Change Image' : 'Upload Image'}
                </button>
                {imgProgress !== null && (
                  <span className="text-sm" style={{ color: 'var(--sky)' }}>Uploading {imgProgress}%…</span>
                )}
              </div>
              <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>Title *</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Vuka Classic Tee"
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                rows={3} placeholder="What is this? Material, colour, etc."
                className="w-full px-3 py-2 rounded-xl text-sm resize-none"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>

            {/* Price + Stock */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>Price (ZAR) *</label>
                <input value={price} onChange={e => setPrice(e.target.value)}
                  type="number" min="0" step="0.01" placeholder="250"
                  className="w-full px-3 py-2 rounded-xl text-sm"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>Stock Quantity *</label>
                <input value={stock} onChange={e => setStock(e.target.value)}
                  type="number" min="0" placeholder="10"
                  className="w-full px-3 py-2 rounded-xl text-sm"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
            </div>

            {/* Sizes */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>
                Sizes <span className="font-normal" style={{ color: 'var(--text-muted)' }}>(select all that apply; leave empty if not applicable)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {SIZES_PRESETS.map(s => (
                  <button key={s} type="button" onClick={() => toggleSize(s)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                    style={{
                      background: selectedSizes.includes(s) ? 'var(--sky)' : 'var(--surface2)',
                      color: selectedSizes.includes(s) ? 'white' : 'var(--text)',
                      border: `1px solid ${selectedSizes.includes(s) ? 'var(--sky)' : 'var(--border)'}`,
                    }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-60"
                style={{ background: 'var(--sky)' }}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Item'}
              </button>
              <button onClick={closeForm} className="px-4 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Items list */}
      {items.length === 0 ? (
        <div className="text-center py-20 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Package size={48} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
          <h3 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>No merch yet</h3>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            Create your first merch item — t-shirts, hoodies, hats, you name it
          </p>
          <button onClick={openCreate}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white"
            style={{ background: 'var(--sky)' }}>
            <Plus size={15} /> Add First Item
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className="rounded-2xl p-4 flex items-center gap-4"
              style={{
                background: 'var(--surface)',
                border: `1px solid ${item.isActive ? 'var(--border)' : 'rgba(245,158,11,0.3)'}`,
                opacity: item.isActive ? 1 : 0.7,
              }}>
              {/* Image */}
              <div className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--surface2)' }}>
                {item.imageUrl
                  ? <img src={item.imageUrl} className="w-full h-full object-cover" alt={item.title} />
                  : <Package size={22} style={{ color: 'var(--text-muted)' }} />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{item.title}</p>
                  {!item.isActive && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--gold)' }}>
                      Hidden
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  R{item.price} · {item.stock} in stock
                  {item.sizes?.length > 0 && ` · ${item.sizes.join(', ')}`}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <a href={`/merch/${item.slug}`} target="_blank" rel="noopener noreferrer"
                  title="Preview public page"
                  className="p-2 rounded-lg transition-colors hover:bg-[var(--surface2)]"
                  style={{ color: 'var(--text-muted)' }}>
                  <ShoppingBag size={15} />
                </a>
                <button onClick={() => toggleActive(item)} title={item.isActive ? 'Hide from store' : 'Show in store'}
                  className="p-2 rounded-lg transition-colors hover:bg-[var(--surface2)]"
                  style={{ color: item.isActive ? 'var(--green)' : 'var(--text-muted)' }}>
                  {item.isActive ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
                <button onClick={() => openEdit(item)} title="Edit"
                  className="p-2 rounded-lg transition-colors hover:bg-[var(--surface2)]"
                  style={{ color: 'var(--sky)' }}>
                  <Pencil size={15} />
                </button>
                {confirmDeleteId === item.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Delete?</span>
                    <button onClick={() => handleDelete(item.id)}
                      className="px-2 py-1 rounded text-xs font-bold"
                      style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                      Yes
                    </button>
                    <button onClick={() => setConfirmDeleteId(null)}
                      className="px-2 py-1 rounded text-xs"
                      style={{ color: 'var(--text-muted)' }}>
                      No
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDeleteId(item.id)} title="Delete"
                    className="p-2 rounded-lg transition-colors hover:bg-[var(--surface2)]"
                    style={{ color: 'var(--text-muted)' }}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
