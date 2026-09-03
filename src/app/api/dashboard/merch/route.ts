// src/app/api/dashboard/merch/route.ts
// Artist dashboard CRUD for merch items.
// GET    → { items }        list all of the artist's merch
// POST   → { item, imageUploadUrl, imagePublicUrl }  create record + presigned R2 PUT URL
// PATCH  → { item }         update metadata or mark active after image upload
// DELETE → { ok }           soft-delete (sets isActive=false); blocked if confirmed sales exist

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireArtist } from '@/lib/auth';
import { getPresignedUploadUrl, getPublicUrl } from '@/lib/r2';
import { slugify } from '@/lib/utils';
import prisma from '@/lib/prisma';

// Unique slug within the Merch table
async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  let n = 0;
  while (await prisma.merch.findUnique({ where: { slug } })) {
    n++;
    slug = `${slugify(base)}-${n}`;
  }
  return slug;
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const items = await prisma.merch.findMany({
      where:   { artistId: user.artist.id },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ items });
  } catch (err) {
    console.error('[dashboard/merch] GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ── POST — create ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { title, description, price, stock, sizes, imageMime, shippingFee } = await req.json();

    if (!title?.trim())               return NextResponse.json({ error: 'Title required' }, { status: 400 });
    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice < 0)  return NextResponse.json({ error: 'Invalid price' }, { status: 400 });
    const numStock = Number(stock);
    if (isNaN(numStock) || numStock < 0)  return NextResponse.json({ error: 'Invalid stock' }, { status: 400 });
    const numShippingFee = shippingFee === undefined ? 0 : Number(shippingFee);
    if (isNaN(numShippingFee) || numShippingFee < 0) return NextResponse.json({ error: 'Invalid shipping fee' }, { status: 400 });

    const slug = await uniqueSlug(title);
    const id   = `merch_${Date.now()}`;

    // Generate a presigned R2 URL for the image upload (optional — caller can skip)
    let imageUploadUrl: string | null = null;
    let imagePublicUrl: string | null = null;
    if (imageMime) {
      const key      = `merch/${id}/image.${imageMime.split('/')[1] || 'jpg'}`;
      imageUploadUrl = await getPresignedUploadUrl(key, imageMime).catch(() => null);
      imagePublicUrl = getPublicUrl(key);
    }

    const item = await prisma.merch.create({
      data: {
        id,
        artistId:    user.artist.id,
        title:       title.trim(),
        slug,
        description: description?.trim() || '',
        price:       numPrice,
        shippingFee: numShippingFee,
        stock:       numStock,
        sizes:       Array.isArray(sizes) ? sizes.filter(Boolean) : [],
        imageUrl:    imagePublicUrl || '',
        isActive:    false, // activated once image is uploaded (or immediately if no image)
      },
    });

    // If no image was requested, activate immediately
    if (!imageMime) {
      await prisma.merch.update({ where: { id: item.id }, data: { isActive: true } });
    }

    return NextResponse.json({ item, imageUploadUrl, imagePublicUrl }, { status: 201 });
  } catch (err) {
    console.error('[dashboard/merch] POST error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ── PATCH — update ────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, title, description, price, stock, sizes, isActive, imageUrl, shippingFee } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const existing = await prisma.merch.findUnique({ where: { id } });
    if (!existing || existing.artistId !== user.artist.id)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const data: any = {};
    if (title       !== undefined) data.title       = title.trim();
    if (description !== undefined) data.description = description.trim();
    if (price       !== undefined) data.price       = Number(price);
    if (shippingFee !== undefined) data.shippingFee = Number(shippingFee);
    if (stock       !== undefined) data.stock       = Number(stock);
    if (sizes       !== undefined) data.sizes       = Array.isArray(sizes) ? sizes.filter(Boolean) : [];
    if (isActive    !== undefined) data.isActive    = Boolean(isActive);
    if (imageUrl    !== undefined) data.imageUrl    = imageUrl;

    const item = await prisma.merch.update({ where: { id }, data });
    return NextResponse.json({ item });
  } catch (err) {
    console.error('[dashboard/merch] PATCH error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ── DELETE — soft delete ──────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireArtist();
    if (!user?.artist) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const existing = await prisma.merch.findUnique({ where: { id } });
    if (!existing || existing.artistId !== user.artist.id)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Block deletion if there are any confirmed sales for this item
    const saleCount = await prisma.purchase.count({
      where: { merchId: id, status: 'confirmed' },
    });
    if (saleCount > 0)
      return NextResponse.json({
        error: `Cannot delete — ${saleCount} confirmed sale${saleCount !== 1 ? 's' : ''} exist. Deactivate instead.`,
      }, { status: 409 });

    await prisma.merch.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[dashboard/merch] DELETE error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
