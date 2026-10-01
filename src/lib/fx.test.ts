import { describe, it, expect } from 'vitest';
import { SUPPORTED_CURRENCIES, convertFromZar } from './fx';

describe('currency conversion', () => {
  it('supports the global display currency list', () => {
    expect(SUPPORTED_CURRENCIES).toContain('ZAR');
    expect(SUPPORTED_CURRENCIES).toContain('USD');
    expect(SUPPORTED_CURRENCIES).toContain('EUR');
    expect(SUPPORTED_CURRENCIES).toContain('GBP');
    expect(SUPPORTED_CURRENCIES).toContain('NGN');
  });

  it('keeps ZAR unchanged', () => {
    expect(convertFromZar(100, 'ZAR', { ZAR: 1, USD: 0.05 })).toBe(100);
  });

  it('recalculates an amount instead of only changing its currency symbol', () => {
    expect(convertFromZar(100, 'USD', { ZAR: 1, USD: 0.05 })).toBe(5);
    expect(convertFromZar(100, 'EUR', { ZAR: 1, EUR: 0.045 })).toBe(4.5);
  });

  it('falls back safely when a rate is unavailable', () => {
    expect(convertFromZar(100, 'CAD', { ZAR: 1 })).toBe(100);
  });
});


