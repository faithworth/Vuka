'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Loader2, CheckCircle2, Upload, Music, Image as ImageIcon, X, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Step = 1 | 2 | 3 | 4 | 5;
type UploadType = 'beat' | 'release';

const GENRES = ['Afrobeats', 'Amapiano', 'Hip Hop', 'Trap', 'R&B', 'Drill', 'Gqom', 'House', 'Jazz', 'Gospel', 'Kwaito', 'Pop', 'Electronic', 'Reggae', 'Dancehall'];
const MOODS = ['Dark', 'Happy', 'Aggressive', 'Chill', 'Romantic', 'Epic', 'Motivational', 'Melancholic'];
const RELEASE_TYPES = [
  { value: 'single', label: 'Single', desc: '1 song' },
  { value: 'ep', label: 'EP', desc: '2–6 songs' },
  { value: 'album', label: 'Album', desc: '7+ songs' },
  { value: 'mixtape', label: 'Mixtape', desc: 'Any length' },
];

interface TrackEntry {
  id: string;
  title: string;
  previewFile?: File;
  fullFile?: File;
}
interface UploadProgress { [key: string]: number; }

// Upload a file directly to R2 using a presigned PUT URL
// This bypasses Vercel body limits entirely — files go browser → R2 directly
// Normalize browser MIME types to the canonical type used when generating presigned URLs.
// Some browsers report audio/x-wav or audio/wave for .wav files — R2 will reject the PUT
// if the Content-Type doesn't exactly match the type the presigned URL was signed for.
function normalizeContentType(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith('.wav') || file.type === 'audio/x-wav' || file.type === 'audio/wave') return 'audio/wav';
  if (name.endsWith('.mp3') || file.type === 'audio/mp3') return 'audio/mpeg';
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
      else reject(new Error(`R2 upload failed: HTTP ${xhr.status} — ${xhr.responseText?.slice(0, 200)}`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload — check your connection'));
    xhr.send(file);
  });
}

