'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { BuyModal } from '@/components/BuyModal';
import { Play, Pause, ShoppingCart, Calendar, Tag } from 'lucide-react';
import Link from 'next/link';

export default function VideoPage() {
  const { slug } = useParams<{ slug: string }>();
  const [video, setVideo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [buyOpen, setBuyOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playedRef = useRef(false);

  useEffect(() => {
    fetch(`/api/store/videos?slug=${slug}`)
      .then(r => r.json())
      .then(d => { setVideo(d.video || null); setLoading(false); });
  }, [slug]);

  function togglePlay() {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
      setPlaying(false);
    } else {
      videoRef.current.play();
      setPlaying(true);
      if (!playedRef.current) {
        playedRef.current = true;
        fetch('/api/play', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: video.id, itemType: 'video' }),
        }).catch(() => {});
      }
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <p style={{ color: 'var(--text-muted)' }}>Just now…</p>
    </div>
  );

  if (!video) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <p style={{ color: 'var(--text-muted)' }}>Eish. This video doesn't exist.</p>
    </div>
  );

  const isFree = !video.price || video.price === 0;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Video player */}
        <div className="relative w-full rounded-2xl overflow-hidden mb-6"
          style={{ background: 'var(--surface2)', aspectRatio: '16/9' }}>
          {isFree ? (
            <>
              <video
                ref={videoRef}
                src={video.videoUrl}
                poster={video.thumbnailUrl || undefined}
                className="w-full h-full object-cover"
                onEnded={() => setPlaying(false)}
                playsInline
              />
              <button onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center"
                style={{ background: playing ? 'transparent' : 'rgba(0,0,0,0.4)' }}>
                {!playing && (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>
                    <Play size={28} color="white" fill="white" />
                  </div>
                )}
              </button>
            </>
          ) : (
            /* Paid — show thumbnail + lock overlay */
            <>
              {video.thumbnailUrl
                ? <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-6xl">🎬</div>}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4"
                style={{ background: 'rgba(0,0,0,0.6)' }}>
                <p className="text-white font-bold text-lg">Purchase to watch</p>
                <button onClick={() => setBuyOpen(true)}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white"
                  style={{ background: 'var(--sky)' }}>
                  <ShoppingCart size={16} />
                  Buy for R{video.price}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1">
            <div className="text-xs font-bold mb-1 uppercase tracking-widest" style={{ color: 'var(--sky)' }}>
              Music Video
            </div>
            <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--text)' }}>{video.title}</h1>
            <Link href={`/artist/${video.artist?.slug}`} className="text-lg hover:underline mb-3 block" style={{ color: 'var(--sky)' }}>
              {video.artist?.name}
            </Link>

            {video.genre && (
              <div className="flex items-center gap-2 text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
                <Tag size={13} /> {video.genre}
              </div>
            )}
            {video.createdAt && (
              <div className="flex items-center gap-2 text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                <Calendar size={13} />
                {new Date(video.createdAt).toLocaleDateString('en-ZA')}
              </div>
            )}
            {video.description && (
              <p className="leading-relaxed" style={{ color: 'var(--text-muted)' }}>{video.description}</p>
            )}
            {video.tags?.length > 0 && (
              <div className="flex gap-2 mt-3 flex-wrap">
                {video.tags.map((t: string) => (
                  <span key={t} className="text-xs px-2 py-1 rounded-full"
                    style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Buy button for paid videos */}
          {!isFree && (
            <div className="flex-shrink-0">
              <button onClick={() => setBuyOpen(true)}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white"
                style={{ background: 'var(--sky)' }}>
                <ShoppingCart size={16} />
                Buy — R{video.price}
              </button>
            </div>
          )}
        </div>
      </div>

      {buyOpen && video && (
        <BuyModal item={video} itemType="video" onClose={() => setBuyOpen(false)} />
      )}
    </div>
  );
}
