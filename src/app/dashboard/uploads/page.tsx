'use client';
import { useState, useRef } from 'react';
import { Loader2, CheckCircle2, Rocket } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Step = 1 | 2 | 3 | 4 | 5;
type UploadType = 'beat' | 'release';

const GENRES = ['Afrobeats', 'Amapiano', 'Hip Hop', 'Trap', 'R&B', 'Drill', 'Gqom', 'House', 'Jazz', 'Gospel', 'Kwaito'];
const MOODS = ['Dark', 'Happy', 'Aggressive', 'Chill', 'Romantic', 'Epic', 'Motivational'];
const RELEASE_TYPES = [
  { value: 'single', label: '🎵 Single', desc: '1 song' },
  { value: 'ep', label: 'EP', desc: '2–6 songs' },
  { value: 'album', label: 'Album', desc: '7+ songs' },
  { value: 'mixtape', label: 'Mixtape', desc: 'Any length' },
];

interface TrackEntry { title: string; previewFile?: File; fullFile?: File; }

export default function UploadPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [uploadType, setUploadType] = useState<UploadType>('beat');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Beat fields
  const [beatMeta, setBeatMeta] = useState({ title: '', bpm: '', keySignature: '', genre: '', mood: '', tags: '' });
  const [beatPrices, setBeatPrices] = useState({ basicPrice: '99', premiumPrice: '299', exclPrice: '999' });
  const [files, setFiles] = useState<{ artwork?: File; preview?: File; wav?: File; mp3?: File }>({});

  // Release fields
  const [relMeta, setRelMeta] = useState({ title: '', releaseType: 'single', description: '', credits: '', price: '50', payWhatWant: false });
  const [tracks, setTracks] = useState<TrackEntry[]>([{ title: '' }]);
  const [relArtwork, setRelArtwork] = useState<File | null>(null);

  const artRef = useRef<HTMLInputElement>(null);
  const prevRef = useRef<HTMLInputElement>(null);
  const wavRef = useRef<HTMLInputElement>(null);
  const mp3Ref = useRef<HTMLInputElement>(null);
  const relArtRef = useRef<HTMLInputElement>(null);

  function resetAll() {
    setStep(1); setUploadType('beat'); setError(''); setSuccess(false); setLoading(false);
    setBeatMeta({ title: '', bpm: '', keySignature: '', genre: '', mood: '', tags: '' });
    setBeatPrices({ basicPrice: '99', premiumPrice: '299', exclPrice: '999' });
    setFiles({});
    setRelMeta({ title: '', releaseType: 'single', description: '', credits: '', price: '50', payWhatWant: false });
    setTracks([{ title: '' }]);
    setRelArtwork(null);
  }

  async function putToR2(url: string, file: File) {
    const res = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
    if (!res.ok) throw new Error(`File upload failed: ${file.name}`);
  }

  // ── BEAT SUBMIT ──
  async function handleBeatSubmit() {
    if (!beatMeta.title) { setError('Title is required'); return; }
    if (!files.preview) { setError('Preview MP3 is required'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/beats/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...beatMeta,
          ...beatPrices,
          bpm: parseInt(beatMeta.bpm) || 0,
          tags: beatMeta.tags.split(',').map(t => t.trim()).filter(Boolean),
          hasWav: !!files.wav,
          hasMp3: !!files.mp3 || !!files.preview,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create beat');
      const { beat, uploadUrls } = data;

      const R2_PUBLIC = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '';
      const urlPayload: Record<string, string> = {};
      if (files.artwork && uploadUrls?.artwork) { await putToR2(uploadUrls.artwork, files.artwork); urlPayload.artworkUrl = `${R2_PUBLIC}/artwork/beats/${beat.id}.jpg`; }
      if (files.preview && uploadUrls?.preview) { await putToR2(uploadUrls.preview, files.preview); urlPayload.previewUrl = `${R2_PUBLIC}/previews/beats/${beat.id}.mp3`; }
      if (files.wav && uploadUrls?.wav) { await putToR2(uploadUrls.wav, files.wav); urlPayload.fullWavUrl = `${R2_PUBLIC}/private/beats/${beat.id}.wav`; }
      if (files.mp3 && uploadUrls?.mp3) { await putToR2(uploadUrls.mp3, files.mp3); urlPayload.fullMp3Url = `${R2_PUBLIC}/private/beats/${beat.id}.mp3`; }
      else if (files.preview) { urlPayload.fullMp3Url = `${R2_PUBLIC}/private/beats/${beat.id}.mp3`; }

      await fetch('/api/beats/upload', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beatId: beat.id, ...urlPayload }),
      });
      setSuccess(true);
    } catch (e: any) {
      setError(e.message || 'Upload failed — check your connection and try again');
    } finally { setLoading(false); }
  }

  // ── RELEASE SUBMIT ──
  async function handleReleaseSubmit() {
    if (!relMeta.title) { setError('Title is required'); return; }
    const filled = tracks.filter(t => t.title.trim());
    if (!filled.length) { setError('Add at least one track'); return; }
    const missingFiles = filled.filter(t => !t.fullFile);
    if (missingFiles.length) { setError(`Upload the full audio file for: ${missingFiles.map(t => t.title).join(', ')}`); return; }

    setLoading(true); setError('');
    try {
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
      if (!res.ok) throw new Error(data.error || 'Could not create release');
      const { release, tracks: trackRecords, uploadUrls } = data;

      // Upload artwork
      if (relArtwork && uploadUrls?.artwork) await putToR2(uploadUrls.artwork, relArtwork);

      // Upload each track's files
      const trackUpdates: Record<string, { previewUrl: string; fullUrl: string }> = {};
      for (let i = 0; i < filled.length; i++) {
        const track = trackRecords[i];
        const entry = filled[i];
        if (entry.previewFile && uploadUrls[`preview_${track.id}`]) {
          await putToR2(uploadUrls[`preview_${track.id}`], entry.previewFile);
        }
        if (entry.fullFile && uploadUrls[`full_${track.id}`]) {
          await putToR2(uploadUrls[`full_${track.id}`], entry.fullFile);
        }
        const R2_PUBLIC2 = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '';
        trackUpdates[track.id] = {
          previewUrl: entry.previewFile ? `${R2_PUBLIC2}/previews/tracks/${track.id}.mp3` : '',
          fullUrl: entry.fullFile ? `${R2_PUBLIC2}/private/tracks/${track.id}.mp3` : '',
        };
      }

      // Finalize
      await fetch('/api/releases/upload', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ releaseId: release.id, artworkUrl: relArtwork ? `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL || ''}/artwork/releases/${release.id}.jpg` : '', trackUpdates }),
      });
      setSuccess(true);
    } catch (e: any) {
      setError(e.message || 'Upload failed — check your connection and try again');
    } finally { setLoading(false); }
  }

  // ── SUCCESS ──
  if (success) return (
    <div className="p-6 md:p-10 flex flex-col items-center justify-center min-h-[60vh] text-center">
      <CheckCircle2 size={64} className="mb-6" style={{ color: "var(--green)" }} />
      <h2 className="text-3xl font-black mb-3" style={{ color: 'var(--text)' }}>Sharp! It's live.</h2>
      <p className="mb-2" style={{ color: 'var(--text-muted)' }}>
        Your {uploadType === 'beat' ? 'beat' : relMeta.releaseType} is now on Vuka.
      </p>
      <p className="mb-8 text-sm" style={{ color: 'var(--green)' }}>Share your link and start earning. 99% of every sale is yours.</p>
      <div className="flex gap-4 flex-wrap justify-center">
        <button onClick={resetAll} className="px-6 py-3 rounded-xl font-bold"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          Upload Another
        </button>
        <button onClick={() => router.push(uploadType === 'beat' ? '/dashboard/beats' : '/dashboard/releases')}
          className="px-6 py-3 rounded-xl font-bold text-white" style={{ background: 'var(--purple)' }}>
          View My {uploadType === 'beat' ? 'Beats' : 'Releases'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-6 md:p-10 max-w-2xl">
      <h1 className="text-2xl font-black mb-2" style={{ color: 'var(--text)' }}>Upload to Your Store</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>You earn 99% of every sale. Direct to your bank.</p>

      {/* ── STEP 1: TYPE ── */}
      {step === 1 && (
        <div>
          <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text)' }}>What are you uploading?</h2>
          <div className="grid grid-cols-2 gap-4 mb-8">
            {(['beat', 'release'] as const).map(t => (
              <button key={t} onClick={() => setUploadType(t)}
                className="p-8 rounded-2xl text-center transition-all capitalize font-bold text-lg"
                style={{ background: uploadType === t ? 'var(--surface2)' : 'var(--surface)', border: `2px solid ${uploadType === t ? 'var(--purple)' : 'var(--border)'}`, color: 'var(--text)' }}>
                {t === 'beat' ? 'Beat' : 'Release'}
                <p className="text-xs font-normal mt-2" style={{ color: 'var(--text-muted)' }}>
                  {t === 'beat' ? 'Instrumental with license tiers' : 'Single, EP, Album or Mixtape'}
                </p>
              </button>
            ))}
          </div>
          <button onClick={() => setStep(2)} className="w-full py-4 rounded-xl font-bold text-white" style={{ background: 'var(--purple)' }}>
            Continue →
          </button>
        </div>
      )}

      {/* ── BEAT: STEP 2 FILES ── */}
      {step === 2 && uploadType === 'beat' && (
        <div>
          <h2 className="text-lg font-bold mb-6" style={{ color: 'var(--text)' }}>Upload Files</h2>
          <div className="space-y-4 mb-8">
            <FileDropzone label="Artwork (JPG/PNG)" accept="image/*" onFile={f => setFiles(p => ({ ...p, artwork: f }))} file={files.artwork} inputRef={artRef} />
            <FileDropzone label="Preview MP3 — watermarked 30s snippet *" accept="audio/mpeg,audio/mp3" onFile={f => setFiles(p => ({ ...p, preview: f }))} file={files.preview} inputRef={prevRef} required />
            <FileDropzone label="Full WAV (buyers unlock this)" accept="audio/wav,audio/wave" onFile={f => setFiles(p => ({ ...p, wav: f }))} file={files.wav} inputRef={wavRef} />
            <FileDropzone label="Full MP3 (buyers unlock this)" accept="audio/mpeg,audio/mp3" onFile={f => setFiles(p => ({ ...p, mp3: f }))} file={files.mp3} inputRef={mp3Ref} />
          </div>
          {error && <p className="text-red-400 text-sm mb-4">⚠️ {error}</p>}
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="px-6 py-3 rounded-xl font-bold" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>← Back</button>
            <button onClick={() => { if (!files.preview) { setError('Preview MP3 is required'); return; } setError(''); setStep(3); }}
              className="flex-1 py-3 rounded-xl font-bold text-white" style={{ background: 'var(--purple)' }}>Continue →</button>
          </div>
        </div>
      )}

      {/* ── BEAT: STEP 3 METADATA ── */}
      {step === 3 && uploadType === 'beat' && (
        <div>
          <h2 className="text-lg font-bold mb-6" style={{ color: 'var(--text)' }}>Beat Details</h2>
          <div className="space-y-4 mb-8">
            <Field label="Beat Title *" value={beatMeta.title} onChange={v => setBeatMeta(p => ({ ...p, title: v }))} placeholder="e.g. Midnight Amapiano" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="BPM" type="number" value={beatMeta.bpm} onChange={v => setBeatMeta(p => ({ ...p, bpm: v }))} placeholder="e.g. 113" />
              <Field label="Key" value={beatMeta.keySignature} onChange={v => setBeatMeta(p => ({ ...p, keySignature: v }))} placeholder="e.g. C minor" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <SelectField label="Genre" value={beatMeta.genre} onChange={v => setBeatMeta(p => ({ ...p, genre: v }))} options={GENRES} />
              <SelectField label="Mood" value={beatMeta.mood} onChange={v => setBeatMeta(p => ({ ...p, mood: v }))} options={MOODS} />
            </div>
            <Field label="Tags (comma separated)" value={beatMeta.tags} onChange={v => setBeatMeta(p => ({ ...p, tags: v }))} placeholder="dark, melodic, drill" />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="px-6 py-3 rounded-xl font-bold" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>← Back</button>
            <button onClick={() => { if (!beatMeta.title) { setError('Title required'); return; } setError(''); setStep(4); }}
              className="flex-1 py-3 rounded-xl font-bold text-white" style={{ background: 'var(--purple)' }}>Continue →</button>
          </div>
        </div>
      )}

      {/* ── BEAT: STEP 4 PRICING ── */}
      {step === 4 && uploadType === 'beat' && (
        <div>
          <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text)' }}>Set Your Prices (ZAR)</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>You keep 99% of every sale. Set prices that reflect your value.</p>
          <div className="space-y-4 mb-8">
            <PriceField label="Basic License" sublabel="Non-exclusive · up to 5K streams" type="number" value={beatPrices.basicPrice} onChange={v => setBeatPrices(p => ({ ...p, basicPrice: v }))} />
            <PriceField label="Premium License" sublabel="Non-exclusive · up to 500K streams" type="number" value={beatPrices.premiumPrice} onChange={v => setBeatPrices(p => ({ ...p, premiumPrice: v }))} />
            <PriceField label="Exclusive License" sublabel="Full exclusive ownership" type="number" value={beatPrices.exclPrice} onChange={v => setBeatPrices(p => ({ ...p, exclPrice: v }))} />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(3)} className="px-6 py-3 rounded-xl font-bold" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>← Back</button>
            <button onClick={() => setStep(5)} className="flex-1 py-3 rounded-xl font-bold text-white" style={{ background: 'var(--purple)' }}>Preview & Publish →</button>
          </div>
        </div>
      )}

      {/* ── BEAT: STEP 5 PUBLISH ── */}
      {step === 5 && uploadType === 'beat' && (
        <div>
          <h2 className="text-lg font-bold mb-6" style={{ color: 'var(--text)' }}>Ready to Publish</h2>
          <div className="p-6 rounded-2xl mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="font-bold text-xl mb-4" style={{ color: 'var(--text)' }}>{beatMeta.title}</h3>
            <div className="space-y-2 text-sm">
              {beatMeta.genre && <Row k="Genre" v={beatMeta.genre} />}
              {beatMeta.bpm && <Row k="BPM" v={beatMeta.bpm} />}
              <Row k="Basic License" v={`R${beatPrices.basicPrice}`} />
              <Row k="Premium License" v={`R${beatPrices.premiumPrice}`} />
              <Row k="Exclusive License" v={`R${beatPrices.exclPrice}`} />
              <Row k="Preview" v={files.preview?.name || '—'} />
              {files.wav && <Row k="Full WAV" v={files.wav.name} />}
              {files.mp3 && <Row k="Full MP3" v={files.mp3.name} />}
            </div>
          </div>
          <div className="p-3 rounded-lg mb-6 text-xs" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--green)' }}>
            💚 You earn 99% of every sale · 1% Vuka fee · Direct to your bank
          </div>
          {error && <p className="text-red-400 text-sm mb-4">⚠️ {error}</p>}
          <div className="flex gap-3">
            <button onClick={() => setStep(4)} className="px-6 py-3 rounded-xl font-bold" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>← Back</button>
            <button onClick={handleBeatSubmit} disabled={loading}
              className="flex-1 py-3 rounded-xl font-bold text-white disabled:opacity-60 transition-opacity"
              style={{ background: 'linear-gradient(135deg,var(--purple),#5b21b6)' }}>
              {loading ? <><Loader2 size={16} className="animate-spin inline mr-2" />Uploading…</> : 'Publish to Store — Yebo'}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          RELEASE FLOW
      ══════════════════════════════════════════ */}

      {/* ── RELEASE: STEP 2 TYPE & INFO ── */}
      {step === 2 && uploadType === 'release' && (
        <div>
          <h2 className="text-lg font-bold mb-6" style={{ color: 'var(--text)' }}>Release Details</h2>
          <div className="space-y-4 mb-6">
            <Field label="Release Title *" value={relMeta.title} onChange={v => setRelMeta(p => ({ ...p, title: v }))} placeholder="e.g. Late Nights in Joburg" />
            <div>
              <label className="block text-sm mb-2" style={{ color: 'var(--text-muted)' }}>Release Type *</label>
              <div className="grid grid-cols-2 gap-3">
                {RELEASE_TYPES.map(rt => (
                  <button key={rt.value} onClick={() => setRelMeta(p => ({ ...p, releaseType: rt.value }))}
                    className="p-4 rounded-xl text-left transition-all"
                    style={{ background: relMeta.releaseType === rt.value ? 'var(--surface2)' : 'var(--surface)', border: `2px solid ${relMeta.releaseType === rt.value ? 'var(--purple)' : 'var(--border)'}` }}>
                    <div className="font-bold text-sm" style={{ color: 'var(--text)' }}>{rt.label}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{rt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <Field label="Description (optional)" value={relMeta.description} onChange={v => setRelMeta(p => ({ ...p, description: v }))} placeholder="Tell fans what this release is about" />
            <Field label="Credits (optional)" value={relMeta.credits} onChange={v => setRelMeta(p => ({ ...p, credits: v }))} placeholder="Produced by, features, mixed by…" />
          </div>
          {error && <p className="text-red-400 text-sm mb-4">⚠️ {error}</p>}
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="px-6 py-3 rounded-xl font-bold" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>← Back</button>
            <button onClick={() => { if (!relMeta.title) { setError('Title is required'); return; } setError(''); setStep(3); }}
              className="flex-1 py-3 rounded-xl font-bold text-white" style={{ background: 'var(--purple)' }}>Continue →</button>
          </div>
        </div>
      )}

      {/* ── RELEASE: STEP 3 TRACKS ── */}
      {step === 3 && uploadType === 'release' && (
        <div>
          <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text)' }}>Add Your Tracks</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Add each song. Upload a preview (30s) and the full audio file.</p>
          <div className="space-y-4 mb-6">
            {tracks.map((track, i) => (
              <TrackRow
                key={i}
                index={i}
                track={track}
                onChange={(updated) => setTracks(prev => prev.map((t, idx) => idx === i ? updated : t))}
                onRemove={() => setTracks(prev => prev.filter((_, idx) => idx !== i))}
                canRemove={tracks.length > 1}
              />
            ))}
          </div>
          <button onClick={() => setTracks(p => [...p, { title: '' }])}
            className="w-full py-3 rounded-xl border-2 border-dashed mb-6 text-sm font-bold transition-colors"
            style={{ borderColor: 'var(--purple)', color: 'var(--purple-light)' }}>
            + Add Another Track
          </button>
          {error && <p className="text-red-400 text-sm mb-4">⚠️ {error}</p>}
          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="px-6 py-3 rounded-xl font-bold" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>← Back</button>
            <button onClick={() => {
              const filled = tracks.filter(t => t.title.trim());
              if (!filled.length) { setError('Add at least one track with a title'); return; }
              if (filled.some(t => !t.fullFile)) { setError('Each track needs a full audio file uploaded'); return; }
              setError(''); setStep(4);
            }} className="flex-1 py-3 rounded-xl font-bold text-white" style={{ background: 'var(--purple)' }}>Continue →</button>
          </div>
        </div>
      )}

      {/* ── RELEASE: STEP 4 ARTWORK & PRICE ── */}
      {step === 4 && uploadType === 'release' && (
        <div>
          <h2 className="text-lg font-bold mb-6" style={{ color: 'var(--text)' }}>Artwork & Pricing</h2>
          <div className="space-y-4 mb-8">
            <FileDropzone label="Cover Artwork (JPG/PNG) — recommended 3000×3000px" accept="image/*" onFile={f => setRelArtwork(f)} file={relArtwork || undefined} inputRef={relArtRef} />
            <PriceField label="Release Price (ZAR)" sublabel="Set to 0 for a free release" type="number" value={relMeta.price} onChange={v => setRelMeta(p => ({ ...p, price: v }))} />
            <label className="flex items-center gap-3 p-4 rounded-xl cursor-pointer" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <input type="checkbox" checked={relMeta.payWhatWant} onChange={e => setRelMeta(p => ({ ...p, payWhatWant: e.target.checked }))} className="w-5 h-5 accent-purple-500" />
              <div>
                <div className="font-bold text-sm" style={{ color: 'var(--text)' }}>Pay What You Want</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Fans can pay more if they love your music</div>
              </div>
            </label>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(3)} className="px-6 py-3 rounded-xl font-bold" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>← Back</button>
            <button onClick={() => setStep(5)} className="flex-1 py-3 rounded-xl font-bold text-white" style={{ background: 'var(--purple)' }}>Preview & Publish →</button>
          </div>
        </div>
      )}

      {/* ── RELEASE: STEP 5 PUBLISH ── */}
      {step === 5 && uploadType === 'release' && (
        <div>
          <h2 className="text-lg font-bold mb-6" style={{ color: 'var(--text)' }}>Ready to Publish</h2>
          <div className="p-6 rounded-2xl mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="font-bold text-xl mb-1" style={{ color: 'var(--text)' }}>{relMeta.title}</h3>
            <p className="text-sm mb-4 capitalize" style={{ color: 'var(--purple-light)' }}>{relMeta.releaseType}</p>
            <div className="space-y-2 text-sm mb-4">
              <Row k="Price" v={parseFloat(relMeta.price) === 0 ? 'Free' : `R${relMeta.price}`} />
              {relMeta.payWhatWant && <Row k="Pay What You Want" v="Enabled" />}
              <Row k="Tracks" v={`${tracks.filter(t => t.title.trim()).length} songs`} />
              {relArtwork && <Row k="Cover Art" v={relArtwork.name} />}
            </div>
            <div className="space-y-1">
              {tracks.filter(t => t.title.trim()).map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-sm py-1" style={{ borderTop: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{i + 1}.</span>
                  <span style={{ color: 'var(--text)' }}>{t.title}</span>
                  {t.fullFile && <span className="ml-auto text-xs" style={{ color: 'var(--green)' }}>✓ Ready</span>}
                </div>
              ))}
            </div>
          </div>
          <div className="p-3 rounded-lg mb-6 text-xs" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--green)' }}>
            💚 You earn 99% of every sale · 1% Vuka fee · Direct to your bank
          </div>
          {error && <p className="text-red-400 text-sm mb-4">⚠️ {error}</p>}
          <div className="flex gap-3">
            <button onClick={() => setStep(4)} className="px-6 py-3 rounded-xl font-bold" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>← Back</button>
            <button onClick={handleReleaseSubmit} disabled={loading}
              className="flex-1 py-3 rounded-xl font-bold text-white disabled:opacity-60 transition-opacity"
              style={{ background: 'linear-gradient(135deg,var(--purple),#5b21b6)' }}>
              {loading ? <><Loader2 size={16} className="animate-spin inline mr-2" />Uploading…</> : 'Publish to Store — Yebo'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TRACK ROW COMPONENT ──
function TrackRow({ index, track, onChange, onRemove, canRemove }: {
  index: number;
  track: TrackEntry;
  onChange: (t: TrackEntry) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const prevRef = useRef<HTMLInputElement>(null);
  const fullRef = useRef<HTMLInputElement>(null);

  return (
    <div className="p-4 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-sm font-bold w-6 text-center" style={{ color: 'var(--text-muted)' }}>{index + 1}</span>
        <input
          value={track.title}
          onChange={e => onChange({ ...track, title: e.target.value })}
          placeholder={`Track ${index + 1} title`}
          className="flex-1 px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
        {canRemove && (
          <button onClick={onRemove} className="text-xs px-2 py-1 rounded" style={{ color: 'var(--red)', background: 'var(--surface2)' }}>✕</button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 ml-9">
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Preview (30s clip)</p>
          <button type="button" onClick={() => prevRef.current?.click()}
            className="w-full py-2 rounded-lg border-dashed border text-xs text-center transition-colors"
            style={{ borderColor: track.previewFile ? 'var(--green)' : 'var(--border)', color: track.previewFile ? 'var(--green)' : 'var(--text-muted)' }}>
            {track.previewFile ? `✓ ${track.previewFile.name.slice(0, 20)}…` : '+ Preview MP3'}
          </button>
          <input ref={prevRef} type="file" accept="audio/mpeg,audio/mp3" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onChange({ ...track, previewFile: f }); }} />
        </div>
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Full Audio *</p>
          <button type="button" onClick={() => fullRef.current?.click()}
            className="w-full py-2 rounded-lg border-dashed border text-xs text-center transition-colors"
            style={{ borderColor: track.fullFile ? 'var(--green)' : 'var(--purple)', color: track.fullFile ? 'var(--green)' : 'var(--purple-light)' }}>
            {track.fullFile ? `✓ ${track.fullFile.name.slice(0, 20)}…` : '+ Full MP3/WAV *'}
          </button>
          <input ref={fullRef} type="file" accept="audio/mpeg,audio/mp3,audio/wav" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onChange({ ...track, fullFile: f }); }} />
        </div>
      </div>
    </div>
  );
}

// ── HELPERS ──
function FileDropzone({ label, accept, onFile, file, inputRef, required }: { label: string; accept: string; onFile: (f: File) => void; file?: File; inputRef: React.RefObject<HTMLInputElement>; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm mb-1" style={{ color: 'var(--text-muted)' }}>{label}{required && ' *'}</label>
      <button type="button" onClick={() => inputRef.current?.click()}
        className="w-full py-6 rounded-xl border-2 border-dashed text-center transition-colors"
        style={{ borderColor: file ? 'var(--green)' : 'var(--border)', background: file ? 'rgba(16,185,129,0.05)' : 'transparent' }}>
        {file
          ? <span style={{ color: 'var(--green)' }}>✓ {file.name}</span>
          : <span style={{ color: 'var(--text-muted)' }}>Click to upload</span>}
      </button>
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-4 py-3 rounded-xl"
        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
    </div>
  );
}

function PriceField({ label, sublabel, value, onChange, type = 'text' }: { label: string; sublabel?: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="p-4 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <label className="block text-sm font-bold" style={{ color: 'var(--text)' }}>{label}</label>
          {sublabel && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sublabel}</p>}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-sm font-bold" style={{ color: 'var(--text-muted)' }}>R</span>
          <input type={type} value={value} onChange={e => onChange(e.target.value)}
            className="w-24 px-3 py-2 rounded-lg text-right font-bold"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        </div>
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="block text-sm mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-4 py-3 rounded-xl"
        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
        <option value="">Select…</option>
        {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: 'var(--text-muted)' }}>{k}</span>
      <span style={{ color: 'var(--text)' }}>{v}</span>
    </div>
  );
}
