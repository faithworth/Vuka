import { describe, expect, it } from 'vitest';
import { generateLicensePDF } from './pdf';

const baseLicense = {
  licenseId: 'license-test-001',
  licenseType: 'basic',
  beatTitle: 'Test Beat',
  artistName: 'Test Producer',
  buyerName: 'Test Buyer',
  buyerEmail: 'buyer@example.com',
  amount: 99,
  currency: 'ZAR',
  date: new Date('2026-10-22T10:00:00.000Z'),
  itemKind: 'beat' as const,
};

describe('generateLicensePDF', () => {
  it('generates a valid PDF for the default license template', async () => {
    const pdf = await generateLicensePDF(baseLicense);
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('generates a valid PDF using producer-authored clauses', async () => {
    const pdf = await generateLicensePDF({
      ...baseLicense,
      customTerms: [
        'Non-exclusive use of this beat.',
        'Up to 5,000 streams.',
        'Credit the producer on all releases.',
      ],
    });
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
