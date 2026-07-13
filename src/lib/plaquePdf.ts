import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return rgb(r, g, b);
}

export async function generatePlaqueCertificatePDF({
  artistName,
  tierLabel,
  tierColorHex,
  milestoneValue,
  dimensionLabel,
  earnedAt,
}: {
  artistName: string;
  tierLabel: string;
  tierColorHex: string;
  milestoneValue: string;
  dimensionLabel: string;
  earnedAt: Date;
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  // Landscape — a certificate reads better wide than tall, and it's the
  // natural orientation for printing/framing.
  const page = doc.addPage([842, 595]); // A4 landscape
  const { width, height } = page.getSize();

  const bold    = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  const dark   = rgb(0.039, 0.039, 0.039);
  const white  = rgb(1, 1, 1);
  const muted  = rgb(0.65, 0.65, 0.65);
  const accent = hexToRgb(tierColorHex);

  // Background
  page.drawRectangle({ x: 0, y: 0, width, height, color: dark });

  // Outer decorative border, double-lined in the tier colour
  page.drawRectangle({
    x: 24, y: 24, width: width - 48, height: height - 48,
    borderColor: accent, borderWidth: 2, color: undefined,
  });
  page.drawRectangle({
    x: 34, y: 34, width: width - 68, height: height - 68,
    borderColor: accent, borderWidth: 0.75, color: undefined,
  });

  const centerX = width / 2;

  // Vuka wordmark
  const wordmark = 'VUKA MUSIC';
  const wmSize = 16;
  const wmWidth = bold.widthOfTextAtSize(wordmark, wmSize);
  page.drawText(wordmark, { x: centerX - wmWidth / 2, y: height - 90, size: wmSize, font: bold, color: white, opacity: 0.85 });

  // "Certificate of Achievement"
  const heading = 'CERTIFICATE OF ACHIEVEMENT';
  const hSize = 13;
  const hWidth = regular.widthOfTextAtSize(heading, hSize);
  page.drawText(heading, { x: centerX - hWidth / 2, y: height - 118, size: hSize, font: regular, color: muted });

  // Tier label — the big, colored headline
  const tierText = tierLabel.toUpperCase();
  const tSize = 46;
  const tWidth = bold.widthOfTextAtSize(tierText, tSize);
  page.drawText(tierText, { x: centerX - tWidth / 2, y: height - 220, size: tSize, font: bold, color: accent });

  // Milestone value + dimension
  const milestoneText = `${milestoneValue} ${dimensionLabel}`;
  const mSize = 24;
  const mWidth = bold.widthOfTextAtSize(milestoneText, mSize);
  page.drawText(milestoneText, { x: centerX - mWidth / 2, y: height - 270, size: mSize, font: bold, color: white });

  // "This certifies that"
  const certifyText = 'This certifies that';
  const cSize = 13;
  const cWidth = regular.widthOfTextAtSize(certifyText, cSize);
  page.drawText(certifyText, { x: centerX - cWidth / 2, y: height - 340, size: cSize, font: regular, color: muted });

  // Artist name — the real focal point after the tier
  const nSize = 34;
  const nWidth = bold.widthOfTextAtSize(artistName, nSize);
  page.drawText(artistName, { x: centerX - nWidth / 2, y: height - 385, size: nSize, font: bold, color: white });

  // Divider line under the name
  page.drawLine({
    start: { x: centerX - 140, y: height - 400 },
    end:   { x: centerX + 140, y: height - 400 },
    thickness: 1, color: accent, opacity: 0.5,
  });

  // Achievement descriptor
  const descText = `has achieved ${dimensionLabel.toLowerCase()} milestone status on Vuka Music`;
  const dSize = 12;
  const dWidth = regular.widthOfTextAtSize(descText, dSize);
  page.drawText(descText, { x: centerX - dWidth / 2, y: height - 425, size: dSize, font: regular, color: muted });

  // Date, bottom-left
  const dateText = earnedAt.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
  page.drawText(`Awarded ${dateText}`, { x: 60, y: 60, size: 10, font: regular, color: muted });

  // Vuka footer, bottom-right
  const footerText = 'vukamusic.com';
  const fWidth = regular.widthOfTextAtSize(footerText, 10);
  page.drawText(footerText, { x: width - 60 - fWidth, y: 60, size: 10, font: regular, color: muted });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
