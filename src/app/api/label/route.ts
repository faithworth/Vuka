export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { slugify } from '@/lib/utils';
import { requirePlanAtLeast } from '@/lib/planGates';

async function requireLabelPlan() {
  const user = await requireArtist();
  if (!user) return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!user.artist) return { user: null, error: NextResponse.json({ error: 'Artist profile required' }, { status: 403 }) };
  const gate = await requirePlanAtLeast(user.artist.id, 'label');
  if (!gate.ok) return { user: null, error: gate.response };
  return { user, error: null };
}

export async function GET() {
  const { user, error } = await requireLabelPlan();
  if (error) return error;
  const label = await prisma.label.findUnique({
    where: { ownerId: user!.id },
    include: {
      roster: {
        include: { artist: { select: { id: true, name: true, slug: true, photoUrl: true, planSlug: true, lifetimeGrossSales: true } } },
        orderBy: { createdAt: 'asc' },
      },
      teamMembers: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  return NextResponse.json({ label });
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireLabelPlan();
  if (error) return error;
  const existing = await prisma.label.findUnique({ where: { ownerId: user!.id } });
  if (existing) return NextResponse.json({ error: 'You already have a label' }, { status: 409 });
  const { name, description, logoUrl, website } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Label name required' }, { status: 400 });
  let slug = slugify(name);
  let n = 0;
  while (await prisma.label.findUnique({ where: { slug } })) slug = `${slugify(name)}-${++n}`;
  const label = await prisma.label.create({
    data: { id: `lbl_${Date.now()}`, name: name.trim(), slug, description: description ?? '', logoUrl: logoUrl ?? '', website: website ?? '', ownerId: user!.id },
  });
  return NextResponse.json({ ok: true, label });
}
