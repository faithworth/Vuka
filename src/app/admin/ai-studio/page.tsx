'use client';
// ============================================================
// VUKA — AI Studio (Admin only)
// /admin/ai-studio — internal marketing content generator.
// Images (FLUX.2), Voice (Deepgram Aura-1), Video (ffmpeg assembly)
// all via Cloudflare Workers AI. See src/lib/ai-image.ts, ai-voice.ts,
// ffmpeg-video.ts and the three /api/admin/ai-studio/* routes.
// NOT artist-facing — for the Vuka team to make content for Vuka's
// own social channels.
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import { Image as ImageIcon, Mic, Film, Sparkles, Plus, Trash2, Play } from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

type StudioTab = 'image' | 'voice' | 'video';

interface Generation {
  id: string;
  kind: string;
  prompt: string;
  styleTag: string | null;
  model: string;
  resultUrl: string;
  status: string;
  createdAt: string;
}

const VOICE_OPTIONS = [
  { value: 'orion', label: 'Orion — confident male' },
  { value: 'asteria', label: 'Asteria — warm female' },
];

export default function AiStudioPage() {
  const [tab, setTab] = useState<StudioTab>('image');

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Sparkles size={22} style={{ color: 'var(--green)' }} />
        <div>
          <h1 className="text-2xl font-black font-display">AI Studio</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Generate marketing content for Vuka's own socials — not artist-facing.
          </p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-6">
        {[
          { key: 'image', label: 'Images', icon: ImageIcon },
          { key: 'voice', label: 'Voiceovers', icon: Mic },
          { key: 'video', label: 'Video', icon: Film },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as StudioTab)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={{
              background: tab === t.key ? 'rgba(160,232,124,0.12)' : 'var(--surface)',
              color: tab === t.key ? 'var(--green)' : 'var(--text-muted)',
              border: tab === t.key ? '1px solid rgba(160,232,124,0.3)' : '1px solid var(--border)',
            }}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'image' && <ImageTab />}
      {tab === 'voice' && <VoiceTab />}
      {tab === 'video' && <VideoTab />}
    </div>
  );
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      className="text-sm px-4 py-3 rounded-xl mb-4"
      style={{ background: 'rgba(255,77,77,0.1)', border: '1px solid rgba(255,77,77,0.25)', color: '#ff4d4d' }}
    >
      {message}
    </div>
  );
}

