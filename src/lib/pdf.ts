import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export async function generateLicensePDF({
  licenseId,
  licenseType,
  beatTitle,
  artistName,
  buyerName,
  buyerEmail,
  amount,
  currency,
  date,
  itemKind = 'beat',
}: {
  licenseId: string;
  licenseType: string;
  beatTitle: string;
  artistName: string;
  buyerName: string;
  buyerEmail: string;
  amount: number;
  currency: string;
  date: Date;
  /** 'beat' | 'release' | 'video' | 'sample' — controls header/field labels only. Defaults to 'beat' for backward compatibility with existing callers. */
  itemKind?: 'beat' | 'release' | 'video' | 'sample';
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  const purple = rgb(0.486, 0.227, 0.929);
  const white = rgb(1, 1, 1);
  const dark = rgb(0.051, 0.043, 0.078);
  const muted = rgb(0.545, 0.49, 0.667);

  const kindLabel: Record<string, string> = {
    beat: 'BEAT',
    release: 'RELEASE',
    video: 'VIDEO',
    sample: 'SAMPLE',
  };
  const titleFieldLabel: Record<string, string> = {
    beat: 'Beat Title:',
    release: 'Release Title:',
    video: 'Video Title:',
    sample: 'Sample Title:',
  };
  const headerKind = kindLabel[itemKind] || 'BEAT';
  const titleField = titleFieldLabel[itemKind] || 'Beat Title:';

  // Background
  page.drawRectangle({ x: 0, y: 0, width, height, color: dark });

  // Header bar
  page.drawRectangle({ x: 0, y: height - 100, width, height: 100, color: purple });
  page.drawText('VUKA', { x: 40, y: height - 65, size: 36, font: bold, color: white });
  page.drawText(`${headerKind} LICENSE AGREEMENT`, { x: 40, y: height - 90, size: 11, font: regular, color: rgb(0.8, 0.7, 1) });

  // License type badge
  const badgeX = width - 160;
  page.drawRectangle({ x: badgeX, y: height - 80, width: 120, height: 30, color: rgb(0.2, 0.1, 0.4) });
  page.drawText(licenseType.toUpperCase() + ' LICENSE', { x: badgeX + 10, y: height - 65, size: 9, font: bold, color: white });

  let y = height - 140;
  const left = 40;
  const lineH = 28;

  const section = (title: string) => {
    page.drawText(title, { x: left, y, size: 10, font: bold, color: purple });
    y -= 5;
    page.drawLine({ start: { x: left, y }, end: { x: width - 40, y }, thickness: 0.5, color: rgb(0.18, 0.13, 0.31) });
    y -= lineH;
  };

  const row = (label: string, value: string) => {
    page.drawText(label, { x: left, y, size: 10, font: regular, color: muted });
    page.drawText(value, { x: 200, y, size: 10, font: regular, color: white });
    y -= lineH;
  };

  section(`${headerKind} DETAILS`);
  row(titleField, beatTitle);
  row('Artist / Producer:', artistName);
  row('License Type:', licenseType.charAt(0).toUpperCase() + licenseType.slice(1));
  y -= 10;

  section('LICENSEE');
  row('Buyer Name:', buyerName);
  row('Buyer Email:', buyerEmail);
  y -= 10;

  section('TRANSACTION');
  row('License ID:', licenseId.toUpperCase());
  row('Amount Paid:', `${currency} ${amount.toFixed(2)}`);
  row('Date:', date.toLocaleDateString('en-ZA', { dateStyle: 'long' }));
  y -= 10;

  // Rights based on license
  section('RIGHTS GRANTED');
  const rights: Record<string, string[]> = {
    basic: [
      '✓ Non-exclusive rights to use the beat',
      '✓ Up to 5,000 streams/downloads',
      '✓ 2 music videos',
      '✓ Non-profit live performances',
      '✗ Exclusive rights — others may purchase this beat',
    ],
    premium: [
      '✓ Non-exclusive rights to use the beat',
      '✓ Up to 500,000 streams/downloads',
      '✓ Unlimited music videos',
      '✓ Commercial live performances',
      '✓ Radio broadcasting rights',
      '✗ Exclusive rights — others may purchase this beat',
    ],
    exclusive: [
      '✓ EXCLUSIVE rights — no one else may purchase this beat',
      '✓ Unlimited streams and downloads',
      '✓ Unlimited music videos',
      '✓ Full commercial use including sync',
      '✓ Radio, TV and film licensing',
      '✓ Songwriter credit: 50% to buyer',
    ],
    standard: [
      '✓ Personal and commercial use of the purchased content',
      '✓ Unlimited streams and downloads by the buyer',
      '✓ Credit to the original artist/producer required',
      '✗ Resale or redistribution of the original files',
    ],
  };

  const selectedRights = rights[licenseType.toLowerCase()] || (itemKind === 'beat' ? rights.basic : rights.standard);
  for (const right of selectedRights) {
    const color = right.startsWith('✗') ? rgb(0.7, 0.3, 0.3) : rgb(0.2, 0.8, 0.5);
    page.drawText(right, { x: left, y, size: 9.5, font: regular, color });
    y -= 22;
  }

  y -= 20;
  section('TERMS');
  const terms = [
    'The artist retains all publishing and master rights.',
    'Buyer must credit the producer in all commercial releases.',
    'This license is non-transferable and non-sub-licensable.',
    'Resale of the original purchased files is strictly prohibited.',
    'This agreement is governed by applicable South African and international copyright law.',
  ];
  for (const t of terms) {
    page.drawText(`• ${t}`, { x: left, y, size: 8.5, font: regular, color: muted });
    y -= 20;
  }

  // Footer
  y = 50;
  page.drawText('Vuka Music Commerce Platform — vukamusic.com', { x: left, y, size: 9, font: regular, color: muted });
  page.drawText(`Generated ${date.toISOString()}`, { x: left, y: 35, size: 8, font: regular, color: rgb(0.3, 0.25, 0.45) });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

export async function generateReceiptPDF({
  purchaseId,
  itemName,
  itemType,
  buyerName,
  buyerEmail,
  amount,
  currency,
  date,
}: {
  purchaseId: string;
  itemName: string;
  itemType: string;
  buyerName: string;
  buyerEmail: string;
  amount: number;
  currency: string;
  date: Date;
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 400]);
  const { width } = page.getSize();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const dark = rgb(0.051, 0.043, 0.078);
  const purple = rgb(0.486, 0.227, 0.929);
  const white = rgb(1, 1, 1);
  const muted = rgb(0.545, 0.49, 0.667);

  page.drawRectangle({ x: 0, y: 0, width, height: 400, color: dark });
  page.drawRectangle({ x: 0, y: 350, width, height: 50, color: purple });
  page.drawText('VUKA — RECEIPT', { x: 40, y: 368, size: 18, font: bold, color: white });

  let y = 310;
  const row = (l: string, v: string, vColor = white) => {
    page.drawText(l, { x: 40, y, size: 10, font: regular, color: muted });
    page.drawText(v, { x: 200, y, size: 10, font: regular, color: vColor });
    y -= 26;
  };

  row('Item:', itemName);
  row('Type:', itemType.charAt(0).toUpperCase() + itemType.slice(1));
  row('Buyer:', buyerName);
  row('Email:', buyerEmail);
  row('Amount:', `${currency} ${amount.toFixed(2)}`, rgb(0.2, 0.8, 0.5));
  row('Date:', date.toLocaleDateString('en-ZA', { dateStyle: 'long' }));
  row('Reference:', purchaseId.toUpperCase().substring(0, 20));

  page.drawText('Thank you for supporting independent music — Vuka Music', { x: 40, y: 50, size: 9, font: regular, color: muted });

  return Buffer.from(await doc.save());
}
