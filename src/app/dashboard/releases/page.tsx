'use client';
import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';
import { Plus, ExternalLink, Music } from 'lucide-react';

export default function DashboardReleasesPage() {
  const [releases, setReleases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/releases')
      .then(r => r.json())
      .then(d => setReleases(Array.isArray(d.releases) ? d.releases : []))
      .catch(() => setReleases([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>My Releases</h1>
        <Link href="/dashboard/uploads"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white"
          style={{ background: 'var(--purple)' }}>
          <Plus className="w-4 h-4" /> Upload Release
        </Link>
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Just now…</p>}

      {!loading && releases.length === 0 && (
        <div className="text-center py-20 rounded-2xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <Music className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--purple-light)' }} />
          <p className="font-bold mb-2" style={{ color: 'var(--text)' }}>Nothing here yet, go create</p>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Upload your first EP, album or single.</p>
          <Link href="/dashboard/uploads" className="px-4 py-2 rounded-lg font-bold text-white inline-block"
            style={{ background: 'var(--purple)' }}>Upload Now</Link>
        </div>
      )}

      <div className="space-y-3">
        {releases.map((release: any) => (
          <div key={release.id} className="flex items-center gap-4 p-4 rounded-xl border"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center text-2xl"
              style={{ background: 'var(--surface2)' }}>
              {release.artworkUrl ? <img src={release.artworkUrl} className="w-full h-full object-cover" alt={release.title} /> : '🎵'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-sm" style={{ color: 'var(--text)' }}>{release.title}</span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--purple-light)' }}>
                  {release.releaseType}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${release.isActive ? 'text-green-400' : 'text-red-400'}`}
                  style={{ background: 'var(--surface2)' }}>
                  {release.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {release.tracks?.length || 0} tracks · {release.plays} plays · {release.sales} sales · {formatCurrency(release.price)}
              </div>
            </div>
            <Link href={`/release/${release.slug}`} target="_blank"
              className="p-2 rounded-lg" style={{ color: 'var(--purple-light)' }}>
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