export default function UploadPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [uploadType, setUploadType] = useState<UploadType>('beat');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [progress, setProgress] = useState<UploadProgress>({});
  const [payfastMerchant, setPayfastMerchant] = useState<string | null | undefined>(undefined);

  // Beat fields — must be declared before any conditional returns (React rules of hooks)
  const [beatMeta, setBeatMeta] = useState({ title: '', bpm: '', keySignature: '', genre: '', mood: '', tags: '' });
  const [beatPrices, setBeatPrices] = useState({ basicPrice: '99', premiumPrice: '299', exclPrice: '999' });
  const [files, setFiles] = useState<{ artwork?: File; preview?: File; wav?: File; mp3?: File }>({});

  // Release fields
  const [relMeta, setRelMeta] = useState({ title: '', releaseType: 'single', description: '', credits: '', price: '50', payWhatWant: false });
  const [tracks, setTracks] = useState<TrackEntry[]>([
  {
    id: crypto.randomUUID(),
    title: '',
    },
  ]);
  const [relArtwork, setRelArtwork] = useState<File | null>(null);

  // Refs — must be declared before any conditional returns (React rules of hooks)
  const artRef = useRef<HTMLInputElement>(null);
  const prevRef = useRef<HTMLInputElement>(null);
  const wavRef = useRef<HTMLInputElement>(null);
  const mp3Ref = useRef<HTMLInputElement>(null);
  const relArtRef = useRef<HTMLInputElement>(null);
  
  // MOVE THIS HERE ↑ BEFORE ANY RETURNS
  const setFileProgress = useCallback((key: string, pct: number) => {
    setProgress(p => ({ ...p, [key]: pct }));
  }, []);
  
  useEffect(() => {
    fetch('/api/dashboard/settings')
      .then(r => r.json())
      .then(d => setPayfastMerchant(d.artist?.payfastMerchant || null))
      .catch(() => setPayfastMerchant(null));
  }, []);
  
  // Block upload if PayFast not set up — conditional returns AFTER all hooks
  if (payfastMerchant === undefined) return (
    <div className="p-10 flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
      <Loader2 size={20} className="animate-spin" /> Loading…
    </div>
  );

  if (!payfastMerchant) return (
    <div className="p-6 md:p-10 max-w-lg">
      <div className="p-8 rounded-2xl text-center" style={{ background: 'var(--surface)', border: '1px solid rgba(234,179,8,0.3)' }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: 'rgba(234,179,8,0.1)' }}>
          <AlertCircle size={32} style={{ color: '#eab308' }} />
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text)' }}>Set up payments first</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          You need to connect your PayFast account before you can upload and sell music. This is how buyers pay you directly.
        </p>
        <div className="text-left p-4 rounded-xl mb-6 space-y-2 text-sm" style={{ background: 'var(--surface2)' }}>
          <p style={{ color: 'var(--text-muted)' }}>1. Sign up at <a href="https://www.payfast.co.za/registration" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--sky)' }}>payfast.co.za</a> (free)</p>
          <p style={{ color: 'var(--text-muted)' }}>2. Verify your ID and bank account</p>
          <p style={{ color: 'var(--text-muted)' }}>3. Copy your Merchant ID from <a href="https://my.payfast.io/settings/developer-settings" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--sky)' }}>my.payfast.io</a></p>
          <p style={{ color: 'var(--text-muted)' }}>4. Paste it in Settings and save</p>
        </div>
        <Link href="/dashboard/settings"
          className="inline-block w-full py-3 rounded-xl font-bold text-white text-center"
          style={{ background: 'var(--sky)' }}>
          Go to Settings →
        </Link>
      </div>
    </div>
  );



  function resetAll() {
    setStep(1); setUploadType('beat'); setError(''); setSuccess(false); setLoading(false); setProgress({});
    setBeatMeta({ title: '', bpm: '', keySignature: '', genre: '', mood: '', tags: '' });
    setBeatPrices({ basicPrice: '99', premiumPrice: '299', exclPrice: '999' });
    setFiles({});
    setRelMeta({ title: '', releaseType: 'single', description: '', credits: '', price: '50', payWhatWant: false });
    setTracks([
      {
        id: crypto.randomUUID(),
        title: '',
      },
    ]);
    setRelArtwork(null);
  }

  // ── BEAT SUBMIT ──
  async function handleBeatSubmit() {
    if (!beatMeta.title) { setError('Title is required'); return; }
    if (!files.preview) { setError('A preview MP3 is required'); return; }
    setLoading(true); setError('');

    try {
      // Step 1: Create the beat record + get presigned URLs
      const res = await fetch('/api/beats/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...beatMeta,
          ...beatPrices,
          bpm: parseInt(beatMeta.bpm) || 0,
          tags: beatMeta.tags.split(',').map(t => t.trim()).filter(Boolean),
          hasWav: !!files.wav,
          hasMp3: !!files.mp3,
          artworkType: files.artwork ? normalizeContentType(files.artwork) : 'image/jpeg',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create beat record');

      const { beat, uploadUrls, publicUrls } = data;

      // Step 2: Upload each file directly to R2 via presigned PUT URLs
      const urlPayload: Record<string, string> = {};

      if (files.artwork && uploadUrls.artwork) {
        await uploadToR2(uploadUrls.artwork, files.artwork, p => setFileProgress('artwork', p));
        urlPayload.artworkUrl = publicUrls.artworkUrl;
      }
      if (files.preview && uploadUrls.preview) {
        await uploadToR2(uploadUrls.preview, files.preview, p => setFileProgress('preview', p));
        urlPayload.previewUrl = publicUrls.previewUrl;
      }
      if (files.wav && uploadUrls.wav) {
        await uploadToR2(uploadUrls.wav, files.wav, p => setFileProgress('wav', p));
        urlPayload.fullWavUrl = publicUrls.fullWavUrl;
      }
      if (files.mp3 && uploadUrls.mp3) {
        await uploadToR2(uploadUrls.mp3, files.mp3, p => setFileProgress('mp3', p));
        urlPayload.fullMp3Url = publicUrls.fullMp3Url;
      }
      // If no separate full MP3, use preview as the purchasable file
      if (!urlPayload.fullMp3Url && urlPayload.previewUrl) {
        urlPayload.fullMp3Url = urlPayload.previewUrl;
      }

      // Step 3: Activate the beat with the public R2 URLs
      const patchRes = await fetch('/api/beats/upload', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beatId: beat.id, ...urlPayload }),
      });
      if (!patchRes.ok) {
        const pd = await patchRes.json();
        throw new Error(pd.error || 'Failed to activate beat');
      }

      setSuccess(true);
    } catch (e: any) {
      setError(e.message || 'Upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── RELEASE SUBMIT ──
  async function handleReleaseSubmit() {
    if (!relMeta.title) { setError('Title is required'); return; }
    const filled = tracks.filter(t => t.title.trim());
    if (!filled.length) { setError('Add at least one track'); return; }
    const missingFiles = filled.filter(t => !t.fullFile);
    if (missingFiles.length) {
      setError(`Missing full audio for: ${missingFiles.map(t => t.title).join(', ')}`);
      return;
    }

    setLoading(true); setError('');
    try {
      // Step 1: Create release + track records + get presigned URLs
      const res = await fetch('/api/releases/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: relMeta.title,
          releaseType: relMeta.releaseType,
          price: parseFloat(relMeta.price) || 0,
          payWhatWant: relMeta.payWhatWant,
          description: relMeta.description,
          credits: relMeta.credits,
          tracks: filled.map((t, i) => ({ title: t.title, trackNumber: i + 1 })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create release record');

      const { release, tracks: trackRecords, uploadUrls, publicUrls } = data;

      // Step 2: Upload artwork directly to R2
      let artworkUrl = '';
      if (relArtwork && uploadUrls.artwork) {
        await uploadToR2(uploadUrls.artwork, relArtwork, p => setFileProgress('artwork', p));
        artworkUrl = publicUrls.artworkUrl;
      }

      // Step 3: Upload each track's files directly to R2
      const trackUpdates: Record<string, { previewUrl: string; fullUrl: string }> = {};
      for (let i = 0; i < filled.length; i++) {
        const track = trackRecords[i];
        const entry = filled[i];
        let previewUrl = '';
        let fullUrl = '';

        if (entry.previewFile && uploadUrls[`preview_${track.id}`]) {
          await uploadToR2(uploadUrls[`preview_${track.id}`], entry.previewFile, p => setFileProgress(`preview_${i}`, p));
          previewUrl = publicUrls[`previewUrl_${track.id}`];
        }
        if (entry.fullFile && uploadUrls[`full_${track.id}`]) {
          await uploadToR2(uploadUrls[`full_${track.id}`], entry.fullFile, p => setFileProgress(`full_${i}`, p));
          fullUrl = publicUrls[`fullUrl_${track.id}`];
        }
        // If no separate preview, use the full file as preview too
        trackUpdates[track.id] = { previewUrl: previewUrl || fullUrl, fullUrl };
      }

      // Step 4: Activate the release
      const patchRes = await fetch('/api/releases/upload', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ releaseId: release.id, artworkUrl, trackUpdates }),
      });
      if (!patchRes.ok) {
        const pd = await patchRes.json();
        throw new Error(pd.error || 'Failed to activate release');
      }

      setSuccess(true);
    } catch (e: any) {
      setError(e.message || 'Upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── SUCCESS ──
  if (success) return (
    <div className="p-6 md:p-12 flex flex-col items-center justify-center min-h-[70vh] text-center">
      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}>
        <CheckCircle2 size={40} style={{ color: 'var(--green)' }} />
      </div>
      <h2 className="text-3xl font-bold mb-3" style={{ color: 'var(--text)' }}>You're live.</h2>
      <p className="mb-2 text-lg" style={{ color: 'var(--text-muted)' }}>
        Your {uploadType === 'beat' ? 'beat' : relMeta.releaseType} is now on Vuka.
      </p>
      <p className="mb-10 text-sm" style={{ color: 'var(--green)' }}>Share your link and start earning. 98% of every sale is yours.</p>
      <div className="flex gap-4 flex-wrap justify-center">
        <button onClick={resetAll} className="px-6 py-3 rounded-xl font-semibold"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          Upload another
        </button>
        <button onClick={() => router.push(uploadType === 'beat' ? '/dashboard/beats' : '/dashboard/releases')}
          className="px-6 py-3 rounded-xl font-semibold text-white" style={{ background: 'var(--sky)' }}>
          View my {uploadType === 'beat' ? 'beats' : 'releases'}
        </button>
      </div>
    </div>
  );

  const totalFiles = Object.values(progress).length;
  const avgProgress = totalFiles > 0 ? Math.round(Object.values(progress).reduce((a, b) => a + b, 0) / totalFiles) : 0;

  return (
    <div className="p-6 md:p-10 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>Upload to Your Store</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>You earn 98% of every sale — direct to your bank.</p>
      </div>

      {/* Step progress */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
              style={{
                background: step >= s ? 'var(--sky)' : 'var(--surface)',
                color: step >= s ? 'white' : 'var(--text-muted)',
                border: `1px solid ${step >= s ? 'var(--sky)' : 'var(--border)'}`,
              }}>
              {s}
            </div>
            {s < 5 && <div className="h-px w-6 flex-shrink-0" style={{ background: step > s ? 'var(--sky)' : 'var(--border)' }} />}
          </div>
        ))}
      </div>

      {/* ── STEP 1: TYPE ── */}
      {step === 1 && (
        <div>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>What are you uploading?</h2>
          <div className="grid grid-cols-2 gap-4 mb-8">
            {(['beat', 'release'] as const).map(t => (
              <button key={t} onClick={() => setUploadType(t)}
                className="p-6 rounded-2xl text-left transition-all"
                style={{
                  background: uploadType === t ? 'var(--surface2)' : 'var(--surface)',
                  border: `2px solid ${uploadType === t ? 'var(--sky)' : 'var(--border)'}`,
                }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: uploadType === t ? 'rgba(56,182,232,0.2)' : 'var(--surface2)' }}>
                  <Music size={20} style={{ color: uploadType === t ? 'var(--sky)' : 'var(--text-muted)' }} />
                </div>
                <div className="font-semibold capitalize mb-1" style={{ color: 'var(--text)' }}>
                  {t === 'beat' ? 'Beat' : 'Release'}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {t === 'beat' ? 'Instrumental with license tiers' : 'Single, EP, Album or Mixtape'}
                </div>
              </button>
            ))}
          </div>
          <button onClick={() => setStep(2)} className="w-full py-3 rounded-xl font-semibold text-white"
            style={{ background: 'var(--sky)' }}>
            Continue →
          </button>
        </div>
      )}

      {/* ── BEAT: STEP 2 FILES ── */}
      {step === 2 && uploadType === 'beat' && (
        <div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>Upload Files</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Files upload directly to secure cloud storage — no size limits.</p>
          <div className="space-y-3 mb-8">
            <FileDropzone label="Artwork" sublabel="JPG or PNG, recommended 3000×3000px" accept="image/*"
              onFile={f => setFiles(p => ({ ...p, artwork: f }))} file={files.artwork} inputRef={artRef} icon={<ImageIcon size={18} />} />
            <FileDropzone label="Preview MP3" sublabel="30s watermarked snippet shown to buyers" accept="audio/mpeg,audio/mp3"
              onFile={f => setFiles(p => ({ ...p, preview: f }))} file={files.preview} inputRef={prevRef} required icon={<Music size={18} />} />
            <FileDropzone label="Full WAV" sublabel="High quality — unlocked after purchase" accept="audio/wav,audio/wave"
              onFile={f => setFiles(p => ({ ...p, wav: f }))} file={files.wav} inputRef={wavRef} icon={<Music size={18} />} />
            <FileDropzone label="Full MP3" sublabel="Standard quality — unlocked after purchase" accept="audio/mpeg,audio/mp3"
              onFile={f => setFiles(p => ({ ...p, mp3: f }))} file={files.mp3} inputRef={mp3Ref} icon={<Music size={18} />} />
          </div>
          {error && <ErrorBanner message={error} />}
          <NavButtons onBack={() => setStep(1)} onNext={() => { if (!files.preview) { setError('A preview MP3 is required'); return; } setError(''); setStep(3); }} />
        </div>
      )}

      {/* ── BEAT: STEP 3 METADATA ── */}
      {step === 3 && uploadType === 'beat' && (
        <div>
          <h2 className="text-lg font-semibold mb-6" style={{ color: 'var(--text)' }}>Beat Details</h2>
          <div className="space-y-4 mb-8">
            <Field label="Beat Title" required value={beatMeta.title} onChange={v => setBeatMeta(p => ({ ...p, title: v }))} placeholder="e.g. Midnight Amapiano" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="BPM" type="number" value={beatMeta.bpm} onChange={v => setBeatMeta(p => ({ ...p, bpm: v }))} placeholder="e.g. 113" />
              <Field label="Key" value={beatMeta.keySignature} onChange={v => setBeatMeta(p => ({ ...p, keySignature: v }))} placeholder="e.g. C minor" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <SelectField label="Genre" value={beatMeta.genre} onChange={v => setBeatMeta(p => ({ ...p, genre: v }))} options={GENRES} />
              <SelectField label="Mood" value={beatMeta.mood} onChange={v => setBeatMeta(p => ({ ...p, mood: v }))} options={MOODS} />
            </div>
            <Field label="Tags" value={beatMeta.tags} onChange={v => setBeatMeta(p => ({ ...p, tags: v }))} placeholder="dark, melodic, drill (comma separated)" />
          </div>
          <NavButtons onBack={() => setStep(2)} onNext={() => { if (!beatMeta.title) { setError('Title is required'); return; } setError(''); setStep(4); }} />
        </div>
      )}

      {/* ── BEAT: STEP 4 PRICING ── */}
      {step === 4 && uploadType === 'beat' && (
        <div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>Set Your Prices</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>You keep 98% of every sale. Prices in ZAR (South African Rand).</p>
          <div className="space-y-3 mb-8">
            <PriceField label="Basic License" sublabel="Non-exclusive · up to 5,000 streams · 2 music videos"
              value={beatPrices.basicPrice} onChange={v => setBeatPrices(p => ({ ...p, basicPrice: v }))} />
            <PriceField label="Premium License" sublabel="Non-exclusive · up to 500K streams · commercial use"
              value={beatPrices.premiumPrice} onChange={v => setBeatPrices(p => ({ ...p, premiumPrice: v }))} />
            <PriceField label="Exclusive License" sublabel="Full exclusive ownership · unlimited use"
              value={beatPrices.exclPrice} onChange={v => setBeatPrices(p => ({ ...p, exclPrice: v }))} highlight />
          </div>
          <NavButtons onBack={() => setStep(3)} onNext={() => setStep(5)} nextLabel="Preview & Publish" />
        </div>
      )}

      {/* ── BEAT: STEP 5 PUBLISH ── */}
      {step === 5 && uploadType === 'beat' && (
        <div>
          <h2 className="text-lg font-semibold mb-6" style={{ color: 'var(--text)' }}>Ready to Publish</h2>
          <div className="p-6 rounded-2xl mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="font-bold text-xl mb-4" style={{ color: 'var(--text)' }}>{beatMeta.title}</h3>
            <div className="space-y-2.5">
              {beatMeta.genre && <SummaryRow label="Genre" value={beatMeta.genre} />}
              {beatMeta.bpm && <SummaryRow label="BPM" value={beatMeta.bpm} />}
              <SummaryRow label="Basic License" value={`R${beatPrices.basicPrice}`} />
              <SummaryRow label="Premium License" value={`R${beatPrices.premiumPrice}`} />
              <SummaryRow label="Exclusive License" value={`R${beatPrices.exclPrice}`} />
              <SummaryRow label="Preview" value={files.preview?.name || '—'} />
              {files.wav && <SummaryRow label="Full WAV" value={files.wav.name} />}
              {files.mp3 && <SummaryRow label="Full MP3" value={files.mp3.name} />}
            </div>
          </div>

          {loading && (
            <div className="mb-4 p-4 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Uploading to secure storage…</span>
                <span className="text-sm font-bold" style={{ color: 'var(--sky)' }}>{avgProgress}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${avgProgress}%`, background: 'linear-gradient(90deg, var(--sky), var(--sky))' }} />
              </div>
            </div>
          )}

          <div className="p-3 rounded-xl mb-4 text-sm" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--green)' }}>
            You earn 98% of every sale · Zero platform fee · Direct to your bank
          </div>

          {error && <ErrorBanner message={error} />}

          <div className="flex gap-3 mt-4">
            <button onClick={() => { if (!loading) setStep(4); }} disabled={loading}
              className="px-6 py-3 rounded-xl font-semibold disabled:opacity-40"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              ← Back
            </button>
            <button onClick={handleBeatSubmit} disabled={loading}
              className="flex-1 py-3 rounded-xl font-semibold text-white disabled:opacity-60 transition-opacity flex items-center justify-center gap-2"
              style={{ background: 'var(--sky)' }}>
              {loading ? <><Loader2 size={16} className="animate-spin" />Uploading…</> : <><Upload size={16} />Publish Beat</>}
            </button>
          </div>
        </div>
      )}

      {/* ── RELEASE: STEP 2 TYPE & INFO ── */}
      {step === 2 && uploadType === 'release' && (
        <div>
          <h2 className="text-lg font-semibold mb-6" style={{ color: 'var(--text)' }}>Release Details</h2>
          <div className="space-y-4 mb-6">
            <Field label="Release Title" required value={relMeta.title} onChange={v => setRelMeta(p => ({ ...p, title: v }))} placeholder="e.g. Late Nights in Joburg" />
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Release Type</label>
              <div className="grid grid-cols-2 gap-3">
                {RELEASE_TYPES.map(rt => (
                  <button key={rt.value} onClick={() => setRelMeta(p => ({ ...p, releaseType: rt.value }))}
                    className="p-4 rounded-xl text-left transition-all"
                    style={{ background: relMeta.releaseType === rt.value ? 'var(--surface2)' : 'var(--surface)', border: `2px solid ${relMeta.releaseType === rt.value ? 'var(--sky)' : 'var(--border)'}` }}>
                    <div className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{rt.label}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{rt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <Field label="Description" value={relMeta.description} onChange={v => setRelMeta(p => ({ ...p, description: v }))} placeholder="Tell fans what this release is about" />
            <Field label="Credits" value={relMeta.credits} onChange={v => setRelMeta(p => ({ ...p, credits: v }))} placeholder="Produced by, features, mixed by…" />
          </div>
          {error && <ErrorBanner message={error} />}
          <NavButtons onBack={() => setStep(1)} onNext={() => { if (!relMeta.title) { setError('Title is required'); return; } setError(''); setStep(3); }} />
        </div>
      )}

      {/* ── RELEASE: STEP 3 TRACKS ── */}
      {step === 3 && uploadType === 'release' && (
        <div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>Add Your Tracks</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Files upload directly to cloud storage — no size limits.</p>
          <div className="space-y-3 mb-4">
            {tracks.map((track, i) => (
              <TrackRow key={track.id} index={i} track={track}
                onChange={(updated) => setTracks(prev => prev.map((t, idx) => idx === i ? updated : t))}
                onRemove={() => setTracks(prev => prev.filter((_, idx) => idx !== i))}
                canRemove={tracks.length > 1} />
            ))}
          </div>
          <button
            onClick={() =>
              setTracks(p => [
                ...p,
                {
                  id: crypto.randomUUID(),
                  title: '',
                },
              ])
            }
            className="w-full py-3 rounded-xl border-2 border-dashed mb-6 text-sm font-semibold transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            + Add Another Track
          </button>
          {error && <ErrorBanner message={error} />}
          <NavButtons onBack={() => setStep(2)} onNext={() => {
            const filled = tracks.filter(t => t.title.trim());
            if (!filled.length) { setError('Add at least one track with a title'); return; }
            if (filled.some(t => !t.fullFile)) { setError('Each track needs a full audio file'); return; }
            setError(''); setStep(4);
          }} />
        </div>
      )}

      {/* ── RELEASE: STEP 4 ARTWORK & PRICE ── */}
      {step === 4 && uploadType === 'release' && (
        <div>
          <h2 className="text-lg font-semibold mb-6" style={{ color: 'var(--text)' }}>Artwork & Pricing</h2>
          <div className="space-y-4 mb-8">
            <FileDropzone label="Cover Artwork" sublabel="JPG or PNG · recommended 3000×3000px" accept="image/*"
              onFile={f => setRelArtwork(f)} file={relArtwork || undefined} inputRef={relArtRef} icon={<ImageIcon size={18} />} />
            <PriceField label="Release Price" sublabel="Set to 0 for a free release · price in ZAR"
              value={relMeta.price} onChange={v => setRelMeta(p => ({ ...p, price: v }))} />
            <label className="flex items-center gap-3 p-4 rounded-xl cursor-pointer" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <input type="checkbox" checked={relMeta.payWhatWant} onChange={e => setRelMeta(p => ({ ...p, payWhatWant: e.target.checked }))} className="w-4 h-4 accent-purple-500" />
              <div>
                <div className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Pay What You Want</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Fans can pay more if they love your music</div>
              </div>
            </label>
          </div>
          <NavButtons onBack={() => setStep(3)} onNext={() => setStep(5)} nextLabel="Preview & Publish" />
        </div>
      )}

      {/* ── RELEASE: STEP 5 PUBLISH ── */}
      {step === 5 && uploadType === 'release' && (
        <div>
          <h2 className="text-lg font-semibold mb-6" style={{ color: 'var(--text)' }}>Ready to Publish</h2>
          <div className="p-6 rounded-2xl mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="font-bold text-xl mb-1" style={{ color: 'var(--text)' }}>{relMeta.title}</h3>
            <p className="text-sm mb-4 capitalize" style={{ color: 'var(--sky)' }}>{relMeta.releaseType}</p>
            <div className="space-y-2.5 mb-4">
              <SummaryRow label="Price" value={parseFloat(relMeta.price) === 0 ? 'Free' : `R${relMeta.price}`} />
              {relMeta.payWhatWant && <SummaryRow label="Pay What You Want" value="Enabled" />}
              <SummaryRow label="Tracks" value={`${tracks.filter(t => t.title.trim()).length} songs`} />
              {relArtwork && <SummaryRow label="Cover Art" value={relArtwork.name} />}
            </div>
            <div className="space-y-1.5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              {tracks.filter(t => t.title.trim()).map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span style={{ color: 'var(--text-muted)', minWidth: '1.5rem' }}>{i + 1}.</span>
                  <span style={{ color: 'var(--text)' }}>{t.title}</span>
                  {t.fullFile && <span className="ml-auto text-xs font-medium" style={{ color: 'var(--green)' }}>✓ Ready</span>}
                </div>
              ))}
            </div>
          </div>

          {loading && (
            <div className="mb-4 p-4 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Uploading tracks…</span>
                <span className="text-sm font-bold" style={{ color: 'var(--sky)' }}>{avgProgress}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${avgProgress}%`, background: 'linear-gradient(90deg, var(--sky), var(--sky))' }} />
              </div>
            </div>
          )}

          <div className="p-3 rounded-xl mb-4 text-sm" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--green)' }}>
            You earn 98% of every sale · Zero platform fee · Direct to your bank
          </div>

          {error && <ErrorBanner message={error} />}

          <div className="flex gap-3 mt-4">
            <button onClick={() => { if (!loading) setStep(4); }} disabled={loading}
              className="px-6 py-3 rounded-xl font-semibold disabled:opacity-40"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              ← Back
            </button>
            <button onClick={handleReleaseSubmit} disabled={loading}
              className="flex-1 py-3 rounded-xl font-semibold text-white disabled:opacity-60 transition-opacity flex items-center justify-center gap-2"
              style={{ background: 'var(--sky)' }}>
              {loading ? <><Loader2 size={16} className="animate-spin" />Uploading…</> : <><Upload size={16} />Publish Release</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TRACK ROW ──
function TrackRow({ index, track, onChange, onRemove, canRemove }: {
  index: number; track: TrackEntry;
  onChange: (t: TrackEntry) => void; onRemove: () => void; canRemove: boolean;
}) {
  const prevRef = useRef<HTMLInputElement>(null);
  const fullRef = useRef<HTMLInputElement>(null);
  return (
    <div className="p-4 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs font-bold w-5 text-center" style={{ color: 'var(--text-muted)' }}>{index + 1}</span>
        <input value={track.title} onChange={e => onChange({ ...track, title: e.target.value })}
          placeholder={`Track ${index + 1} title`} className="flex-1 px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        {canRemove && (
          <button onClick={onRemove} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)', background: 'var(--surface2)' }}>
            <X size={14} />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 pl-8">
        <div>
          <p className="text-xs mb-1.5 font-medium" style={{ color: 'var(--text-muted)' }}>Preview (30s clip)</p>
          <button type="button" onClick={() => prevRef.current?.click()}
            className="w-full py-2 rounded-lg border text-xs text-center transition-colors"
            style={{ borderColor: track.previewFile ? 'var(--green)' : 'var(--border)', borderStyle: 'dashed', color: track.previewFile ? 'var(--green)' : 'var(--text-muted)' }}>
            {track.previewFile ? `✓ ${track.previewFile.name.slice(0, 18)}…` : '+ Preview MP3'}
          </button>
          <input ref={prevRef} type="file" accept="audio/mpeg,audio/mp3" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onChange({ ...track, previewFile: f }); }} />
        </div>
        <div>
          <p className="text-xs mb-1.5 font-medium" style={{ color: 'var(--text-muted)' }}>Full Audio *</p>
          <button type="button" onClick={() => fullRef.current?.click()}
            className="w-full py-2 rounded-lg border text-xs text-center transition-colors"
            style={{ borderColor: track.fullFile ? 'var(--green)' : 'var(--sky)', borderStyle: 'dashed', color: track.fullFile ? 'var(--green)' : 'var(--sky)' }}>
            {track.fullFile ? `✓ ${track.fullFile.name.slice(0, 18)}…` : '+ Full MP3/WAV *'}
          </button>
          <input ref={fullRef} type="file" accept="audio/mpeg,audio/mp3,audio/wav" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onChange({ ...track, fullFile: f }); }} />
        </div>
      </div>
    </div>
  );
}

