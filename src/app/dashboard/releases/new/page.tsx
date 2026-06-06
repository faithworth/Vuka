'use client';
// ============================================================
// VUKA — Release Upload Wizard (Phase 3)
// /dashboard/releases/new — 6-step wizard matching spec exactly:
// 1. Release Info  2. Artwork  3. Tracks  4. Distribution
// 5. Rights & Credits  6. Review & Submit
// Uploads files directly to R2 via presigned URLs.
// ============================================================

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronRight, ChevronLeft, Upload, Music, Image as ImageIcon,
  Plus, Trash2, Loader2, CheckCircle, AlertCircle,
  ArrowLeft, Hash, Users,
} from 'lucide-react';

const GENRES = [
  'Amapiano', 'Afrobeats', 'Gqom', 'Hip-Hop', 'Trap', 'R&B',
  'Drill', 'House', 'Kwaito', 'Gospel', 'Jazz', 'Pop', 'Electronic',
  'Reggae', 'Dancehall', 'Soul', 'Afro-House', 'Afro-Soul',
];

const RELEASE_TYPES = [
  { value: 'SINGLE',  label: 'Single',  desc: '1 song' },
  { value: 'EP',      label: 'EP',      desc: '2–6 songs' },
  { value: 'ALBUM',   label: 'Album',   desc: '7+ songs' },
  { value: 'MIXTAPE', label: 'Mixtape', desc: 'Any length' },
];



interface TrackEntry {
  id: string;
  title: string;
  trackNumber: number;
  isExplicit: boolean;
  featuredArtists: string;
  composers: string;
  producers: string;
  audioFile?: File;
  uploading: boolean;
  uploaded: boolean;
  audioUrl?: string;
  uploadProgress: number;
}

function normalizeContentType(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith('.wav'))  return 'audio/wav';
  if (name.endsWith('.mp3'))  return 'audio/mpeg';
  if (name.endsWith('.flac')) return 'audio/flac';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png'))  return 'image/png';
  return file.type || 'application/octet-stream';
}

async function uploadToR2(presignedUrl: string, file: File, onProgress?: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', normalizeContentType(file));
    if (onProgress) xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload  = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.send(file);
  });
}

const STEPS = [
  'Release Info', 'Artwork', 'Tracks',
  'Rights & Credits', 'Review',
];

