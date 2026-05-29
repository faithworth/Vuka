import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendWelcomeArtist } from '@/lib/emails';
import { slugify } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    const { name, email, role, slug: rawSlug, company, position } = await req.json();
    if (!name || !email) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const validRole = ['artist', 'producer', 'industry', 'fan'].includes(role) ? role : 'fan';

    let user = await prisma.user.findUnique({
      where: { email },
      include: { artist: true, industryUser: true },
    });

    if (user) {
      // Always update the role if it changed — never silently ignore
      if (user.role !== validRole) {
        user = await prisma.user.update({
          where: { email },
          data: { role: validRole },
          include: { artist: true, industryUser: true },
        });
      }
    } else {
      user = await prisma.user.create({
        data: { name, email, role: validRole },
        include: { artist: true, industryUser: true },
      });
    }

    // Ensure Artist record exists for artist role
    if ((validRole === 'artist' || validRole === 'producer') && !user.artist) {
      let slug = slugify(rawSlug || name);
      let suffix = 0;
      while (await prisma.artist.findUnique({ where: { slug } })) {
        suffix++;
        slug = `${slugify(rawSlug || name)}-${suffix}`;
      }
      await prisma.artist.create({
        data: { userId: user.id, name, slug, country: 'ZA', currency: 'ZAR' },
      });
      sendWelcomeArtist({
        to: email,
        artistName: name,
        dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      }).catch(console.error);
    }

    // Ensure IndustryUser record exists for industry role
    if (validRole === 'industry' && !user.industryUser) {
      await prisma.industryUser.create({
        data: {
          userId: user.id,
          companyName: company || '',
          role: position || '',
        },
      });
    }

    return NextResponse.json({ ok: true, userId: user.id });
  } catch (err) {
    console.error('register error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
