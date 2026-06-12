// GET  /api/cms/pages  — list all pages
// POST /api/cms/pages  — create new page
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { canAccessCms, getAllPages } from '@/lib/cms';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireAdmin();
    if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const pages = await getAllPages();
    return NextResponse.json({ pages });
  } catch (e) { console.error('[cms/pages GET]', e); return NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin();
    if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { title, slug, description } = await req.json();
    if (!title?.trim() || !slug?.trim()) return NextResponse.json({ error: 'title and slug required' }, { status: 400 });
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9\-\/]/g, '-').replace(/^-|-$/g, '');
    const exists = await prisma.cmsPage.findUnique({ where: { slug: cleanSlug } });
    if (exists) return NextResponse.json({ error: 'A page with this slug already exists.' }, { status: 409 });
    const page = await prisma.cmsPage.create({
      data: { title: title.trim(), slug: cleanSlug, description: description?.trim() ?? '', createdById: user.id, updatedById: user.id },
    });
    return NextResponse.json({ page }, { status: 201 });
  } catch (e) { console.error('[cms/pages POST]', e); return NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}
