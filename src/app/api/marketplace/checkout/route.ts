// src/app/api/marketplace/checkout/route.ts
// Initiate Paystack payment for a marketplace service order.
// On charge.success → /api/marketplace/checkout/notify activates the order.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { initializeTransaction, generateReference } from '@/lib/paystack';
import { requireAuth } from '@/lib/auth';
import { platformFee as calcFee, artistNet as calcNet } from '@/lib/plans';

export async function POST(req: NextRequest) {
  try {
    const { serviceId, packageName, requirements, buyerName, buyerEmail } = await req.json();

    if (!serviceId || !buyerEmail || !buyerName) {
      return NextResponse.json({ error: 'serviceId, buyerName and buyerEmail are required' }, { status: 400 });
    }

    const service = await prisma.marketplaceService.findUnique({
      where: { id: serviceId },
      include: {
        artist: {
          include: { user: true },
          // planSlug, planExpiresAt, lifetimeGrossSales are scalar fields on Artist,
          // included automatically — no extra select needed.
        },
      },
    });
    if (!service?.isActive) return NextResponse.json({ error: 'Service not available' }, { status: 404 });

    // Derive the price server-side from the service's own stored packages —
    // never trust a client-supplied amount for a payment.
    const packages = Array.isArray(service.packages) ? (service.packages as any[]) : [];
    let amount: number;
    let resolvedPackageName: string;
    let orderDeliveryDays: number;
    if (packages.length > 0) {
      const pkg = packageName ? packages.find(p => p.name === packageName) : packages[0];
      if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 400 });
      amount = Number(pkg.price);
      resolvedPackageName = pkg.name;
      orderDeliveryDays = parseInt(pkg.deliveryDays, 10) || service.deliveryDays || 7;
    } else {
      amount = Number(service.price);
      resolvedPackageName = 'Standard';
      orderDeliveryDays = service.deliveryDays || 7;
    }
    if (!amount || amount <= 0) return NextResponse.json({ error: 'Invalid service price' }, { status: 400 });

    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: 'You must be logged in to place an order' }, { status: 401 });

    const buyerArtist = await prisma.artist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (buyerArtist?.id === service.artistId) return NextResponse.json({ error: 'Cannot order your own service' }, { status: 400 });

    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + orderDeliveryDays);

    const platformFee = calcFee(amount, service.artist.planSlug, service.artist.planExpiresAt, service.artist.lifetimeGrossSales);
    const netAmount    = calcNet(amount, service.artist.planSlug, service.artist.planExpiresAt, service.artist.lifetimeGrossSales);

    const order = await prisma.marketplaceOrder.create({
      data: {
        serviceId,
        buyerUserId:    user.id,
        sellerArtistId: service.artistId,
        packageName:    resolvedPackageName,
        packagePrice:   amount,
        currency:       'ZAR',
        requirements:   requirements || '',
        status:         'pending',
        deliveryDays:   orderDeliveryDays,
        dueAt,
        platformFee,
        netAmount,
      },
    });

    const appUrl    = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const reference = generateReference('MKT');

    const result = await initializeTransaction({
      email:       buyerEmail || user.email,
      amountZAR:   Number(amount),
      reference,
      callbackUrl: `${appUrl}/marketplace?order=success&id=${order.id}`,
      metadata: {
        orderId:   order.id,
        serviceId,
        artistId:  service.artistId,
        buyerEmail: buyerEmail || user.email,
        type:      'marketplace',
      },
    });

    // Store reference on order for webhook lookup
    await prisma.marketplaceOrder.update({
      where: { id: order.id },
      data:  { paystackReference: reference },
    });

    return NextResponse.json({
      authorizationUrl: result.authorizationUrl,
      method:           'paystack',
      orderId:          order.id,
    });
  } catch (err: any) {
    console.error('[marketplace/checkout] error:', err?.message);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
