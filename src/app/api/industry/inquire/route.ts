// src/app/api/industry/inquire/route.ts
// POST — artist sends an inquiry to an industry service listing.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { checkFeatureCap, countIndustryInquiriesThisMonth } from '@/lib/planGates';

export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const artist = await prisma.artist.findUnique({ where: { userId: user.id } });
    if (!artist) return NextResponse.json({ error: 'Artist profile required' }, { status: 403 });

    // Free-tier cap: 5 industry inquiries per calendar month. Pro/Label unlimited.
    const inquiriesThisMonth = await countIndustryInquiriesThisMonth(artist.id);
    const capCheck = await checkFeatureCap(artist.id, 'industryInquiriesPerMonth', inquiriesThisMonth);
    if (!capCheck.ok) return capCheck.response;

    const { serviceId, message } = await req.json();
    if (!serviceId) return NextResponse.json({ error: 'serviceId required' }, { status: 400 });

    const service = await prisma.industryService.findUnique({
      where: { id: serviceId },
      include: { industryUser: { include: { user: true } } },
    });
    if (!service || !service.isActive) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    // Prevent duplicate inquiry
    const existing = await prisma.serviceInquiry.findFirst({
      where: { serviceId, artistId: artist.id, status: 'pending' },
    });
    if (existing) {
      return NextResponse.json({ error: 'You already have a pending inquiry for this service' }, { status: 409 });
    }

    const inquiry = await prisma.serviceInquiry.create({
      data: {
        serviceId,
        artistId: artist.id,
        name: user.name,
        email: user.email,
        message: message?.trim() || '',
        status: 'pending',
      },
    });

    return NextResponse.json({ ok: true, inquiry });
  } catch (err) {
    console.error('[industry/inquire POST]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user || user.role !== 'industry') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { inquiryId, status } = await req.json();
    if (!inquiryId || !['accepted', 'rejected', 'completed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const iu = await prisma.industryUser.findUnique({ where: { userId: user.id } });
    if (!iu) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Confirm the inquiry belongs to one of this industry user's services
    const inquiry = await prisma.serviceInquiry.findFirst({
      where: {
        id: inquiryId,
        industryService: { industryUserId: iu.id },
      },
    });
    if (!inquiry) return NextResponse.json({ error: 'Inquiry not found' }, { status: 404 });

    const updated = await prisma.serviceInquiry.update({
      where: { id: inquiryId },
      data: { status },
    });

    return NextResponse.json({ ok: true, inquiry: updated });
  } catch (err) {
    console.error('[industry/inquire PATCH]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
