
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendWelcome } from '@/lib/emails';
import { slugify } from '@/lib/utils';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';
import { z } from 'zod';

const registerSchema = z.object({
  name:      z.string().min(2).max(100).trim(),
  legalName: z.string().min(2).max(150).trim().optional(),
  email:     z.string().email().max(254).trim().toLowerCase(),
  role:      z.enum(['artist', 'producer', 'industry', 'fan']).default('fan'),
  slug:      z.string().max(60).optional(),
  company:   z.string().max(200).optional(),
  position:  z.string().max(100).optional(),
  ref:       z.string().max(30).optional(), // referral code from ?ref= param
}).refine(
  (data) => (data.role !== 'artist' && data.role !== 'producer') || !!data.legalName,
  { message: 'Legal name is required for artist and producer accounts (used to verify payouts).', path: ['legalName'] }
);

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

    const { name, legalName, email, role: rawRole, slug: rawSlug, company, position, ref } = parsed.data;
    const validRole = rawRole;

    // Validate referral code if provided (don't hard-fail — just ignore if invalid)
    let validatedRef: string | undefined;
    if (ref) {
      const referrer = await prisma.user.findUnique({ where: { referralCode: ref } });
      if (referrer) validatedRef = ref;
    }

    let user = await prisma.user.findUnique({
      where: { email },
      include: { artist: true, industryUser: true },
    });

    if (user) {
      // Only upgrade role — never downgrade an existing artist/industry/admin to a lower role.
      const ROLE_RANK: Record<string, number> = {
        owner: 100, super_admin: 90, admin: 80, moderator: 70,
        verified_artist: 60, artist: 50, producer: 50,
        industry: 40, fan: 10,
      };
      const existingRank = ROLE_RANK[user.role] ?? 0;
      const requestedRank = ROLE_RANK[validRole] ?? 0;

      // Backfill legalName if it's newly provided and wasn't already on file —
      // never overwrite an existing legalName silently.
      const legalNameUpdate = (legalName && !user.legalName) ? { legalName } : {};

      if (requestedRank > existingRank || Object.keys(legalNameUpdate).length > 0) {
        user = await prisma.user.update({
          where: { email },
          data: {
            ...(requestedRank > existingRank ? { role: validRole } : {}),
            ...legalNameUpdate,
          },
          include: { artist: true, industryUser: true },
        });
      }
      // else: keep existing role/legalName, fall through to Artist/IndustryUser record checks
    } else {
      user = await prisma.user.create({
        data: { name, legalName: legalName ?? null, email, role: validRole, referredBy: validatedRef ?? null },
        include: { artist: true, industryUser: true },
      });
    }

    // Ensure Artist record exists for artist role
    // Note: `name` here is intentionally the public stage name — it is
    // separate from User.legalName, which is the payout/KYC identity.
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
