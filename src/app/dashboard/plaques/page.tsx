'use client';
// src/app/dashboard/plaques/page.tsx
// Artist achievements dashboard — multi-dimensional milestone plaques.

import { useEffect, useState } from 'react';
import { Loader2, Share2, Copy, Check, Trophy, TrendingUp } from 'lucide-react';

const DIMENSION_ICONS: Record<string, string> = {
  sales_units:        '🛒',
  follower_count:     '👥',
  membership_revenue: '💳',
  streams:            '▶️',
};

interface PlaqueMeta { label: string; color: string; emoji: string }
interface Plaque {
  id: string; tier: string; dimension: string;
  milestone: number; shareableUrl: string; earnedAt: string;
  meta: PlaqueMeta; dimensionLabel: string;
}
interface Progress {
  dimension: string; label: string; current: number;
  next: { tier: string; milestone: number } | null; pct: number;
}
interface Data {
  plaques: Plaque[]; metrics: Record<string, number>;
  progress: Progress[]; totalPlaques: number; highestTier: string | null;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function fmtRand(n: number): string {
  return `R${n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toFixed(0)}`;
}

function fmtMetric(dim: string, val: number): string {
  return dim === 'membership_revenue' ? fmtRand(val) : fmt(val);
}

export default function PlaquesPage() {
  const [data, setData]     = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/plaques');
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function copyLink(url: string, id: string) {
    await navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  async function shareLink(url: string, tier: string, dim: string) {
    const text = `I just earned the ${tier.replace('_', ' ')} plaque on Vuka Music — ${dim.replace('_', ' ')} milestone 🏆`;
    if (navigator.share) {
      await navigator.share({ title: 'Vuka Music Plaque', text, url });
    } else {
      copyLink(url, tier + dim);
    }
  }

  if (loading) {
    return (
      <div className="p-10 flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={18} className="animate-spin" /> Loading achievements…
      </div>
    );
  }

  if (!data) {
    return <div className="p-10" style={{ color: 'var(--text-muted)' }}>Failed to load. Please refresh.</div>;
  }

  const { plaques, progress, totalPlaques, highestTier } = data;

  // Group plaques by dimension
  const byDimension: Record<string, Plaque[]> = {};
  for (const p of plaques) {
    if (!byDimension[p.dimension]) byDimension[p.dimension] = [];
    byDimension[p.dimension].push(p);
  }

  return (
    <div className="p-6 md:p-10 max-w-3xl">

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(212,160,0,0.12)', border: '1px solid rgba(212,160,0,0.25)' }}>
          <Trophy size={22} style={{ color: 'var(--gold)' }} />
        </div>
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>Achievements</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {totalPlaques === 0
              ? 'Make your first sale to earn your first plaque. Every milestone is shareable.'
              : `${totalPlaques} plaque${totalPlaques !== 1 ? 's' : ''} earned across sales, streams, fans and memberships.`}
          </p>
        </div>
      </div>

      {/* Summary row */}
      {totalPlaques > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="p-4 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="text-2xl font-black" style={{ color: 'var(--gold)' }}>{totalPlaques}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Total Plaques</div>
          </div>
          <div className="p-4 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="text-2xl font-black capitalize" style={{ color: 'var(--text)' }}>
              {highestTier?.replace('_', ' ') ?? '—'}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Highest Tier</div>
          </div>
        </div>
      )}

      {/* Progress section */}
      <div className="mb-8">
        <h2 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <TrendingUp size={15} style={{ color: 'var(--sky)' }} /> Progress
        </h2>
        <div className="space-y-3">
          {progress.map(p => (
            <div key={p.dimension} className="p-4 rounded-2xl"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">{DIMENSION_ICONS[p.dimension] ?? '📊'}</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>{p.label}</span>
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {p.next
                    ? <>{fmtMetric(p.dimension, p.current)} / {fmtMetric(p.dimension, p.next.milestone)}</>
                    : <span style={{ color: 'var(--green)' }}>All milestones earned ✓</span>}
                </div>
              </div>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${p.pct}%`,
                    background: p.pct >= 100
                      ? 'linear-gradient(90deg,#10b981,#22c55e)'
                      : 'linear-gradient(90deg,#d4a000,#f59e0b)',
                  }} />
              </div>
              {p.next && (
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  Next: <span className="capitalize font-semibold" style={{ color: 'var(--text)' }}>
                    {p.next.tier.replace('_', ' ')}
                  </span>
                  {' '}at {fmtMetric(p.dimension, p.next.milestone)}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Plaque Gallery */}
      {totalPlaques > 0 && (
        <div>
          <h2 className="text-sm font-bold mb-4" style={{ color: 'var(--text)' }}>🏆 Plaque Gallery</h2>
          <div className="space-y-6">
            {Object.entries(byDimension).map(([dimension, dimPlaques]) => (
              <div key={dimension}>
                <p className="text-xs font-bold mb-3 flex items-center gap-1.5"
                  style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {DIMENSION_ICONS[dimension] ?? '📊'} {dimPlaques[0]?.dimensionLabel ?? dimension}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {dimPlaques.map(plaque => (
                    <div key={plaque.id} className="p-4 rounded-2xl relative overflow-hidden group"
                      style={{
                        background: `linear-gradient(135deg, ${plaque.meta.color}18, ${plaque.meta.color}08)`,
                        border: `1px solid ${plaque.meta.color}40`,
                      }}>
                      {/* Glow */}
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{ background: `radial-gradient(circle at center, ${plaque.meta.color}12, transparent 70%)` }} />

                      <div className="relative">
                        <div className="text-3xl mb-2">{plaque.meta.emoji}</div>
                        <div className="text-sm font-black capitalize mb-0.5"
                          style={{ color: plaque.meta.color }}>
                          {plaque.meta.label}
                        </div>
                        <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                          {fmtMetric(plaque.dimension, plaque.milestone)} {plaque.dimensionLabel}
                        </div>
                        <div className="text-xs mb-3" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                          {new Date(plaque.earnedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>

                        {/* Share controls */}
                        <div className="flex gap-1.5">
                          <button onClick={() => shareLink(plaque.shareableUrl, plaque.tier, plaque.dimension)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-semibold"
                            style={{ background: `${plaque.meta.color}20`, color: plaque.meta.color }}>
                            <Share2 size={11} /> Share
                          </button>
                          <button onClick={() => copyLink(plaque.shareableUrl, plaque.id)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg"
                            style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                            {copied === plaque.id ? <Check size={11} /> : <Copy size={11} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {totalPlaques === 0 && (
        <div className="text-center py-16 px-6 rounded-2xl"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-5xl mb-4">🏆</div>
          <h3 className="text-lg font-black mb-2" style={{ color: 'var(--text)' }}>No plaques yet</h3>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            Make your first sale to earn your First Sale plaque.<br />
            Every milestone earns a shareable achievement you can post.
          </p>
          <a href="/dashboard/releases/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white"
            style={{ background: 'linear-gradient(135deg,#d4a000,#b38600)' }}>
            Upload Music
          </a>
        </div>
      )}
    </div>
  );
}
