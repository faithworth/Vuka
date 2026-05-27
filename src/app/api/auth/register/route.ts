import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendWelcomeArtist } from '@/lib/emails';
import { slugify } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    const { name, email, role, slug: rawSlug, company, position } = await req.json();
    if (!name || !email) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    // Idempotent — safe to call multiple times
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ ok: true, userId: existing.id });

    const user = await prisma.user.create({
      data: { name, email, role: role || 'fan' },
    });

    if (role === 'artist' || role === 'producer') {
      let slug = slugify(rawSlug || name);
      let suffix = 0;
      while (await prisma.artist.findUnique({ where: { slug } })) {
        suffix++;
        slug = `${slugify(rawSlug || name)}-${suffix}`;
      }
      await prisma.artist.create({
        data: { userId: user.id, name, slug, country: 'ZA', currency: 'ZAR' },
      });
      sendWelcomeArtist({ to: email, name, slug }).catch(console.error);
    }

    if (role === 'industry') {
      await prisma.industryUser.create({
        data: {
          userId: user.id,
          company: company || '',
          position: position || '',
        },
      });
    }

    return NextResponse.json({ ok: true, userId: user.id });
  } catch (err) {
    console.error('register error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
