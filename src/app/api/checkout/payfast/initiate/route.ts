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

    let itemName = '';
    let amount = 0;

    if (itemType === 'beat') {
      const beat = await prisma.beat.findUnique({ where: { id: itemId } });
      if (!beat) return NextResponse.json({ error: 'Beat not found' }, { status: 404 });
      const prices: Record<string, number> = { basic: beat.basicPrice, premium: beat.premiumPrice, exclusive: beat.exclPrice };
      amount = prices[licenseType || 'basic'] || beat.basicPrice;
      itemName = `${beat.title} - ${licenseType || 'Basic'} License`;
    } else {
      const release = await prisma.release.findUnique({ where: { id: itemId } });
      if (!release) return NextResponse.json({ error: 'Release not found' }, { status: 404 });
      amount = customAmount || release.price;
      itemName = release.title;
    }

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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const isSandbox = process.env.PAYFAST_SANDBOX === 'true';
    const formData = buildPayFastForm(
      {
        merchant_id: process.env.PAYFAST_MERCHANT_ID!,
        merchant_key: process.env.PAYFAST_MERCHANT_KEY!,
        return_url: `${appUrl}/success?purchaseId=${purchase.id}`,
        cancel_url: `${appUrl}/${itemType}/${itemId}`,
        notify_url: `${appUrl}/api/checkout/payfast`,
        name_first: buyerName.split(' ')[0] || buyerName,
        email_address: buyerEmail,
        m_payment_id: purchase.id,
        amount: amount.toFixed(2),
        item_name: itemName.substring(0, 100),
        custom_str1: itemId,
        custom_str2: itemType,
        custom_str3: licenseType || '',
      },
      process.env.PAYFAST_PASSPHRASE || ''
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
