import { describe, expect, it } from 'vitest';
import { rateFromQualifications, type CreatorQualification } from './partners';

function creator(points: number): CreatorQualification {
  return {
    userId: `user-${points}`,
    name: 'Test Creator',
    role: 'artist',
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
    verified: true,
    hasRelease: true,
    sales90d: 5,
    uniqueFans90d: 3,
    grossSales90d: 100,
    category: points === 2 ? 'strong_seller' : points === 1 ? 'paid_or_steady' : points === 0.5 ? 'active_sales' : 'none',
    points,
    excluded: false,
    exclusionReason: null,
    exclusionEffectiveFrom: null,
  };
}

describe('partner fee-share rate', () => {
  it('starts at 10 percent with no qualifying creators', () => {
    expect(rateFromQualifications([]).rate).toBe(0.1);
  });

  it('adds half a percentage point for an active-sales creator', () => {
    expect(rateFromQualifications([creator(0.5)]).rate).toBe(0.105);
  });

  it('adds category points and caps the rate at 25 percent', () => {
    expect(rateFromQualifications([creator(0.5), creator(1), creator(2)]).rate).toBe(0.135);
    expect(rateFromQualifications(Array.from({ length: 10 }, () => creator(2))).rate).toBe(0.25);
  });
});
