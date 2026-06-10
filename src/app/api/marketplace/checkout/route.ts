// src/app/api/marketplace/checkout/route.ts
// Initiate PayFast payment for a marketplace service order.
// Creates a MarketplaceOrder with status 'pending'.
// On ITN confirmation → /api/marketplace/checkout/notify sets status to 'active'.

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { buildPayFastForm } from '@/lib/payfast';
import { createClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { serviceId, packageName, amount, requirements, buyerName, buyerEmail } = await req.json();

    if (!serviceId || !amount || !buyerEmail || !buyerName) {
      return NextResponse.json({ error: 'serviceId, amount, buyerName and buyerEmail are required' }, { status: 400 });
    }

    const service = await prisma.marketplaceService.findUnique({
      where: { id: serviceId },
      include: { artist: { include: { user: true } } },
    });
    if (!service || !service.isActive) {
      return NextResponse.json({ error: 'Service not available' }, { status: 404 });
    }

    // Resolve buyer userId if logged in (optional — marketplace allows guest orders)
    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    let buyerUserId: string | null = null;
    if (authUser) {
      const dbUser = await prisma.user.findUnique({ where: { id: authUser.id }, select: { id: true } });
      if (dbUser) buyerUserId = dbUser.id;
    }

    // Require authenticated buyer to prevent spam orders
    if (!buyerUserId) {
      return NextResponse.json({ error: 'You must be logged in to place an order' }, { status: 401 });
    }

    // Block artists from ordering their own service
    const buyerArtist = await prisma.artist.findUnique({ where: { userId: buyerUserId }, select: { id: true } });
    if (buyerArtist?.id === service.artistId) {
      return NextResponse.json({ error: 'Cannot order your own service' }, { status: 400 });
    }

    const deadline = new Date();
    const deliveryDays = service.deliveryDays || 7;
    deadline.setDate(deadline.getDate() + deliveryDays);

    // Create pending order
    const order = await prisma.marketplaceOrder.create({
      data: {
        serviceId,
        buyerId:      buyerUserId,
        sellerId:     service.artistId,
        amount:       Number(amount),
        currency:     'ZAR',
        requirements: requirements || '',
        status:       'pending',
        deadline,
      },
    });

    const appUrl      = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const isSandbox   = process.env.PAYFAST_SANDBOX === 'true';
    const merchantId  = isSandbox ? (process.env.PAYFAST_SANDBOX_MERCHANT_ID || '10000100') : process.env.PAYFAST_MERCHANT_ID!;
    const merchantKey = isSandbox ? (process.env.PAYFAST_SANDBOX_MERCHANT_KEY || '46f0cd694581a') : process.env.PAYFAST_MERCHANT_KEY!;
    const passphrase  = process.env.PAYFAST_PASSPHRASE || '';

    if (!merchantId || !merchantKey) {
      return NextResponse.json({ error: 'Payment gateway not configured' }, { status: 500 });
    }

    const formData = buildPayFastForm(
      {
        merchant_id:   merchantId,
        merchant_key:  merchantKey,
        return_url:    `${appUrl}/marketplace?order=success&id=${order.id}`,
        cancel_url:    `${appUrl}/marketplace`,
        notify_url:    `${appUrl}/api/marketplace/checkout/notify`,
        name_first:    buyerName.split(' ')[0] || buyerName,
        name_last:     buyerName.split(' ').slice(1).join(' ') || '',
        email_address: buyerEmail,
        m_payment_id:  order.id,
        amount:        Number(amount).toFixed(2),
        item_name:     `${service.title} — ${packageName || 'Service'}`.substring(0, 100),
        custom_str1:   order.id,        // orderId
        custom_str2:   'marketplace',
        custom_str3:   service.artistId,
        custom_str4:   buyerEmail,
      },
      passphrase,
    );

    return NextResponse.json({
      formData,
      actionUrl: isSandbox
        ? 'https://sandbox.payfast.co.za/eng/process'
        : 'https://www.payfast.co.za/eng/process',
      method: 'payfast',
      orderId: order.id,
    });
  } catch (err: any) {
    console.error('[marketplace/checkout] error:', err?.message);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
