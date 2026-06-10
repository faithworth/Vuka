// src/app/api/industry/profile/route.ts
// GET  → return current industry user profile
// PATCH → update companyName, role (position), website

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const user = await getServerUser();
    if (!user || user.role !== 'industry') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const iu = await prisma.industryUser.findUnique({
      where: { userId: user.id },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!iu) return NextResponse.json({ error: 'Industry profile not found' }, { status: 404 });
    return NextResponse.json({ profile: iu });
  } catch (err) {
    console.error('[industry/profile GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user || user.role !== 'industry') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const iu = await prisma.industryUser.findUnique({ where: { userId: user.id } });
    if (!iu) return NextResponse.json({ error: 'Industry profile not found' }, { status: 404 });

    const { companyName, role: position, website, name } = await req.json();

    // Update IndustryUser fields
    const updated = await prisma.industryUser.update({
      where: { id: iu.id },
      data: {
        ...(companyName !== undefined && { companyName: companyName.trim() }),
        ...(position !== undefined    && { role: position.trim() }),
        ...(website !== undefined     && { website: website.trim() }),
      },
    });

    // Optionally update the User display name
    if (name?.trim()) {
      await prisma.user.update({
        where: { id: user.id },
        data: { name: name.trim() },
      });
    }

    return NextResponse.json({ profile: updated });
  } catch (err) {
    console.error('[industry/profile PATCH]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
