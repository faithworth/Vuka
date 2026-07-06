'use client';
// ============================================================
// VUKA — Edit Release
// /dashboard/releases/[id]/edit
// Re-upload audio per track, edit basic metadata, and control
// whether the release is published. Backed by /api/releases/[id]
// (the direct-sales Release model — Vuka Music has no DSP distribution).
// ============================================================

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Upload, CheckCircle, AlertCircle, Save, Eye, EyeOff, Trash2,
} from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

interface TrackState {
  id: string;
  title: string;
  trackNumber: number;
  fullUrl: string;
  uploading: boolean;
  uploaded: boolean;
  uploadProgress: number;
  newAudioUrl: string | null;
  saving: boolean;
  saved: boolean;
  error: string;
}

function normalizeContentType(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith('.wav'))  return 'audio/wav';
  if (name.endsWith('.mp3'))  return 'audio/mpeg';
  if (name.endsWith('.flac')) return 'audio/flac';
  return file.type || 'application/octet-stream';
}

async function uploadToR2(presignedUrl: string, file: File, onProgress?: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', normalizeContentType(file));
    if (onProgress) {
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload  = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.send(file);
  });
}

export default function EditReleasePage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [release, setRelease] = useState<any>(null);
  const [tracks, setTracks]   = useState<TrackState[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [togglingActive, setTogglingActive] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Pricing — editable after publish. This was previously impossible from
  // the UI at all: once a release went live, price/minPrice/payWhatWant
  // could only be fixed by hand in the database.
  const [priceInput, setPriceInput]       = useState('');
  const [minPriceInput, setMinPriceInput] = useState('');
  const [payWhatWant, setPayWhatWant]     = useState(false);
  const [savingPrice, setSavingPrice]     = useState(false);
  const [priceSaved, setPriceSaved]       = useState(false);
  const [priceError, setPriceError]       = useState('');

  // Load release + tracks
  useEffect(() => {
    if (!id) return;
    fetch(`/api/releases/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(({ release: rel }) => {
        setRelease(rel);
        setPriceInput(String(rel.price ?? 0));
        setMinPriceInput(String(rel.minPrice ?? 0));
        setPayWhatWant(!!rel.payWhatWant);
        setTracks((rel.tracks || []).map((t: any) => ({
          id:           t.id,
          title:        t.title,
          trackNumber:  t.trackNumber,
          fullUrl:      t.fullUrl ?? '',
          uploading:    false,
          uploaded:     false,
          uploadProgress: 0,
          newAudioUrl:  null,
          saving:       false,
          saved:        false,
          error:        '',
        })));
      })
      .catch(() => setPageError('Could not load release. Make sure this release belongs to your account.'))
      .finally(() => setLoading(false));
  }, [id]);

  function updateTrack(trackId: string, patch: Partial<TrackState>) {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, ...patch } : t));
  }

  async function handleAudioSelect(trackId: string, file: File) {
    updateTrack(trackId, { uploading: true, uploadProgress: 0, error: '', uploaded: false, newAudioUrl: null });
    try {
      const res = await fetch('/api/dashboard/settings/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: normalizeContentType(file), fileType: 'audio' }),
      });
      if (!res.ok) throw new Error('Could not get upload URL');
      const { presignedUrl, publicUrl } = await res.json();
      await uploadToR2(presignedUrl, file, pct => updateTrack(trackId, { uploadProgress: pct }));
      updateTrack(trackId, { uploading: false, uploaded: true, uploadProgress: 100, newAudioUrl: publicUrl });
    } catch (e: any) {
      updateTrack(trackId, { uploading: false, error: e.message || 'Upload failed' });
    }
  }

  async function saveTrack(trackId: string) {
    const track = tracks.find(t => t.id === trackId);
    if (!track?.newAudioUrl) return;
    updateTrack(trackId, { saving: true, error: '' });
    try {
      const res = await fetch(`/api/releases/upload`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          releaseId: id,
          trackUpdates: { [trackId]: { previewUrl: track.newAudioUrl, fullUrl: track.newAudioUrl } },
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Save failed');
      }
      updateTrack(trackId, { saving: false, saved: true, fullUrl: track.newAudioUrl });
    } catch (e: any) {
      updateTrack(trackId, { saving: false, error: e.message || 'Save failed' });
    }
  }

  async function saveAll() {
    const pending = tracks.filter(t => t.newAudioUrl && !t.saved);
    await Promise.all(pending.map(t => saveTrack(t.id)));
  }

  async function savePricing() {
    setSavingPrice(true); setPriceError(''); setPriceSaved(false);
    try {
      const res = await fetch(`/api/dashboard/releases`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          releaseId: id,
          payWhatWant,
          price: payWhatWant ? 0 : (parseFloat(priceInput) || 0),
          minPrice: payWhatWant ? (parseFloat(minPriceInput) || 0) : 0,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Could not update pricing');
      }
      const { release: updated } = await res.json();
      setRelease(updated);
      setPriceSaved(true);
      setTimeout(() => setPriceSaved(false), 3000);
    } catch (e: any) {
      setPriceError(e.message || 'Could not update pricing');
    } finally {
      setSavingPrice(false);
    }
  }

  async function togglePublished() {
    if (!release) return;
    setTogglingActive(true);
    try {
      const res = await fetch(`/api/dashboard/releases`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ releaseId: id, isActive: !release.isActive }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Could not update release');
      }
      const { release: updated } = await res.json();
      setRelease(updated);
    } catch (e: any) {
      setPageError(e.message || 'Could not update release');
    } finally {
      setTogglingActive(false);
    }
  }

  async function handleDelete() {
    if (!release) return;
    if (!confirm(`Delete "${release.title}" permanently? This can't be undone.`)) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/dashboard/releases?releaseId=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Delete failed');
      }
      router.push('/dashboard/releases');
    } catch (e: any) {
      setDeleteError(e.message || 'Delete failed');
      setDeleting(false);
    }
  }

  const anyPending = tracks.some(t => t.newAudioUrl && !t.saved);
  const allSaved   = tracks.every(t => t.saved || !t.newAudioUrl);

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
        <VukaLoader size={18} /> Loading release…
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="p-6">
        <div className="p-4 rounded-xl text-sm flex items-center gap-2"
          style={{ background: 'rgba(255,77,77,0.08)', color: '#ff4d4d', border: '1px solid rgba(255,77,77,0.2)' }}>
          <AlertCircle size={14} /> {pageError}
        </div>
        <Link href="/dashboard/releases" className="mt-4 inline-flex items-center gap-2 text-sm"
          style={{ color: 'var(--sky)' }}>
          <ArrowLeft size={14} /> Back to Releases
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/releases"
          className="p-2 rounded-lg transition-colors hover:bg-[var(--surface2)]"
          style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black truncate" style={{ color: 'var(--text)' }}>
            Edit Release
          </h1>
          {release && (
            <p className="text-sm truncate flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
              {release.title}
              <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                style={{
                  background: release.isActive ? 'rgba(160,232,124,0.12)' : 'rgba(255,77,77,0.1)',
                  color: release.isActive ? 'var(--green)' : '#ff4d4d',
                }}>
                {release.isActive ? 'LIVE' : 'UNPUBLISHED'}
              </span>
            </p>
          )}
        </div>
        {anyPending && (
          <button onClick={saveAll}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold"
            style={{ background: 'var(--green)', color: '#0a0a0a' }}>
            <Save size={14} /> Save All
          </button>
        )}
      </div>

      {/* Publish controls */}
      {release && (
        <div className="flex items-center justify-between p-4 rounded-xl mb-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>
              {release.isActive ? 'Visible in your store' : 'Hidden from your store'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {release.isActive
                ? 'Fans can find and buy this release right now.'
                : 'Republish when you\'re ready — existing buyers keep their downloads either way.'}
            </p>
          </div>
          <button onClick={togglePublished} disabled={togglingActive}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold flex-shrink-0 disabled:opacity-60"
            style={{
              background: release.isActive ? 'rgba(255,77,77,0.1)' : 'var(--green)',
              color: release.isActive ? '#ff4d4d' : '#0a0a0a',
            }}>
            {togglingActive ? <VukaLoader size={14} /> : release.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
            {release.isActive ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      )}

      {/* Pricing controls */}
      {release && (
        <div className="p-4 rounded-xl mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Pricing</p>

          <label className="flex items-center gap-2 cursor-pointer mb-3">
            <input type="checkbox" checked={payWhatWant}
              onChange={e => setPayWhatWant(e.target.checked)}
              className="rounded" />
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Pay What You Want (fans choose their own price)
            </span>
          </label>

          {!payWhatWant ? (
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Price (ZAR) — set to 0 for a free download
              </label>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg" style={{ color: 'var(--gold)' }}>R</span>
                <input
                  type="number" min="0" step="1"
                  value={priceInput}
                  onChange={e => setPriceInput(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Minimum price (ZAR) — fans can pay more
              </label>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg" style={{ color: 'var(--gold)' }}>R</span>
                <input
                  type="number" min="0" step="1"
                  value={minPriceInput}
                  onChange={e => setMinPriceInput(e.target.value)}
                  placeholder="e.g. 20"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>Set to 0 to make it free with an option to tip.</p>
            </div>
          )}

          {priceError && (
            <div className="flex items-center gap-2 mt-3 text-sm" style={{ color: '#ff4d4d' }}>
              <AlertCircle size={14} /> {priceError}
            </div>
          )}

          <button onClick={savePricing} disabled={savingPrice}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold mt-4 disabled:opacity-60"
            style={{ background: 'var(--green)', color: '#0a0a0a' }}>
            {savingPrice ? <VukaLoader size={14} /> : priceSaved ? <CheckCircle size={14} /> : <Save size={14} />}
            {priceSaved ? 'Saved' : 'Save Pricing'}
          </button>
        </div>
      )}

      <div className="p-4 rounded-xl text-sm mb-6"
        style={{ background: 'rgba(56,182,232,0.06)', border: '1px solid rgba(56,182,232,0.2)', color: 'var(--text-muted)' }}>
        Upload new audio for each track below. Click <strong style={{ color: 'var(--text)' }}>Save</strong> per track (or <strong style={{ color: 'var(--text)' }}>Save All</strong>) once uploaded. The new file replaces the live one immediately.
      </div>

      {tracks.length === 0 && (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--text-muted)' }}>
          No tracks found for this release.
        </p>
      )}

      <div className="space-y-3">
        {tracks.map(track => (
          <div key={track.id} className="rounded-xl border p-4"
            style={{ background: 'var(--surface)', borderColor: track.saved ? 'rgba(160,232,124,0.4)' : 'var(--border)' }}>

            {/* Track header */}
            <div className="flex items-center gap-3 mb-3">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                {track.trackNumber}
              </span>
              <span className="font-semibold flex-1 truncate text-sm" style={{ color: 'var(--text)' }}>
                {track.title}
              </span>
              {track.saved && (
                <span className="flex items-center gap-1 text-xs font-medium"
                  style={{ color: 'var(--green)' }}>
                  <CheckCircle size={13} /> Saved
                </span>
              )}
            </div>

            {/* Current URL (dim) */}
            {track.fullUrl && !track.saved && (
              <p className="text-xs mb-3 truncate font-mono px-2 py-1.5 rounded-lg"
                style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Current: {track.fullUrl || '(none — needs upload)'}
              </p>
            )}
            {track.saved && track.fullUrl && (
              <p className="text-xs mb-3 truncate font-mono px-2 py-1.5 rounded-lg"
                style={{ background: 'rgba(160,232,124,0.06)', color: 'var(--green)', border: '1px solid rgba(160,232,124,0.2)' }}>
                ✓ {track.fullUrl}
              </p>
            )}

            {/* Upload row */}
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <input
                  id={`audio-${track.id}`}
                  type="file"
                  accept="audio/*,.mp3,.wav,.flac,.aac"
                  className="hidden"
                  disabled={track.uploading || track.saving}
                  onChange={e => e.target.files?.[0] && handleAudioSelect(track.id, e.target.files[0])}
                />
                <label htmlFor={`audio-${track.id}`}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-all w-full"
                  style={{
                    background: track.uploaded ? 'rgba(160,232,124,0.08)' : 'var(--bg)',
                    border: `1px dashed ${track.uploaded ? 'rgba(160,232,124,0.4)' : 'var(--border)'}`,
                    color: track.uploaded ? 'var(--green)' : 'var(--text-muted)',
                    cursor: (track.uploading || track.saving) ? 'not-allowed' : 'pointer',
                    opacity: (track.uploading || track.saving) ? 0.7 : 1,
                  }}>
                  {track.uploading ? (
                    <><VukaLoader size={14} /> Uploading… {track.uploadProgress}%</>
                  ) : track.uploaded ? (
                    <><CheckCircle size={14} /> New file ready — click Save</>
                  ) : (
                    <><Upload size={14} /> Choose audio file (MP3 / WAV / FLAC)</>
                  )}
                </label>
                {track.uploading && (
                  <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${track.uploadProgress}%`, background: 'var(--green)' }} />
                  </div>
                )}
              </div>

              {/* Save button — only shown once a new file is ready */}
              {track.uploaded && !track.saved && (
                <button
                  onClick={() => saveTrack(track.id)}
                  disabled={track.saving}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold flex-shrink-0 disabled:opacity-50"
                  style={{ background: 'var(--sky)', color: 'white' }}>
                  {track.saving ? <VukaLoader size={13} /> : <Save size={13} />}
                  {track.saving ? 'Saving…' : 'Save'}
                </button>
              )}
            </div>

            {/* Per-track error */}
            {track.error && (
              <p className="mt-2 text-xs flex items-center gap-1.5"
                style={{ color: '#ff4d4d' }}>
                <AlertCircle size={12} /> {track.error}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Bottom save all / done */}
      {tracks.length > 0 && (
        <div className="mt-6 flex gap-3">
          {anyPending && (
            <button onClick={saveAll}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold"
              style={{ background: 'var(--sky)', color: 'white' }}>
              <Save size={14} /> Save All Changes
            </button>
          )}
          {!anyPending && allSaved && tracks.some(t => t.saved) && (
            <button onClick={() => router.push('/dashboard/releases')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold"
              style={{ background: 'var(--green)', color: '#0a0a0a' }}>
              <CheckCircle size={14} /> Done — Back to Releases
            </button>
          )}
          <Link href="/dashboard/releases"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <ArrowLeft size={14} /> Cancel
          </Link>
        </div>
      )}

      {/* Danger zone */}
      {release && release.sales === 0 && (
        <div className="mt-10 pt-6 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-sm font-bold mb-2" style={{ color: '#ff4d4d' }}>Danger Zone</p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            This release has no sales yet, so it can be deleted permanently.
          </p>
          <button onClick={handleDelete} disabled={deleting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-60"
            style={{ background: 'rgba(255,77,77,0.1)', color: '#ff4d4d', border: '1px solid rgba(255,77,77,0.3)' }}>
            {deleting ? <VukaLoader size={14} /> : <Trash2 size={14} />}
            {deleting ? 'Deleting…' : 'Delete Release'}
          </button>
          {deleteError && (
            <p className="mt-2 text-xs flex items-center gap-1.5" style={{ color: '#ff4d4d' }}>
              <AlertCircle size={12} /> {deleteError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
