// GET /api/dashboard/plaques/pdf?tier=gold&dim=streams
// Downloads a printable certificate-style PDF for a plaque the logged-in
// artist has actually earned — verified against their own ArtistPlaque
// records first, so this can't be used to mint a certificate for a
// milestone they haven't hit.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { tierMeta, dimensionLabel } from '@/lib/plaques';
import { generatePlaqueCertificatePDF } from '@/lib/plaquePdf';

export async function GET(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const tier = searchParams.get('tier') ?? '';
    const dim  = searchParams.get('dim')  ?? '';

    const plaque = await prisma.artistPlaque.findUnique({
      where: { artistId_tier_dimension: { artistId: user.artist.id, tier, dimension: dim } },
    });
    if (!plaque) {
      return NextResponse.json({ error: "You haven't earned this plaque yet" }, { status: 403 });
    }

    const meta = tierMeta(tier);
    const dimLabel = dimensionLabel(dim);
    const milestoneValue = dim === 'membership_revenue'
      ? `R${plaque.milestone >= 1000 ? (plaque.milestone / 1000).toFixed(0) + 'K' : plaque.milestone}`
      : (plaque.milestone >= 1_000_000 ? (plaque.milestone / 1_000_000).toFixed(1) + 'M'
        : plaque.milestone >= 1_000 ? (plaque.milestone / 1_000).toFixed(0) + 'K'
        : plaque.milestone.toString());

    const pdfBuffer = await generatePlaqueCertificatePDF({
      artistName: user.artist.name,
      tierLabel: meta.label,
      tierColorHex: meta.color,
      milestoneValue,
      dimensionLabel: dimLabel,
      earnedAt: plaque.earnedAt,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="vuka-${tier}-${dim}-certificate.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('[plaques/pdf] error:', err);
    return NextResponse.json({ error: 'Failed to generate certificate' }, { status: 500 });
  }
}
