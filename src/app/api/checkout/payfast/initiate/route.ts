// src/app/api/checkout/payfast/initiate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { buildPayFastForm } from '@/lib/payfast';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { itemType, itemId, licenseType, buyerEmail, buyerName, customAmount } = body;

    if (!itemType || !itemId || !buyerEmail || !buyerName) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const isSandbox = process.env.PAYFAST_SANDBOX === 'true';

    // Validate PayFast credentials in production
    if (!isSandbox && (!process.env.PAYFAST_MERCHANT_ID || !process.env.PAYFAST_MERCHANT_KEY)) {
      return NextResponse.json({ error: 'PayFast not configured' }, { status: 500 });
    }

    let itemName = '';
    let amount = 0;
    let artist: any = null;
    let cancelSlug = '';

    if (itemType === 'beat') {
      const beat = await prisma.beat.findUnique({
        where: { id: itemId },
        include: { artist: true },
      });
      if (!beat) return NextResponse.json({ error: 'Beat not found' }, { status: 404 });
      const prices: Record<string, number> = {
        basic: beat.basicPrice,
        premium: beat.premiumPrice,
        exclusive: beat.exclPrice,
      };
      amount = prices[licenseType || 'basic'] || beat.basicPrice;
      // Strip special chars for PayFast item_name
      itemName = `${beat.title} - ${licenseType || 'Basic'} License`.replace(/[^a-zA-Z0-9 \-_]/g, '').substring(0, 100);
      artist = beat.artist;
      cancelSlug = `/beat/${beat.slug}`;
    } else {
      const release = await prisma.release.findUnique({
        where: { id: itemId },
        include: { artist: true },
      });
      if (!release) return NextResponse.json({ error: 'Release not found' }, { status: 404 });
      amount = customAmount || release.price;
      itemName = release.title.replace(/[^a-zA-Z0-9 \-_]/g, '').substring(0, 100);
      artist = release.artist;
      cancelSlug = `/release/${release.slug}`;
    }

    // ── FREE ITEM: skip PayFast entirely ──
    if (amount === 0) {
      const licenseId = `VK-${Date.now().toString(36).toUpperCase()}`;
      const purchase = await prisma.purchase.create({
        data: {
          buyerEmail,
          buyerName,
          itemType,
          beatId: itemType === 'beat' ? itemId : null,
          releaseId: itemType === 'release' ? itemId : null,
          amount: 0,
          currency: 'ZAR',
          licenseType: licenseType || '',
          licenseId,
          status: 'confirmed',
        },
      });
      const freeAppUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      return NextResponse.json({ redirect: `${freeAppUrl}/checkout/success?purchaseId=${purchase.id}` });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const merchantId = isSandbox
      ? (process.env.PAYFAST_SANDBOX_MERCHANT_ID || '10000100')
      : (artist?.payfastMerchant || process.env.PAYFAST_MERCHANT_ID!);
    const merchantKey = isSandbox
      ? (process.env.PAYFAST_SANDBOX_MERCHANT_KEY || '46f0cd694581a')
      : (process.env.PAYFAST_MERCHANT_KEY!);
    const passphrase = isSandbox
      ? (process.env.PAYFAST_SANDBOX_PASSPHRASE || '')
      : (process.env.PAYFAST_PASSPHRASE || '');

    const licenseId = `VK-${Date.now().toString(36).toUpperCase()}`;
    const purchase = await prisma.purchase.create({
      data: {
        buyerEmail,
        buyerName,
        itemType,
        beatId: itemType === 'beat' ? itemId : null,
        releaseId: itemType === 'release' ? itemId : null,
        amount,
        currency: 'ZAR',
        licenseType: licenseType || '',
        licenseId,
        status: 'pending',
      },
    });

    const nameParts = buyerName.trim().split(' ');
    const nameFirst = nameParts[0] || buyerName;
    const nameLast = nameParts.slice(1).join(' ') || undefined;

    const formData = buildPayFastForm(
      {
        merchant_id: merchantId,
        merchant_key: merchantKey,
        return_url: `${appUrl}/checkout/success?purchaseId=${purchase.id}`,
        cancel_url: `${appUrl}${cancelSlug}`,
        notify_url: `${appUrl}/api/checkout/payfast/notify`,
        name_first: nameFirst,
        name_last: nameLast,
        email_address: buyerEmail,
        m_payment_id: purchase.id,
        amount: amount.toFixed(2),
        item_name: itemName,
        custom_str1: itemId,
        custom_str2: itemType,
        custom_str3: licenseType || '',
      },
      passphrase
    );

    return NextResponse.json({
      formData,
      actionUrl: isSandbox
        ? 'https://sandbox.payfast.co.za/eng/process'
        : 'https://www.payfast.co.za/eng/process',
      purchaseId: purchase.id,
    });
  } catch (err) {
    console.error('PayFast session error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