export default function NewReleasePage() {
  const router = useRouter();
  const [step, setStep]   = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  // Step 1
  const [releaseType, setReleaseType] = useState('SINGLE');
  const [title, setTitle]             = useState('');
  const [primaryGenre, setPrimaryGenre] = useState('');
  const [secondaryGenre, setSecondaryGenre] = useState('');
  const [language, setLanguage]       = useState('en');
  const [releaseDate, setReleaseDate] = useState('');
  const [isExplicit, setIsExplicit]   = useState(false);

  // Pricing
  const [price, setPrice]               = useState('');
  const [payWhatYouWant, setPayWhatYouWant] = useState(false);
  const [minPrice, setMinPrice]         = useState('');

  // Step 2
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [artworkPreview, setArtworkPreview] = useState<string | null>(null);
  const [artworkUrl, setArtworkUrl]   = useState('');
  const [artworkUploading, setArtworkUploading] = useState(false);
  const artworkRef = useRef<HTMLInputElement>(null);

  // Step 3
  const [tracks, setTracks] = useState<TrackEntry[]>([
    { id: '1', title: '', trackNumber: 1, isExplicit: false, featuredArtists: '', composers: '', producers: '', uploading: false, uploaded: false, uploadProgress: 0 },
  ]);

  // Step 4
  const [copyrightYear, setCopyrightYear] = useState(new Date().getFullYear().toString());
  const [copyrightHolder, setCopyrightHolder] = useState('');
  const [label, setLabel]           = useState('');
  const [upc, setUpc]               = useState('');

  function addTrack() {
    setTracks(t => [...t, {
      id: Date.now().toString(), title: '', trackNumber: t.length + 1,
      isExplicit: false, featuredArtists: '', composers: '', producers: '',
      uploading: false, uploaded: false, uploadProgress: 0,
    }]);
  }

  function removeTrack(id: string) {
    setTracks(t => t.filter(x => x.id !== id).map((x, i) => ({ ...x, trackNumber: i + 1 })));
  }

  function updateTrack(id: string, update: Partial<TrackEntry>) {
    setTracks(t => t.map(x => x.id === id ? { ...x, ...update } : x));
  }

  async function handleArtworkSelect(file: File) {
    setArtworkFile(file);
    setArtworkPreview(URL.createObjectURL(file));
    setArtworkUploading(true);
    try {
      const res = await fetch('/api/dashboard/settings/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: normalizeContentType(file), fileType: 'artwork' }),
      });
      if (!res.ok) throw new Error('Failed to get upload URL');
      const { presignedUrl, publicUrl } = await res.json();
      await uploadToR2(presignedUrl, file);
      setArtworkUrl(publicUrl);
    } catch (e: any) { setError(e.message); }
    finally { setArtworkUploading(false); }
  }

  async function handleAudioSelect(trackId: string, file: File) {
    updateTrack(trackId, { audioFile: file, uploading: true, uploadProgress: 0 });
    try {
      const res = await fetch('/api/dashboard/settings/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: normalizeContentType(file), fileType: 'audio' }),
      });
      if (!res.ok) throw new Error('Failed to get upload URL');
      const { presignedUrl, publicUrl } = await res.json();
      await uploadToR2(presignedUrl, file, pct => updateTrack(trackId, { uploadProgress: pct }));
      updateTrack(trackId, { audioUrl: publicUrl, uploading: false, uploaded: true, uploadProgress: 100 });
    } catch (e: any) {
      setError(e.message);
      updateTrack(trackId, { uploading: false });
    }
  }

  async function handleSubmit() {
    setSaving(true);
    setError('');
    try {
      // Fetch artist name from settings (required by the distribution API)
      const meRes = await fetch('/api/dashboard/settings');
      const meData = meRes.ok ? await meRes.json() : {};
      const artistName = meData?.artist?.name?.trim() || '';

      const body = {
        title,
        artistName,
        releaseType,
        primaryGenre,
        secondaryGenre,
        language,
        scheduledDate: releaseDate || null,
        labelName: label || 'Self-Released',
        targetDSPs: ['vuka'],
        artworkUrl,
        copyrightYear: parseInt(copyrightYear),
        copyrightHolder: copyrightHolder || title,
        isExplicit,
        upc: upc || undefined,
        price: parseFloat(price) || 0,
        minPrice: payWhatYouWant ? (parseFloat(minPrice) || 0) : 0,
        payWhatYouWant,
      };

      // Step 1: create the release record (status: draft)
      const res = await fetch('/api/distribution/releases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to create release');
      }
      const { release } = await res.json();

      // Step 2: create each track — auto-generates ISRC per track
      const validTracks = tracks.filter(t => t.title.trim());
      if (validTracks.length === 0) throw new Error('Add at least one track before submitting');

      for (const t of validTracks) {
        const tRes = await fetch(`/api/distribution/releases/${release.id}/tracks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: t.title,
            trackNumber: t.trackNumber,
            explicit: t.isExplicit,
            language,
            audioUrl: t.audioUrl || '',   // ← public R2 URL — enables streaming + download
            featuredArtists: t.featuredArtists.split(',').map((x: string) => x.trim()).filter(Boolean),
            composers: t.composers.split(',').map((x: string) => x.trim()).filter(Boolean),
            producers: t.producers.split(',').map((x: string) => x.trim()).filter(Boolean),
          }),
        });
        if (!tRes.ok) {
          const d = await tRes.json();
          throw new Error(`Track "${t.title}" failed: ${d.error || 'Unknown error'}`);
        }
      }

      // Step 3: submit for admin review (status: draft → metadata_review)
      // This also sends the artist a confirmation email
      const submitRes = await fetch(`/api/distribution/releases/${release.id}/submit`, {
        method: 'POST',
      });
      if (!submitRes.ok) {
        const d = await submitRes.json();
        // Warn but don't hard-fail — release is created, just not yet submitted
        console.warn('[release wizard] submit step failed:', d);
        throw new Error(d.errors?.[0] || d.error || 'Submission failed');
      }

      router.push('/dashboard/releases?submitted=1');
    } catch (e: any) { setError(e.message); setSaving(false); }
  }

  const canProceed = () => {
    if (step === 1) return title.trim() && primaryGenre;
    if (step === 2) return artworkUrl || artworkUploading;
    if (step === 3) return tracks.every(t => t.title.trim());
    return true;
  };

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-10">
      {/* Back link */}
      <Link href="/dashboard/releases" className="flex items-center gap-2 text-sm mb-6"
        style={{ color: 'var(--text-muted)' }}>
        <ArrowLeft size={14} /> Back to Releases
      </Link>

      {/* Step progress */}
      <div className="mb-8">
        <h1 className="text-2xl font-black font-display mb-4">New Release</h1>
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {STEPS.map((s, i) => {
            const num = i + 1;
            const active = num === step;
            const done = num < step;
            return (
              <div key={s} className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => done && setStep(num)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: active ? 'rgba(160,232,124,0.12)' : done ? 'transparent' : 'transparent',
                    color: active ? 'var(--green)' : done ? 'var(--text-muted)' : 'var(--text-muted)',
                  }}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    active ? 'bg-green-400 text-black' : done ? 'bg-green-900 text-green-400' : 'bg-gray-800 text-gray-500'
                  }`}>
                    {done ? '✓' : num}
                  </span>
                  <span className="hidden sm:inline">{s}</span>
                </button>
                {i < STEPS.length - 1 && <ChevronRight size={12} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Card */}
      <div className="rounded-2xl p-6 mb-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

        {/* Step 1: Release Info */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="font-bold text-lg">Release Info</h2>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Release Type</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {RELEASE_TYPES.map(t => (
                  <button key={t.value} onClick={() => setReleaseType(t.value)}
                    className="p-3 rounded-xl text-left transition-all"
                    style={{
                      background: releaseType === t.value ? 'rgba(160,232,124,0.1)' : 'var(--bg)',
                      border: releaseType === t.value ? '1px solid rgba(160,232,124,0.4)' : '1px solid var(--border)',
                      color: releaseType === t.value ? 'var(--green)' : 'var(--text)',
                    }}>
                    <div className="font-bold text-sm">{t.label}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Release Title *</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Sithi Uyabona"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Primary Genre *</label>
                <select value={primaryGenre} onChange={e => setPrimaryGenre(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <option value="">Select genre…</option>
                  {GENRES.map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Secondary Genre</label>
                <select value={secondaryGenre} onChange={e => setSecondaryGenre(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <option value="">None</option>
                  {GENRES.filter(g => g !== primaryGenre).map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Release Date</label>
                <input type="date" value={releaseDate} onChange={e => setReleaseDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Language</label>
                <select value={language} onChange={e => setLanguage(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <option value="en">English</option>
                  <option value="zu">Zulu</option>
                  <option value="af">Afrikaans</option>
                  <option value="xh">Xhosa</option>
                  <option value="st">Sotho</option>
                  <option value="tn">Tswana</option>
                  <option value="yo">Yoruba</option>
                  <option value="sw">Swahili</option>
                  <option value="ha">Hausa</option>
                  <option value="pt">Portuguese</option>
                  <option value="fr">French</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isExplicit} onChange={e => setIsExplicit(e.target.checked)}
                className="rounded" />
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Contains explicit content</span>
            </label>

            {/* ── Pricing ── */}
            <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Pricing</p>

              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input type="checkbox" checked={payWhatYouWant}
                  onChange={e => { setPayWhatYouWant(e.target.checked); if (e.target.checked) setPrice(''); }}
                  className="rounded" />
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Pay What You Want (fans choose their own price)
                </span>
              </label>

              {!payWhatYouWant ? (
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    Price (ZAR) — set to 0 for free download
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg" style={{ color: 'var(--gold)' }}>R</span>
                    <input
                      type="number" min="0" step="1"
                      value={price}
                      onChange={e => setPrice(e.target.value)}
                      placeholder="e.g. 50"
                      className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    />
                  </div>
                  <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                    You receive 98% of every sale. Vuka retains 2%.
                  </p>
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
                      value={minPrice}
                      onChange={e => setMinPrice(e.target.value)}
                      placeholder="e.g. 20"
                      className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    />
                  </div>
                  <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                    Set to 0 to make it free with an option to tip.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Artwork */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="font-bold text-lg">Artwork Upload</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Minimum 3000×3000px, JPG or PNG, max 10MB. No text overlay on edges.
            </p>
            <input ref={artworkRef} type="file" accept="image/jpeg,image/png" className="hidden"
              onChange={e => e.target.files?.[0] && handleArtworkSelect(e.target.files[0])} />
            <div onClick={() => artworkRef.current?.click()}
              className="relative aspect-square max-w-xs mx-auto rounded-2xl overflow-hidden cursor-pointer group"
              style={{ border: `2px dashed ${artworkPreview ? 'transparent' : 'var(--border)'}` }}>
              {artworkPreview ? (
                <>
                  <img src={artworkPreview} alt="Artwork preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Upload size={24} className="text-white" />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
                  <ImageIcon size={40} style={{ color: 'var(--text-muted)' }} />
                  <div className="text-sm text-center" style={{ color: 'var(--text-muted)' }}>
                    Click to upload artwork
                  </div>
                </div>
              )}
            </div>
            {artworkUploading && (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                <Loader2 size={14} className="animate-spin" style={{ color: 'var(--green)' }} />
                Uploading artwork…
              </div>
            )}
            {artworkUrl && !artworkUploading && (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--green)' }}>
                <CheckCircle size={14} /> Artwork uploaded successfully
              </div>
            )}
          </div>
        )}

        {/* Step 3: Tracks */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="font-bold text-lg">Tracks</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Upload MP3, WAV, or FLAC. Max 500MB per track.
            </p>
            <div className="space-y-4">
              {tracks.map((track, i) => (
                <div key={track.id} className="p-4 rounded-xl" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: 'rgba(160,232,124,0.15)', color: 'var(--green)' }}>
                      {track.trackNumber}
                    </span>
                    <div className="flex-1">
                      <input value={track.title} onChange={e => updateTrack(track.id, { title: e.target.value })}
                        placeholder="Track title *"
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                    </div>
                    {tracks.length > 1 && (
                      <button onClick={() => removeTrack(track.id)} style={{ color: '#ff4d4d' }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  {/* Audio upload */}
                  <div className="mb-3">
                    <input type="file" accept="audio/*" id={`audio-${track.id}`} className="hidden"
                      onChange={e => e.target.files?.[0] && handleAudioSelect(track.id, e.target.files[0])} />
                    <label htmlFor={`audio-${track.id}`}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-all"
                      style={{
                        background: track.uploaded ? 'rgba(160,232,124,0.08)' : 'var(--surface)',
                        border: `1px dashed ${track.uploaded ? 'rgba(160,232,124,0.4)' : 'var(--border)'}`,
                        color: track.uploaded ? 'var(--green)' : 'var(--text-muted)',
                      }}>
                      {track.uploading ? (
                        <><Loader2 size={14} className="animate-spin" /> Uploading… {track.uploadProgress}%</>
                      ) : track.uploaded ? (
                        <><CheckCircle size={14} /> {track.audioFile?.name || 'Audio uploaded'}</>
                      ) : (
                        <><Music size={14} /> Upload audio file</>
                      )}
                    </label>
                    {track.uploading && (
                      <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${track.uploadProgress}%`, background: 'var(--green)' }} />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                    <input value={track.featuredArtists} onChange={e => updateTrack(track.id, { featuredArtists: e.target.value })}
                      placeholder="Featured artists (comma-separated)"
                      className="px-3 py-2 rounded-lg outline-none"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                    <input value={track.composers} onChange={e => updateTrack(track.id, { composers: e.target.value })}
                      placeholder="Composers"
                      className="px-3 py-2 rounded-lg outline-none"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                    <input value={track.producers} onChange={e => updateTrack(track.id, { producers: e.target.value })}
                      placeholder="Producers"
                      className="px-3 py-2 rounded-lg outline-none"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  </div>
                  <label className="flex items-center gap-2 mt-2 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                    <input type="checkbox" checked={track.isExplicit} onChange={e => updateTrack(track.id, { isExplicit: e.target.checked })} />
                    Explicit content
                  </label>
                </div>
              ))}
            </div>
            {(releaseType !== 'SINGLE' || tracks.length < 1) && (
              <button onClick={addTrack}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                <Plus size={14} /> Add Track
              </button>
            )}
          </div>
        )}

        {/* Step 4: Rights & Credits */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="font-bold text-lg">Rights & Credits</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Copyright Year</label>
                <input type="number" value={copyrightYear} onChange={e => setCopyrightYear(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Copyright Holder</label>
                <input value={copyrightHolder} onChange={e => setCopyrightHolder(e.target.value)}
                  placeholder="Your name or label"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Label Name</label>
                <input value={label} onChange={e => setLabel(e.target.value)}
                  placeholder="Self-Released"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  UPC <span className="font-normal opacity-60">(leave blank to auto-assign)</span>
                </label>
                <input value={upc} onChange={e => setUpc(e.target.value)}
                  placeholder="Auto-assigned by Vuka"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none font-mono"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <div className="space-y-5">
            <h2 className="font-bold text-lg">Review & Submit</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                {artworkPreview && (
                  <img src={artworkPreview} alt="Artwork" className="w-full aspect-square rounded-xl object-cover mb-4" />
                )}
              </div>
              <div className="space-y-3 text-sm">
                {[
                  { label: 'Title', value: title },
                  { label: 'Type', value: releaseType },
                  { label: 'Genre', value: [primaryGenre, secondaryGenre].filter(Boolean).join(', ') },
                  { label: 'Release Date', value: releaseDate || 'Immediate' },
                  { label: 'Tracks', value: `${tracks.length} track${tracks.length !== 1 ? 's' : ''}` },
                  { label: 'Price', value: payWhatYouWant ? `Pay What You Want (min R${minPrice || 0})` : parseFloat(price) > 0 ? `R${price}` : 'Free' },
                  { label: 'Label', value: label || 'Self-Released' },
                  { label: 'Copyright', value: `© ${copyrightYear} ${copyrightHolder || title}` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center py-2 border-b"
                    style={{ borderColor: 'var(--border)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                    <span className="font-medium text-right max-w-[60%] truncate">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 rounded-xl text-sm"
              style={{ background: 'rgba(160,232,124,0.06)', border: '1px solid rgba(160,232,124,0.2)', color: 'var(--text-muted)' }}>
              ✦ After submission, an admin will review your release within 2–7 days.
              You will receive an email notification at every stage.
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm flex items-center gap-2"
          style={{ background: 'rgba(255,77,77,0.08)', color: '#ff4d4d', border: '1px solid rgba(255,77,77,0.2)' }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => step > 1 && setStep(s => (s - 1) as any)}
          disabled={step === 1}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          <ChevronLeft size={14} /> Back
        </button>

        {step < 5 ? (
          <button onClick={() => setStep(s => (s + 1) as any)}
            disabled={!canProceed()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
            style={{ background: 'var(--green)', color: '#0a0a0a' }}>
            Continue <ChevronRight size={14} />
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold disabled:opacity-60"
            style={{ background: 'var(--green)', color: '#0a0a0a' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            {saving ? 'Submitting…' : 'Submit for Review'}
          </button>
        )}
      </div>
    </div>
  );
}
