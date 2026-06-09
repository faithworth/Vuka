'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { BuyModal } from '@/components/BuyModal';
import { Play, Pause, ShoppingCart, Music, Tag, Package } from 'lucide-react';
import Link from 'next/link';

export default function SamplePage() {
  const { slug } = useParams<{ slug: string }>();
  const [sample, setSample] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [buyOpen, setBuyOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    fetch(`/api/store/samples?slug=${slug}`)
      .then(r => r.json())
      .then(d => { setSample(d.sample || null); setLoading(false); });
  }, [slug]);

  function togglePreview() {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <p style={{ color: 'var(--text-muted)' }}>Just now…</p>
    </div>
  );

  if (!sample) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <p style={{ color: 'var(--text-muted)' }}>Eish. This sample doesn't exist.</p>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-8">

          {/* Artwork */}
          <div className="md:w-64 flex-shrink-0">
            <div className="aspect-square rounded-2xl overflow-hidden flex items-center justify-center text-6xl"
              style={{ background: 'var(--surface2)' }}>
              {sample.artworkUrl
                ? <img src={sample.artworkUrl} className="w-full h-full object-cover" alt={sample.title} />
                : '🎹'}
            </div>

            {/* Preview player */}
            {sample.previewUrl && (
              <button onClick={togglePreview}
                className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                {playing ? <Pause size={16} /> : <Play size={16} />}
                {playing ? 'Pause Preview' : 'Play Preview'}
              </button>
            )}
            {sample.previewUrl && (
              <audio ref={audioRef} src={sample.previewUrl} onEnded={() => setPlaying(false)} />
            )}
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="text-xs font-bold mb-1 uppercase tracking-widest" style={{ color: 'var(--sky)' }}>
              Sample Pack
            </div>
            <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--text)' }}>{sample.title}</h1>
            <Link href={`/artist/${sample.artist?.slug}`} className="text-lg hover:underline mb-4 block" style={{ color: 'var(--sky)' }}>
              {sample.artist?.name}
            </Link>

            {/* Meta */}
            <div className="flex flex-wrap gap-3 mb-4">
              {sample.genre && (
                <span className="flex items-center gap-1.5 text-sm px-3 py-1 rounded-full"
                  style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                  <Tag size={12} /> {sample.genre}
                </span>
              )}
              {sample.bpm > 0 && (
                <span className="flex items-center gap-1.5 text-sm px-3 py-1 rounded-full"
                  style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                  <Music size={12} /> {sample.bpm} BPM
                </span>
              )}
              {sample.keySignature && (
                <span className="text-sm px-3 py-1 rounded-full"
                  style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                  Key: {sample.keySignature}
                </span>
              )}
              {sample.trackCount > 0 && (
                <span className="flex items-center gap-1.5 text-sm px-3 py-1 rounded-full"
                  style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                  <Package size={12} /> {sample.trackCount} {sample.trackCount === 1 ? 'file' : 'files'}
                </span>
              )}
            </div>

            {sample.description && (
              <p className="mb-6 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{sample.description}</p>
            )}

            {sample.tags?.length > 0 && (
              <div className="flex gap-2 mb-6 flex-wrap">
                {sample.tags.map((t: string) => (
                  <span key={t} className="text-xs px-2 py-1 rounded-full"
                    style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {/* Buy */}
            <button onClick={() => setBuyOpen(true)}
              className="flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-white text-lg"
              style={{ background: 'var(--sky)' }}>
              <ShoppingCart size={18} />
              Buy — R{sample.price}
            </button>
          </div>
        </div>
      </div>

      {buyOpen && sample && (
        <BuyModal item={sample} itemType="sample" onClose={() => setBuyOpen(false)} />
      )}
    </div>
  );
}
