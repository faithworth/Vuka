import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendWelcome } from '@/lib/emails';
import { slugify } from '@/lib/utils';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';
import { z } from 'zod';

const registerSchema = z.object({
  name:     z.string().min(2).max(100).trim(),
  email:    z.string().email().max(254).trim().toLowerCase(),
  role:     z.enum(['artist', 'producer', 'industry', 'fan']).default('fan'),
  slug:     z.string().max(60).optional(),
  company:  z.string().max(200).optional(),
  position: z.string().max(100).optional(),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);

  // Rate limit by IP (userId not known yet at registration)
  const limited = await rateLimit(ip, RATE_LIMITS.register, ip);
  if (limited) {
    return NextResponse.json({ error: 'Too many registration attempts. Please wait before trying again.' }, { status: 429 });
  }

  try {
    const raw = await req.json();
    const parsed = registerSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Validation failed' },
        { status: 400 }
      );
    }

    const { name, email, role: rawRole, slug: rawSlug, company, position } = parsed.data;
    const validRole = rawRole;

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
      sendWelcome({
        to: email,
        displayName: name,
        verifyUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
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
