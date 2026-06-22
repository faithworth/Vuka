'use client';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { usePlayer, PreviewPlayButton, type PreviewTrack } from '@/components/NowPlayingBar';

interface ReleaseTrack { id: string; previewUrl?: string | null }
interface Release {
  id: string;
  slug?: string | null;
  _isDistrib?: boolean;
  title: string;
  releaseType: string;
  price: number;
  minPrice?: number;
  payWhatWant?: boolean;
  artworkUrl: string;
  tracks?: ReleaseTrack[];
  artist: { name: string; slug: string };
}

export function ReleaseCard({ release, wishlisted = false, onWishlist }: {
  release: Release;
  wishlisted?: boolean;
  onWishlist?: (e: React.MouseEvent) => void;
}) {
  const { isTrackPlaying } = usePlayer();
  const isPlaying = isTrackPlaying(release.id);
  const href = release._isDistrib ? `/releases/${release.id}` : `/release/${release.slug}`;
  const previewUrl = release.tracks?.find(t => t.previewUrl)?.previewUrl || '';

  const track: PreviewTrack = {
    id: release.id,
    title: release.title,
    artist: release.artist.name,
    artworkUrl: release.artworkUrl,
    previewUrl,
    href,
    type: 'release',
  };

  return (
    <div
      className="group relative rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
        boxShadow: isPlaying ? '0 0 0 1px var(--color-accent-green), 0 12px 36px rgba(160,232,124,0.16)' : '0 1px 2px rgba(0,0,0,0.4)',
      }}
      onMouseEnter={e => { if (!isPlaying) (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border-strong)'; }}
      onMouseLeave={e => { if (!isPlaying) (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border)'; }}
    >
      <div className="relative aspect-square overflow-hidden" style={{ background: 'var(--color-bg-tertiary)' }}>
        <Link href={href} className="absolute inset-0">
          {release.artworkUrl ? (
            <img src={release.artworkUrl} alt={release.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-6xl" style={{ background: 'var(--color-bg-tertiary)' }}>🎶</div>
          )}
        </Link>

        <div className="absolute inset-x-0 bottom-0 h-16 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent)' }} />

        {release.releaseType && (
          <span
            className="absolute top-2.5 left-2.5 text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider"
            style={{ background: 'rgba(10,10,10,0.65)', backdropFilter: 'blur(6px)', color: '#fff', fontFamily: 'var(--font-mono)' }}
          >
            {release.releaseType}
          </span>
        )}

        {onWishlist && (
          <button
            onClick={onWishlist}
            className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            style={{ background: wishlisted ? 'var(--color-accent-gold)' : 'rgba(10,10,10,0.6)', backdropFilter: 'blur(6px)' }}
            title={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          >
            <Heart size={13} className={wishlisted ? 'fill-black text-black' : 'text-white'} />
          </button>
        )}

        {previewUrl && (
          <div className="absolute -bottom-5 left-3 z-10">
            <PreviewPlayButton track={track} size={48} />
          </div>
        )}

        {isPlaying && (
          <span
            className="absolute bottom-2 right-2.5 text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(10,10,10,0.7)', color: 'var(--color-accent-green)', fontFamily: 'var(--font-mono)' }}
          >
            0:30 preview
          </span>
        )}
      </div>

      <div className={`px-4 pb-4 ${previewUrl ? 'pt-7' : 'pt-4'}`}>
        <Link href={href}>
          <h3
            className="font-bold text-[15px] truncate leading-tight transition-colors"
            style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent-green)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
          >
            {release.title}
          </h3>
        </Link>
        <Link href={`/artist/${release.artist.slug}`} className="text-xs transition-colors" style={{ color: 'var(--color-text-secondary)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent-green)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-secondary)')}>
          {release.artist.name}
        </Link>

        <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <div>
            <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
              {release.payWhatWant ? 'From' : 'Price'}
            </p>
            <span className="font-black text-base" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
              {release.payWhatWant ? `R${release.minPrice}` : release.price === 0 ? 'Free' : `R${release.price}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
