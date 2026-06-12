// GET/POST /api/cms/media
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { canAccessCms } from '@/lib/cms';
import { getPresignedUploadUrl, getPublicUrl } from '@/lib/r2';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAdmin();
    if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const url    = new URL(req.url);
    const folder = url.searchParams.get('folder') ?? 'cms';
    const page   = parseInt(url.searchParams.get('page') ?? '1');
    const limit  = 24;
    const [media, total] = await Promise.all([
      prisma.cmsMedia.findMany({ where: { folder }, orderBy: { createdAt: 'desc' }, take: limit, skip: (page - 1) * limit }),
      prisma.cmsMedia.count({ where: { folder } }),
    ]);
    return NextResponse.json({ media, total, page, pages: Math.ceil(total / limit) });
  } catch (e) { return NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin();
    if (!user || !canAccessCms(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { filename, mimeType, size, folder = 'cms', alt = '', caption = '' } = await req.json();
    if (!filename || !mimeType) return NextResponse.json({ error: 'filename and mimeType required' }, { status: 400 });
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!allowed.includes(mimeType)) return NextResponse.json({ error: 'Images only in CMS media library.' }, { status: 400 });
    const ext    = filename.split('.').pop() ?? 'jpg';
    const r2Key  = `cms/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const uploadUrl = await getPresignedUploadUrl(r2Key, mimeType);
    const publicUrl = getPublicUrl(r2Key);
    const media = await prisma.cmsMedia.create({
      data: { filename: `${Date.now()}.${ext}`, originalName: filename, mimeType, size: size ?? 0, r2Key, publicUrl, alt, caption, folder, uploadedById: user.id },
    });
    return NextResponse.json({ media, uploadUrl }, { status: 201 });
  } catch (e) { return NextResponse.json({ error: 'Server error' }, { status: 500 }); }
}