// ── HELPER COMPONENTS ──
function FileDropzone({ label, sublabel, accept, onFile, file, inputRef, required, icon }: {
  label: string; sublabel?: string; accept: string; onFile: (f: File) => void;
  file?: File; inputRef: React.RefObject<HTMLInputElement>; required?: boolean; icon?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}{required && <span style={{ color: 'var(--red)' }}> *</span>}</label>
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

function Field({ label, value, onChange, type = 'text', placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
        {label}{required && <span style={{ color: 'var(--red)' }}> *</span>}
      </label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-4 py-3 rounded-xl text-sm"
        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }} />
    </div>
  );
}

function PriceField({ label, sublabel, value, onChange, highlight }: {
  label: string; sublabel?: string; value: string; onChange: (v: string) => void; highlight?: boolean;
}) {
  return (
    <div className="p-4 rounded-xl" style={{ background: 'var(--surface)', border: `1px solid ${highlight ? 'var(--sky)' : 'var(--border)'}` }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="text-sm font-semibold" style={{ color: highlight ? 'var(--sky)' : 'var(--text)' }}>{label}</div>
          {sublabel && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sublabel}</div>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>R</span>
          <input type="number" value={value} onChange={e => onChange(e.target.value)}
            className="w-24 px-3 py-2 rounded-lg text-right font-semibold text-sm"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        </div>
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full px-4 py-3 rounded-xl text-sm"
        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
        <option value="">Select…</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="font-medium" style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  );
}

function NavButtons({ onBack, onNext, nextLabel = 'Continue' }: { onBack: () => void; onNext: () => void; nextLabel?: string }) {
  return (
    <div className="flex gap-3">
      <button onClick={onBack} className="px-6 py-3 rounded-xl font-semibold text-sm"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
        ← Back
      </button>
      <button onClick={onNext} className="flex-1 py-3 rounded-xl font-semibold text-white text-sm"
        style={{ background: 'var(--sky)' }}>
        {nextLabel} →
      </button>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-xl mb-4 text-sm"
      style={{ background: 'rgba(232,64,64,0.1)', border: '1px solid rgba(232,64,64,0.3)', color: '#f87171' }}>
      <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}
