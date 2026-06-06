'use client';
// ============================================================
// VUKA — Edit Distribution Release Audio
// /dashboard/releases/[id]/edit
// Lets artists re-upload audio for each track on an existing
// distribution release. Calls PATCH /api/distribution/releases/[id]/tracks
// with { trackId, audioUrl } to update fileUrl in the DB.
// ============================================================

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Music, Upload, Loader2, CheckCircle,
  AlertCircle, Save,
} from 'lucide-react';

interface TrackState {
  id: string;
  title: string;
  trackNumber: number;
  fileUrl: string;
  // upload state
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

  // Load release + tracks
  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/distribution/releases/${id}`).then(r => r.ok ? r.json() : Promise.reject(r)),
      fetch(`/api/distribution/releases/${id}/tracks`).then(r => r.ok ? r.json() : Promise.reject(r)),
    ])
      .then(([rel, trk]) => {
        setRelease(rel.release ?? rel);
        const raw: any[] = trk.tracks ?? [];
        setTracks(raw.map(t => ({
          id:           t.id,
          title:        t.title,
          trackNumber:  t.trackNumber,
          fileUrl:      t.fileUrl ?? '',
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
      const res = await fetch(`/api/distribution/releases/${id}/tracks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId, audioUrl: track.newAudioUrl }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Save failed');
      }
      updateTrack(trackId, { saving: false, saved: true, fileUrl: track.newAudioUrl });
    } catch (e: any) {
      updateTrack(trackId, { saving: false, error: e.message || 'Save failed' });
    }
  }

  async function saveAll() {
    const pending = tracks.filter(t => t.newAudioUrl && !t.saved);
    await Promise.all(pending.map(t => saveTrack(t.id)));
  }

  const anyPending = tracks.some(t => t.newAudioUrl && !t.saved);
  const allSaved   = tracks.every(t => t.saved || !t.newAudioUrl);

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={18} className="animate-spin" /> Loading release…
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
            Re-upload Audio
          </h1>
          {release && (
            <p className="text-sm truncate" style={{ color: 'var(--text-muted)' }}>
              {release.title}
            </p>
          )}
        </div>
        {anyPending && (
          <button onClick={saveAll}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white"
            style={{ background: 'var(--green)', color: '#0a0a0a' }}>
            <Save size={14} /> Save All
          </button>
        )}
      </div>

      <div className="p-4 rounded-xl text-sm mb-6"
        style={{ background: 'rgba(56,182,232,0.06)', border: '1px solid rgba(56,182,232,0.2)', color: 'var(--text-muted)' }}>
        Upload new audio for each track below. Click <strong style={{ color: 'var(--text)' }}>Save</strong> per track (or <strong style={{ color: 'var(--text)' }}>Save All</strong>) once uploaded. The new URL is written to the database immediately — no re-submission needed.
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
            {track.fileUrl && !track.saved && (
              <p className="text-xs mb-3 truncate font-mono px-2 py-1.5 rounded-lg"
                style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Current: {track.fileUrl || '(none — needs upload)'}
              </p>
            )}
            {track.saved && track.fileUrl && (
              <p className="text-xs mb-3 truncate font-mono px-2 py-1.5 rounded-lg"
                style={{ background: 'rgba(160,232,124,0.06)', color: 'var(--green)', border: '1px solid rgba(160,232,124,0.2)' }}>
                ✓ {track.fileUrl}
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
                    <><Loader2 size={14} className="animate-spin" /> Uploading… {track.uploadProgress}%</>
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
                  {track.saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
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
    </div>
  );
}
