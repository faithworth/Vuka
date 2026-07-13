// GET /api/og/plaque?artist=SLUG&tier=gold&dim=streams&format=square|wide
// Generates a real, shareable PNG achievement plaque — designed to be
// downloaded and posted directly to Instagram/Twitter/etc, not just linked.
//
// Renders via next/og's ImageResponse (Satori under the hood) rather than
// hand-written SVG text, so the output is an actual raster PNG that every
// social platform accepts on upload — the previous version returned raw
// image/svg+xml, which most platforms silently reject or strip on repost.

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { tierMeta, dimensionLabel, THRESHOLDS } from '@/lib/plaques';

export const dynamic = 'force-dynamic';

const TIER_GRADIENT: Record<string, [string, string]> = {
  first_sale:     ['#0a2e1a', '#052e16'],
  bronze:         ['#3d1f06', '#1c0a00'],
  silver:         ['#26272b', '#111827'],
  gold:           ['#3d3000', '#1c1400'],
  platinum:       ['#0a3d3a', '#042f2e'],
  diamond:        ['#1e3a6e', '#172554'],
  multi_platinum: ['#2e2867', '#1e1b4b'],
};

// Foil-style two-tone text gradient for the premium tiers — flat colour
// for the earlier tiers still reads fine, foil is reserved for the tiers
// worth showing off the hardest.
const FOIL_TIERS = new Set(['platinum', 'diamond', 'multi_platinum']);

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artistSlug = searchParams.get('artist') ?? '';
  const tier       = searchParams.get('tier')   ?? 'bronze';
  const dim        = searchParams.get('dim')    ?? 'sales_units';
  // square = Instagram-feed-ready (default); wide = link-preview / Twitter card
  const format     = searchParams.get('format') === 'wide' ? 'wide' : 'square';

  const artist = await prisma.artist.findUnique({
    where:  { slug: artistSlug },
    select: { name: true, photoUrl: true },
  }).catch(() => null);

  const meta      = tierMeta(tier);
  const dimLabel  = dimensionLabel(dim);
  const milestone = THRESHOLDS[dim]?.find(t => t.tier === tier)?.milestone ?? 0;
  const [gradTop, gradBottom] = TIER_GRADIENT[tier] ?? ['#1a1a1a', '#0a0a0a'];
  const isFoil = FOIL_TIERS.has(tier);

  const milestoneValue = dim === 'membership_revenue' ? `R${fmtNum(milestone)}` : fmtNum(milestone);
  const artistName = artist?.name ?? 'Vuka Music Artist';

  const W = format === 'wide' ? 1200 : 1080;
  const H = format === 'wide' ? 630  : 1080;

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        position: 'relative', background: `linear-gradient(160deg, ${gradTop}, ${gradBottom})`,
      }}>
        {/* Ambient glow behind the badge */}
        <div style={{
          position: 'absolute', top: format === 'wide' ? 40 : 90, left: '50%',
          transform: 'translateX(-50%)', width: 520, height: 520, borderRadius: 9999,
          background: meta.color, opacity: 0.16, filter: 'blur(90px)', display: 'flex',
        }} />

        {/* Outer frame */}
        <div style={{
          position: 'absolute', inset: 18, borderRadius: 28,
          border: `2px solid ${meta.color}66`, display: 'flex',
        }} />
        <div style={{
          position: 'absolute', inset: 30, borderRadius: 22,
          border: `1px solid ${meta.color}30`, display: 'flex',
        }} />

        {/* Header: Vuka wordmark */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: format === 'wide' ? '44px 56px 0' : '56px 60px 0',
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9999, border: `2px solid ${meta.color}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 900, color: meta.color,
          }}>V</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'white', opacity: 0.92, display: 'flex' }}>
            VUKA <span style={{ color: meta.color, marginLeft: 6 }}>MUSIC</span>
          </div>
        </div>

        {/* Main content, centered */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 18,
          padding: '0 60px',
        }}>
          {/* Medallion */}
          <div style={{
            width: 168, height: 168, borderRadius: 9999, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: `radial-gradient(circle at 35% 30%, ${meta.color}55, ${meta.color}10 70%)`,
            border: `3px solid ${meta.color}`,
            boxShadow: `0 0 0 8px ${meta.color}15`,
          }}>
            {artist?.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={artist.photoUrl}
                width={140} height={140}
                style={{ borderRadius: 9999, objectFit: 'cover', border: `2px solid ${meta.color}` }}
              />
            ) : (
              <div style={{ fontSize: 72, display: 'flex' }}>{meta.emoji}</div>
            )}
          </div>

          {/* Tier label */}
          <div style={{
            fontSize: format === 'wide' ? 46 : 52, fontWeight: 900, letterSpacing: 3,
            backgroundImage: isFoil ? `linear-gradient(100deg, ${meta.color}, #ffffff, ${meta.color})` : undefined,
            backgroundClip: isFoil ? 'text' : undefined,
            color: isFoil ? 'transparent' : meta.color,
            display: 'flex', textTransform: 'uppercase',
          }}>
            {meta.label}
          </div>

          {/* Big milestone number */}
          <div style={{ fontSize: format === 'wide' ? 76 : 92, fontWeight: 900, color: 'white', display: 'flex', lineHeight: 1 }}>
            {milestoneValue}
          </div>
          <div style={{
            fontSize: 26, fontWeight: 700, color: 'white', opacity: 0.65,
            letterSpacing: 4, textTransform: 'uppercase', display: 'flex', marginTop: -8,
          }}>
            {dimLabel}
          </div>

          {/* Artist name */}
          <div style={{
            marginTop: 20, fontSize: 40, fontWeight: 800, color: 'white',
            display: 'flex', textAlign: 'center',
          }}>
            {artistName}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          paddingBottom: format === 'wide' ? 34 : 48, gap: 8,
        }}>
          <div style={{ fontSize: 18, color: 'white', opacity: 0.45, display: 'flex' }}>
            vukamusic.com
          </div>
          <div style={{ width: 4, height: 4, borderRadius: 9999, background: 'white', opacity: 0.3, display: 'flex' }} />
          <div style={{ fontSize: 18, color: 'white', opacity: 0.45, display: 'flex' }}>
            Certified Achievement
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    },
  );
}
