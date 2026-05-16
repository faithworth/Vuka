'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { BuyModal } from '@/components/BuyModal';
import { formatCurrency, generateWaveformFallback } from '@/lib/utils';

export default function BeatDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [beat, setBeat] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showBuy, setShowBuy] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch(`/api/store/beats?slug=${slug}`)
      .then(r => r.json())
      .then(d => {
        const found = d.beats?.[0] || d.beats?.find((b: any) => b.slug === slug);
        setBeat(found || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug]);

  const togglePlay = () => {
    if (!beat?.previewUrl) return;
    if (!audio) {
      const a = new Audio(beat.previewUrl);
      a.addEventListener('ended', () => setIsPlaying(false));
      a.play();
      setAudio(a);
      setIsPlaying(true);
    } else if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  };

  if (loading) return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="flex items-center justify-center py-24"><p style={{ color: 'var(--text-muted)' }}>Just now…</p></div>
    </div>
  );

  if (!beat) return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-4xl mb-4">😬</p>
        <p style={{ color: 'var(--text-muted)' }}>Eish. This beat doesn't exist.</p>
      </div>
    </div>
  );

  const waveform = beat.waveformData?.length ? beat.waveformData : generateWaveformFallback(42, 60);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Artwork */}
          <div className="md:w-72 flex-shrink-0">
            <div className="aspect-square rounded-2xl overflow-hidden" style={{ background: 'var(--surface)' }}>
              {beat.artworkUrl
                ? <img src={beat.artworkUrl} alt={beat.title} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-7xl">🎵</div>}
            </div>
          </div>
          {/* Info */}
          <div className="flex-1">
            <div className="inline-block text-xs px-2 py-1 rounded-lg mb-3 font-bold uppercase" style={{ background: 'var(--surface2)', color: 'var(--purple-light)' }}>BEAT</div>
            <h1 className="text-3xl font-black mb-1" style={{ color: 'var(--text)' }}>{beat.title}</h1>
            <a href={`/artist/${beat.artist?.slug}`} className="text-lg hover:underline" style={{ color: 'var(--purple-light)' }}>{beat.artist?.name}</a>

            <div className="flex gap-3 flex-wrap mt-4">
              {beat.bpm > 0 && <Tag label="BPM" value={String(beat.bpm)} />}
              {beat.keySignature && <Tag label="Key" value={beat.keySignature} />}
              {beat.genre && <Tag label="Genre" value={beat.genre} />}
              {beat.mood && <Tag label="Mood" value={beat.mood} />}
            </div>

            {/* Waveform preview */}
            <div className="mt-6">
              <div className="flex items-end gap-[2px]" style={{ height: 56 }}>
                {waveform.slice(0, 60).map((h: number, i: number) => (
                  <div key={i} className="flex-1 rounded-sm transition-colors" style={{ height: `${h * 100}%`, background: isPlaying ? 'var(--purple-light)' : 'var(--border)' }} />
                ))}
              </div>
              <button
                onClick={togglePlay}
                className="mt-3 flex items-center gap-2 px-6 py-2 rounded-xl font-medium"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                {isPlaying ? '⏸ Pause Preview' : '▶ Play Preview'}
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Watermarked</span>
              </button>
            </div>

            {/* License pricing */}
            <div className="mt-8 space-y-3">
              {[
                { name: 'Basic License', price: beat.basicPrice, desc: 'Non-exclusive · 5K streams · 2 videos' },
                { name: 'Premium License', price: beat.premiumPrice, desc: 'Non-exclusive · 500K streams · Unlimited videos' },
                { name: 'Exclusive License', price: beat.exclPrice, desc: 'Yours exclusively · Unlimited everything' },
              ].map(l => (
                <div key={l.name} className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div>
                    <p className="font-bold" style={{ color: 'var(--text)' }}>{l.name}</p>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{l.desc}</p>
                  </div>
                  <span className="font-bold text-lg" style={{ color: 'var(--purple-light)' }}>{formatCurrency(l.price)}</span>
                </div>
              ))}
            </div>

            {beat.isExclusive ? (
              <div className="mt-6 p-4 rounded-xl text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p style={{ color: 'var(--text-muted)' }}>🔒 This beat has been sold exclusively and is no longer available.</p>
              </div>
            ) : (
              <button
                onClick={() => setShowBuy(true)}
                className="mt-6 w-full py-4 rounded-xl font-bold text-white text-lg"
                style={{ background: 'linear-gradient(135deg,var(--purple),#5b21b6)' }}
              >
                Buy Now — Yebo ✓
              </button>
            )}
          </div>
        </div>
      </div>
      {showBuy && beat && (
        <BuyModal beat={beat} onClose={() => setShowBuy(false)} />
      )}
    </div>
  );
}

function Tag({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-1.5 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}: </span>
      <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  );
}
