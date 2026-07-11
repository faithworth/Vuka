import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// verifyPaystackWebhook reads PAYSTACK_SECRET_KEY from process.env at
// module-load time, so the env var must be set BEFORE the module is
// imported. We set it here and use a dynamic import to guarantee ordering.
const TEST_SECRET = 'sk_test_unit_test_secret_do_not_use_in_prod';
process.env.PAYSTACK_SECRET_KEY = TEST_SECRET;

let verifyPaystackWebhook: (rawBody: string, signature: string) => boolean;

beforeAll(async () => {
  const mod = await import('./paystack');
  verifyPaystackWebhook = mod.verifyPaystackWebhook;
});

function signWith(secret: string, body: string): string {
  return crypto.createHmac('sha512', secret).update(body).digest('hex');
}

describe('verifyPaystackWebhook — the gate for every money-moving webhook', () => {
  it('accepts a payload signed with the correct secret', () => {
    const body = JSON.stringify({ event: 'charge.success', data: { reference: 'VKB_ABC123' } });
    const signature = signWith(TEST_SECRET, body);
    expect(verifyPaystackWebhook(body, signature)).toBe(true);
  });

  it('rejects a payload signed with the wrong secret (forged webhook)', () => {
    const body = JSON.stringify({ event: 'charge.success', data: { reference: 'VKB_ABC123' } });
    const signature = signWith('sk_test_an_attackers_guess', body);
    expect(verifyPaystackWebhook(body, signature)).toBe(false);
  });

  it('rejects a correctly-signed body that was tampered with after signing (amount changed)', () => {
    const original = JSON.stringify({ event: 'charge.success', data: { amount: 50000 } });
    const signature = signWith(TEST_SECRET, original);
    const tampered = JSON.stringify({ event: 'charge.success', data: { amount: 5 } });
    expect(verifyPaystackWebhook(tampered, signature)).toBe(false);
  });

  it('rejects an empty signature', () => {
    const body = JSON.stringify({ event: 'charge.success' });
    expect(verifyPaystackWebhook(body, '')).toBe(false);
  });

  it('rejects a signature of the wrong length rather than throwing', () => {
    const body = JSON.stringify({ event: 'charge.success' });
    expect(() => verifyPaystackWebhook(body, 'deadbeef')).not.toThrow();
    expect(verifyPaystackWebhook(body, 'deadbeef')).toBe(false);
  });

  it('rejects a non-hex signature rather than throwing', () => {
    const body = JSON.stringify({ event: 'charge.success' });
    expect(() => verifyPaystackWebhook(body, 'not-a-hex-string!!')).not.toThrow();
    expect(verifyPaystackWebhook(body, 'not-a-hex-string!!')).toBe(false);
  });
});
