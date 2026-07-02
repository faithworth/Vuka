// GET /api/og/plaque?artist=SLUG&tier=gold&dim=sales_units
// Generates a shareable SVG plaque card for social media.
// Returns image/svg+xml with caching headers.

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { tierMeta, dimensionLabel, THRESHOLDS } from '@/lib/plaques';

export const dynamic = 'force-dynamic';

const TIER_BG: Record<string, string> = {
  first_sale:     '#052e16',
  bronze:         '#1c0a00',
  silver:         '#111827',
  gold:           '#1c1400',
  platinum:       '#042f2e',
  diamond:        '#172554',
  multi_platinum: '#1e1b4b',
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artistSlug = searchParams.get('artist') ?? '';
  const tier       = searchParams.get('tier')   ?? 'bronze';
  const dim        = searchParams.get('dim')    ?? 'sales_units';

  const artist = await prisma.artist.findUnique({
    where:  { slug: artistSlug },
    select: { name: true, photoUrl: true },
  }).catch(() => null);

  const meta      = tierMeta(tier);
  const dimLabel  = dimensionLabel(dim);
  const milestone = THRESHOLDS[dim]?.find(t => t.tier === tier)?.milestone ?? 0;
  const bgColor   = TIER_BG[tier] ?? '#0f172a';

  function fmtNum(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
    return n.toString();
  }

  const milestoneLabel = dim === 'membership_revenue'
    ? `R${fmtNum(milestone)}`
    : `${fmtNum(milestone)} ${dimLabel}`;

  const artistName = artist?.name ?? 'Vuka Artist';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bgColor}"/>
      <stop offset="100%" stop-color="#0a0a0a"/>
    </linearGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${meta.color}" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="${meta.color}" stop-opacity="0"/>
    </linearGradient>
    <filter id="blur">
      <feGaussianBlur stdDeviation="40"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Glow circle -->
  <ellipse cx="600" cy="200" rx="300" ry="200" fill="${meta.color}" opacity="0.08" filter="url(#blur)"/>

  <!-- Border -->
  <rect x="2" y="2" width="1196" height="626" rx="24" ry="24"
    fill="none" stroke="${meta.color}" stroke-width="2" stroke-opacity="0.4"/>

  <!-- Vuka wordmark -->
  <text x="60" y="72" font-family="system-ui,sans-serif" font-weight="900"
    font-size="28" fill="white" opacity="0.9">Vuka</text>
  <text x="117" y="72" font-family="system-ui,sans-serif" font-weight="900"
    font-size="28" fill="${meta.color}">Music</text>

  <!-- Big emoji -->
  <text x="600" y="280" font-size="120" text-anchor="middle"
    dominant-baseline="middle">${meta.emoji}</text>

  <!-- Tier label -->
  <text x="600" y="380" font-family="system-ui,sans-serif" font-weight="900"
    font-size="52" text-anchor="middle" fill="${meta.color}" letter-spacing="2">
    ${meta.label.toUpperCase()}
  </text>

  <!-- Milestone label -->
  <text x="600" y="440" font-family="system-ui,sans-serif" font-weight="600"
    font-size="28" text-anchor="middle" fill="white" opacity="0.7">
    ${milestoneLabel}
  </text>

  <!-- Artist name -->
  <text x="600" y="530" font-family="system-ui,sans-serif" font-weight="800"
    font-size="36" text-anchor="middle" fill="white">
    ${artistName}
  </text>

  <!-- Bottom tagline -->
  <text x="600" y="588" font-family="system-ui,sans-serif" font-size="18"
    text-anchor="middle" fill="white" opacity="0.4">
    vukamusic.com
  </text>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
