import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendWelcomeArtist } from '@/lib/emails';
import { slugify } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    const { name, email, role, slug: rawSlug } = await req.json();
    if (!name || !email) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    // Check if user already exists (idempotent)
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ ok: true, userId: existing.id });

    const user = await prisma.user.create({
      data: { name, email, role: role || 'fan' },
    });

    if (role === 'artist' || role === 'producer') {
      // Generate unique slug
      let slug = slugify(rawSlug || name);
      let suffix = 0;
      while (await prisma.artist.findUnique({ where: { slug } })) {
        suffix++;
        slug = `${slugify(rawSlug || name)}-${suffix}`;
      }

      await prisma.artist.create({
        data: {
          userId: user.id,
          name,
          slug,
          country: 'ZA',
          currency: 'ZAR',
        },
      });

      // Send welcome email (non-blocking)
      sendWelcomeArtist({ to: email, name, slug }).catch(console.error);
    }

    return NextResponse.json({ ok: true, userId: user.id });
  } catch (err) {
    console.error('register error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
