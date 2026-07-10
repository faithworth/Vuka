export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { slugify } from '@/lib/utils';

/**
 * Generate a unique slug from a display name, avoiding collisions with any
 * artist's current slug OR any slug still recorded in history (so a freed-up
 * old slug can't silently steal traffic meant for whoever holds it now).
 */
async function generateUniqueSlug(name: string, currentArtistId: string): Promise<string> {
  const base = slugify(name) || 'artist';
  let candidate = base;
  let suffix = 2;
  while (true) {
    const [takenBySlug, takenByHistory] = await Promise.all([
      prisma.artist.findFirst({ where: { slug: candidate, id: { not: currentArtistId } }, select: { id: true } }),
      prisma.artistSlugHistory.findUnique({ where: { oldSlug: candidate }, select: { id: true } }),
    ]);
    if (!takenBySlug && !takenByHistory) return candidate;
    candidate = `${base}-${suffix}`;
    suffix++;
  }
}

export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const artist = await prisma.artist.findUnique({
      where: { id: user.artist.id },
      include: { user: { select: { email: true, name: true } } },
    });
    return NextResponse.json({ artist, role: user.role });
  } catch (err) {
    console.error('[settings] GET error:', err);
    return NextResponse.json({ error: 'Database error', artist: null }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { name, bio, city, country, genreTags, photoUrl, coverUrl, socialLinks, currency, paystackRecipient } = body;

    // Fetch current name/slug so we can detect a real change and know what
    // to preserve in history — comparing against the client-sent value
    // isn't enough since it could've been sent unchanged.
    const current = await prisma.artist.findUnique({
      where: { id: user.artist.id },
      select: { name: true, slug: true },
    });

    let newSlug: string | undefined;
    const nameChanged = name && current && name.trim() && name.trim() !== current.name;
    if (nameChanged && current) {
      newSlug = await generateUniqueSlug(name.trim(), user.artist.id);
    }

    // Use a transaction so the slug history write and the artist update
    // either both succeed or both roll back — never end up with an
    // orphaned history row pointing at an unchanged slug, or vice versa.
    const artist = await prisma.$transaction(async (tx) => {
      if (newSlug && current) {
        await tx.artistSlugHistory.create({
          data: { id: `slughist_${Date.now()}`, artistId: user.artist!.id, oldSlug: current.slug },
        });
      }
      return tx.artist.update({
        where: { id: user.artist!.id },
        data: {
          name: name || undefined,
          ...(newSlug && { slug: newSlug }),
          bio: bio !== undefined ? bio : undefined,
          city: city !== undefined ? city : undefined,
          country: country || undefined,
          genreTags: genreTags || undefined,
          photoUrl: photoUrl !== undefined ? photoUrl : undefined,
          coverUrl: coverUrl !== undefined ? coverUrl : undefined,
          socialLinks: socialLinks ? JSON.parse(JSON.stringify(socialLinks)) : undefined,
          currency: currency || undefined,
          // Allow saving empty string to clear, or a real value
          ...(paystackRecipient !== undefined && { paystackRecipient: paystackRecipient.trim() || null }),
        },
      });
    });

    return NextResponse.json({ artist, slugChanged: !!newSlug });
  } catch (err) {
    console.error('[settings] PATCH error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 503 });
  }
}