// ── Images ─────────────────────────────────────────────────
function ImageTab() {
  const [prompt, setPrompt] = useState('');
  const [quality, setQuality] = useState<'fast' | 'quality'>('fast');
  const [styleTag, setStyleTag] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Generation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const load = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/admin/ai-studio/generate-image');
      if (res.ok) setHistory((await res.json()).generations ?? []);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function generate() {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/ai-studio/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, quality, styleTag: styleTag || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Generation failed'); return; }
      setPrompt('');
      await load();
    } catch {
      setError('Network error — please try again');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <div className="rounded-2xl p-6 mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <ErrorBanner message={error} />
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          maxLength={400}
          placeholder="e.g. moody album cover, neon lights, silhouette of a singer on stage"
          className="w-full px-3 py-2.5 rounded-xl text-sm resize-none outline-none mb-1"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
        <div className="text-xs mb-4 text-right" style={{ color: 'var(--text-muted)' }}>{prompt.length}/400</div>

        <div className="flex flex-wrap gap-4 mb-4">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Quality</label>
            <div className="flex gap-2">
              {(['fast', 'quality'] as const).map((q) => (
                <button key={q} onClick={() => setQuality(q)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize"
                  style={{
                    background: quality === q ? 'rgba(160,232,124,0.15)' : 'var(--bg)',
                    color: quality === q ? 'var(--green)' : 'var(--text-muted)',
                    border: '1px solid var(--border)',
                  }}>
                  {q === 'fast' ? 'Fast (4-step)' : 'Quality (slower)'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Style tag (optional)</label>
            <input value={styleTag} onChange={(e) => setStyleTag(e.target.value)} placeholder="e.g. launch-post"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
        </div>

        <button onClick={generate} disabled={generating || !prompt.trim()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
          style={{ background: 'var(--green)', color: '#0a0a0a' }}>
          {generating ? <VukaLoader size={14} /> : <Sparkles size={14} />}
          {generating ? 'Generating…' : 'Generate Image'}
        </button>
      </div>

      <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-muted)' }}>History</h2>
      {loadingHistory ? (
        <div className="flex justify-center py-8"><VukaLoader size={20} /></div>
      ) : history.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No images generated yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {history.map((g) => (
            <a key={g.id} href={g.resultUrl} target="_blank" rel="noreferrer"
              className="block rounded-xl overflow-hidden group relative"
              style={{ border: '1px solid var(--border)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.resultUrl} alt={g.prompt} className="w-full aspect-square object-cover" />
              <div className="absolute inset-x-0 bottom-0 p-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', color: '#fff' }}>
                {g.prompt.slice(0, 60)}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Voice ──────────────────────────────────────────────────
function VoiceTab() {
  const [text, setText] = useState('');
  const [voice, setVoice] = useState(VOICE_OPTIONS[0].value);
  const [speed, setSpeed] = useState(1.0);
  const [styleTag, setStyleTag] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Generation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const load = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/admin/ai-studio/generate-voice');
      if (res.ok) setHistory((await res.json()).generations ?? []);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function generate() {
    if (!text.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/ai-studio/generate-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, speed, styleTag: styleTag || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Generation failed'); return; }
      setText('');
      await load();
    } catch {
      setError('Network error — please try again');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <div className="rounded-2xl p-6 mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <ErrorBanner message={error} />
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Script</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="Sell direct. Keep ninety percent from day one. No distributor middleman."
          className="w-full px-3 py-2.5 rounded-xl text-sm resize-none outline-none mb-1"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
        <div className="text-xs mb-4 text-right" style={{ color: 'var(--text-muted)' }}>{text.length}/1000</div>

        <div className="flex flex-wrap gap-4 mb-4">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Voice</label>
            <select value={voice} onChange={(e) => setVoice(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              {VOICE_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Speed: {speed.toFixed(2)}x</label>
            <input type="range" min={0.75} max={1.25} step={0.05} value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))} className="w-32" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Style tag (optional)</label>
            <input value={styleTag} onChange={(e) => setStyleTag(e.target.value)} placeholder="e.g. launch-vo"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
        </div>

        <button onClick={generate} disabled={generating || !text.trim()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
          style={{ background: 'var(--green)', color: '#0a0a0a' }}>
          {generating ? <VukaLoader size={14} /> : <Mic size={14} />}
          {generating ? 'Generating…' : 'Generate Voiceover'}
        </button>
      </div>

      <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-muted)' }}>History</h2>
      {loadingHistory ? (
        <div className="flex justify-center py-8"><VukaLoader size={20} /></div>
      ) : history.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No voiceovers generated yet.</p>
      ) : (
        <div className="space-y-2">
          {history.map((g) => (
            <div key={g.id} className="p-3 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-sm mb-2">{g.prompt}</p>
              <audio controls src={g.resultUrl} className="w-full h-8" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Video ──────────────────────────────────────────────────
interface SlideForm { imagePrompt: string; voiceoverText: string; }

function VideoTab() {
  const [slides, setSlides] = useState<SlideForm[]>([{ imagePrompt: '', voiceoverText: '' }]);
  const [voice, setVoice] = useState(VOICE_OPTIONS[0].value);
  const [size, setSize] = useState<'1080x1080' | '1080x1920'>('1080x1080');
  const [styleTag, setStyleTag] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Generation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const load = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/admin/ai-studio/generate-video');
      if (res.ok) setHistory((await res.json()).generations ?? []);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function updateSlide(i: number, field: keyof SlideForm, value: string) {
    setSlides((s) => s.map((slide, idx) => idx === i ? { ...slide, [field]: value } : slide));
  }

  function addSlide() {
    if (slides.length >= 8) return;
    setSlides((s) => [...s, { imagePrompt: '', voiceoverText: '' }]);
  }

  function removeSlide(i: number) {
    setSlides((s) => s.filter((_, idx) => idx !== i));
  }

  async function generate() {
    const valid = slides.every((s) => s.imagePrompt.trim() && s.voiceoverText.trim());
    if (!valid) { setError('Every slide needs both an image prompt and a voiceover line'); return; }
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/ai-studio/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slides: slides.map((s) => ({ imagePrompt: s.imagePrompt, voiceoverText: s.voiceoverText })),
          voice, size, styleTag: styleTag || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Generation failed'); return; }
      setSlides([{ imagePrompt: '', voiceoverText: '' }]);
      await load();
    } catch {
      setError('Network error — please try again');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <div className="rounded-2xl p-6 mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <ErrorBanner message={error} />

        <div className="flex flex-wrap gap-4 mb-5">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Format</label>
            <div className="flex gap-2">
              <button onClick={() => setSize('1080x1080')} className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: size === '1080x1080' ? 'rgba(160,232,124,0.15)' : 'var(--bg)', color: size === '1080x1080' ? 'var(--green)' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Square (feed)
              </button>
              <button onClick={() => setSize('1080x1920')} className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: size === '1080x1920' ? 'rgba(160,232,124,0.15)' : 'var(--bg)', color: size === '1080x1920' ? 'var(--green)' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Vertical (story/reel)
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Voice</label>
            <select value={voice} onChange={(e) => setVoice(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              {VOICE_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Style tag (optional)</label>
            <input value={styleTag} onChange={(e) => setStyleTag(e.target.value)} placeholder="e.g. launch-video"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
        </div>

        <div className="space-y-3 mb-4">
          {slides.map((s, i) => (
            <div key={i} className="p-4 rounded-xl" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>Slide {i + 1}</span>
                {slides.length > 1 && (
                  <button onClick={() => removeSlide(i)} style={{ color: '#ff4d4d' }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <input
                value={s.imagePrompt}
                onChange={(e) => updateSlide(i, 'imagePrompt', e.target.value)}
                placeholder="Image prompt — e.g. dark background, glowing brand mark centered"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-2"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
              <input
                value={s.voiceoverText}
                onChange={(e) => updateSlide(i, 'voiceoverText', e.target.value)}
                placeholder="Voiceover line for this slide"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={addSlide} disabled={slides.length >= 8}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-40"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <Plus size={12} /> Add Slide
          </button>
          <button onClick={generate} disabled={generating}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
            style={{ background: 'var(--green)', color: '#0a0a0a' }}>
            {generating ? <VukaLoader size={14} /> : <Film size={14} />}
            {generating ? 'Building video… (can take a few minutes)' : 'Generate Video'}
          </button>
        </div>
      </div>

      <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-muted)' }}>History</h2>
      {loadingHistory ? (
        <div className="flex justify-center py-8"><VukaLoader size={20} /></div>
      ) : history.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No videos generated yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {history.map((g) => (
            <div key={g.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <video controls src={g.resultUrl} className="w-full aspect-square bg-black" />
              <div className="p-2 text-xs" style={{ color: 'var(--text-muted)' }}>{g.prompt.slice(0, 80)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
