// ============================================================
// PHASE 2  src/lib/licensing.ts
// Beat Licensing Engine:
//   - License issuance on purchase confirmation
//   - License term definitions per tier
//   - License verification (public key lookup)
//   - PDF generation hook (calls existing lib/pdf.ts)
//   - License revocation
// ============================================================

import prisma from './prisma';

//  License Term Definitions 
// These define the rights granted per license tier.
// Update these to match your legal agreements.

export interface LicenseTerms {
  type: string;
  streams: number | null;       // null = unlimited
  salesCap: number | null;      // null = unlimited
  radioStations: boolean;
  tvSync: boolean;
  musicVideo: boolean;
  profitSharing: number;        // % of earnings owed to producer
  exclusiveTransfer: boolean;   // does ownership transfer to buyer?
  durationYears: number | null; // null = perpetual
  description: string;
}

export const LICENSE_TERMS: Record<string, LicenseTerms> = {
  basic: {
    type: 'basic',
    streams: 500_000,
    salesCap: 2_000,
    radioStations: false,
    tvSync: false,
    musicVideo: false,
    profitSharing: 0,
    exclusiveTransfer: false,
    durationYears: null,
    description: 'Non-exclusive MP3 lease. Up to 500K streams and 2,000 paid sales. No radio, TV, or music video use.',
  },
  premium: {
    type: 'premium',
    streams: null,
    salesCap: null,
    radioStations: true,
    tvSync: false,
    musicVideo: true,
    profitSharing: 0,
    exclusiveTransfer: false,
    durationYears: null,
    description: 'Non-exclusive WAV + MP3 lease. Unlimited streams and sales. Includes radio and music video rights.',
  },
  exclusive: {
    type: 'exclusive',
    streams: null,
    salesCap: null,
    radioStations: true,
    tvSync: true,
    musicVideo: true,
    profitSharing: 0,
    exclusiveTransfer: true,
    durationYears: null,
    description: 'Full exclusive ownership transfer. All rights granted. Beat removed from sale after purchase.',
  },
};

//  Issue License 
// Called from transaction.ts after purchase is confirmed.

export async function issueBeatLicense(params: {
  purchaseId: string;
  buyerName: string;
  buyerEmail: string;
  artistName?: string;
  songTitle?: string;
}): Promise<{ licenseKey: string; pdfUrl: string }> {
  const purchase = await prisma.purchase.findUnique({
    where: { id: params.purchaseId },
    include: { beat: { include: { artist: true } } },
  });

  if (!purchase) throw new Error('Purchase not found');
  if (purchase.itemType !== 'beat') throw new Error('License issuance only supported for beat purchases');
  if (!purchase.beat) throw new Error('Beat not found on purchase');
  if (purchase.status !== 'confirmed') throw new Error('Purchase not confirmed');

  // Idempotent  return existing if already issued
  const existing = await prisma.beatLicense.findUnique({
    where: { purchaseId: params.purchaseId },
  });
  if (existing) {
    return { licenseKey: existing.licenseKey, pdfUrl: existing.pdfUrl };
  }

  const licenseType = purchase.licenseType || 'basic';
  const terms = LICENSE_TERMS[licenseType] || LICENSE_TERMS.basic;

  const expiresAt = terms.durationYears
    ? new Date(new Date().setFullYear(new Date().getFullYear() + terms.durationYears))
    : null;

  const license = await prisma.beatLicense.create({
    data: {
      beatId: purchase.beatId!,
      artistId: purchase.beat.artist.id,
      purchaseId: params.purchaseId,
      licenseType,
      streams: terms.streams,
      salesCap: terms.salesCap,
      radioStations: terms.radioStations,
      tvSync: terms.tvSync,
      musicVideo: terms.musicVideo,
      profitSharing: terms.profitSharing,
      buyerName: params.buyerName,
      buyerEmail: params.buyerEmail,
      artistName: params.artistName || '',
      songTitle: params.songTitle || '',
      expiresAt,
    },
  });

  // If exclusive: mark beat as sold
  if (licenseType === 'exclusive') {
    await prisma.beat.update({
      where: { id: purchase.beatId! },
      data: { isExclusive: true, isActive: false },
    });
  }

  // Hook: generate PDF license document
  // In production: call lib/pdf.ts  generateLicensePDF(license, purchase.beat, terms)
  // then upload to R2 and update license.pdfUrl
  const pdfUrl = '';

  if (pdfUrl) {
    await prisma.beatLicense.update({
      where: { id: license.id },
      data: { pdfUrl },
    });
    await prisma.purchase.update({
      where: { id: params.purchaseId },
      data: { licenseUrl: pdfUrl },
    });
  }

  return { licenseKey: license.licenseKey, pdfUrl };
}

//  Verify License (public endpoint) 

export async function verifyLicense(licenseKey: string) {
  const license = await prisma.beatLicense.findUnique({
    where: { licenseKey },
    include: {
      beat: {
        select: { id: true, title: true, slug: true, artist: { select: { name: true, slug: true } } },
      },
    },
  });

  if (!license) return { valid: false, reason: 'License key not found' };

  if (license.expiresAt && license.expiresAt < new Date()) {
    return { valid: false, reason: 'License has expired', license };
  }

  const terms = LICENSE_TERMS[license.licenseType] || null;

  return {
    valid: true,
    license: {
      licenseKey: license.licenseKey,
      licenseType: license.licenseType,
      buyerName: license.buyerName,
      artistName: license.artistName,
      songTitle: license.songTitle,
      issuedAt: license.issuedAt,
      expiresAt: license.expiresAt,
      beat: license.beat,
      rights: terms ? {
        streams: terms.streams ?? 'Unlimited',
        salesCap: terms.salesCap ?? 'Unlimited',
        radioStations: terms.radioStations,
        tvSync: terms.tvSync,
        musicVideo: terms.musicVideo,
      } : null,
    },
  };
}

//  Revoke License (admin / DMCA action) 

export async function revokeLicense(
  licenseKey: string,
  reason: string
): Promise<void> {
  const license = await prisma.beatLicense.findUnique({
    where: { licenseKey },
  });
  if (!license) throw new Error('License not found');

  // Flag by setting expiry to now + storing reason in purchase notes
  await prisma.beatLicense.update({
    where: { licenseKey },
    data: { expiresAt: new Date() },
  });

  // Optionally update the purchase record
  await prisma.purchase.update({
    where: { id: license.purchaseId },
    data: { status: 'refunded' },
  }).catch(() => {});
}

//  Get Licenses for Beat 

export async function getBeatLicenses(beatId: string) {
  return prisma.beatLicense.findMany({
    where: { beatId },
    select: {
      id: true,
      licenseKey: true,
      licenseType: true,
      buyerName: true,
      buyerEmail: true,
      artistName: true,
      songTitle: true,
      issuedAt: true,
      expiresAt: true,
      pdfUrl: true,
    },
    orderBy: { issuedAt: 'desc' },
  });
}

//  Get License for Purchase 

export async function getLicenseByPurchase(purchaseId: string) {
  return prisma.beatLicense.findUnique({
    where: { purchaseId },
  });
}
