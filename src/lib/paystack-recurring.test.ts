import { describe, it, expect, vi, afterEach } from 'vitest';

const TEST_SECRET = 'sk_test_unit_test_secret_do_not_use_in_prod';
process.env.PAYSTACK_SECRET_KEY = TEST_SECRET;

import { verifyTransaction, chargeAuthorization } from './paystack';

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as any;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyTransaction — authorization capture (feeds auto-billing)', () => {
  it('extracts a reusable authorization code from a successful card charge', async () => {
    mockFetchOnce(200, {
      data: {
        status: 'success',
        reference: 'PLAN_ABC',
        amount: 24900,
        currency: 'ZAR',
        paid_at: '2026-07-22T00:00:00Z',
        channel: 'card',
        metadata: {},
        customer: { email: 'artist@example.com' },
        authorization: { authorization_code: 'AUTH_xyz123', reusable: true },
      },
    });

    const result = await verifyTransaction('PLAN_ABC');
    expect(result.authorizationCode).toBe('AUTH_xyz123');
    expect(result.authorizationReusable).toBe(true);
  });

  it('does not mark a non-reusable authorization as reusable (must not be saved for later charging)', async () => {
    mockFetchOnce(200, {
      data: {
        status: 'success',
        reference: 'PLAN_DEF',
        amount: 24900,
        currency: 'ZAR',
        paid_at: '2026-07-22T00:00:00Z',
        channel: 'card',
        metadata: {},
        customer: { email: 'artist@example.com' },
        authorization: { authorization_code: 'AUTH_onetime', reusable: false },
      },
    });

    const result = await verifyTransaction('PLAN_DEF');
    expect(result.authorizationReusable).toBe(false);
  });

  it('handles bank-transfer / no-authorization payments without throwing (paystackToken stays null downstream)', async () => {
    mockFetchOnce(200, {
      data: {
        status: 'success',
        reference: 'PLAN_GHI',
        amount: 24900,
        currency: 'ZAR',
        paid_at: '2026-07-22T00:00:00Z',
        channel: 'bank_transfer',
        metadata: {},
        customer: { email: 'artist@example.com' },
        // no `authorization` key at all — some channels never return one
      },
    });

    const result = await verifyTransaction('PLAN_GHI');
    expect(result.authorizationCode).toBeUndefined();
    expect(result.authorizationReusable).toBe(false);
  });
});

describe('chargeAuthorization — the actual recurring charge', () => {
  it('returns success status and normalized amount on a successful renewal charge', async () => {
    mockFetchOnce(200, {
      data: {
        status: 'success',
        reference: 'RENEW_1',
        amount: 24900,
        gateway_response: 'Approved',
      },
    });

    const result = await chargeAuthorization({
      email: 'artist@example.com',
      amountZAR: 249,
      authorizationCode: 'AUTH_xyz123',
      reference: 'RENEW_1',
    });

    expect(result.status).toBe('success');
    expect(result.amountZAR).toBe(249);
  });

  it('surfaces a declined charge as a failed status rather than throwing (so the cron can run its grace-period logic)', async () => {
    mockFetchOnce(200, {
      data: {
        status: 'failed',
        reference: 'RENEW_2',
        amount: 24900,
        gateway_response: 'Insufficient Funds',
      },
    });

    const result = await chargeAuthorization({
      email: 'artist@example.com',
      amountZAR: 249,
      authorizationCode: 'AUTH_xyz123',
      reference: 'RENEW_2',
    });

    expect(result.status).toBe('failed');
    expect(result.gatewayResponse).toBe('Insufficient Funds');
  });

  it('throws on a genuine API/network-level error (not just a business decline), so the cron logs it distinctly', async () => {
    mockFetchOnce(401, { message: 'Invalid Authorization' });

    await expect(
      chargeAuthorization({
        email: 'artist@example.com',
        amountZAR: 249,
        authorizationCode: 'AUTH_xyz123',
        reference: 'RENEW_3',
      }),
    ).rejects.toThrow(/Invalid Authorization/);
  });
});
