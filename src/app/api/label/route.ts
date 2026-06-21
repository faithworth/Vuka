export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { slugify } from '@/lib/utils';

export async function GET() {
  const user = await requireArtist();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const label = await prisma.label.findUnique({
    where: { ownerId: user.id },
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
  const user = await requireArtist();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const existing = await prisma.label.findUnique({ where: { ownerId: user.id } });
  if (existing) return NextResponse.json({ error: 'You already have a label' }, { status: 409 });
  const { name, description, logoUrl, website } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Label name required' }, { status: 400 });
  let slug = slugify(name);
  let n = 0;
  while (await prisma.label.findUnique({ where: { slug } })) slug = `${slugify(name)}-${++n}`;
  const label = await prisma.label.create({
    data: { id: `lbl_${Date.now()}`, name: name.trim(), slug, description: description ?? '', logoUrl: logoUrl ?? '', website: website ?? '', ownerId: user.id },
  });
  return NextResponse.json({ ok: true, label });
}
