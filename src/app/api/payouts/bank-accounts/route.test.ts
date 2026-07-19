import { describe, it, expect, vi, beforeEach } from 'vitest';

// Confirms new bank accounts actually get eligibleForPayoutAt set on creation.
// Without this, the cooldown check in /api/admin/payouts is a no-op for any
// account where the field is null, since the route only enforces the
// cooldown "if (acct.eligibleForPayoutAt && ...)" — a silent bypass, not a
// crash, which is exactly the kind of regression tests need to catch here.

const mockRequireArtist = vi.fn();
const mockTransaction = vi.fn();
const mockCreate = vi.fn();
const mockUpdateMany = vi.fn();
const mockCount = vi.fn();
const mockFindFirst = vi.fn();
const mockRateLimit = vi.fn();

vi.mock('@/lib/auth', () => ({ requireArtist: () => mockRequireArtist() }));

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: (fn: any) => mockTransaction(fn),
    artistBankAccount: {
      findFirst: (...args: any[]) => mockFindFirst(...args),
    },
  },
}));

vi.mock('@/lib/encryption', () => ({
  encrypt: (v: string) => `enc(${v})`,
  maskAccountNumber: (v: string) => `****${v.slice(-4)}`,
}));

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: (...args: any[]) => mockRateLimit(...args),
  RATE_LIMITS: { api_general: 'api_general' },
  getClientIp: () => '127.0.0.1',
}));

import { POST } from './route';

function postRequest(body: unknown) {
  return new Request('https://vukamusic.com/api/payouts/bank-accounts', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as any;
}

const VALID_BODY = {
  accountHolder: 'Test Artist',
  bankName: 'Capitec',
  accountNumber: '1234567890',
  accountType: 'savings' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireArtist.mockResolvedValue({ id: 'user_1', artist: { id: 'artist_1' } });
  mockRateLimit.mockResolvedValue(false);
  mockFindFirst.mockResolvedValue({ id: 'created_1', isVerified: false });

  // Emulate the tx callback with a minimal tx object matching real usage.
  mockTransaction.mockImplementation(async (fn: any) => {
    const tx = {
      artistBankAccount: {
        updateMany: (...args: any[]) => mockUpdateMany(...args),
        count: (...args: any[]) => mockCount(...args),
        create: (...args: any[]) => mockCreate(...args),
      },
    };
    mockCount.mockResolvedValue(0);
    return fn(tx);
  });
});

describe('POST /api/payouts/bank-accounts', () => {
  it('rejects unauthenticated / non-artist users', async () => {
    mockRequireArtist.mockResolvedValue(null);
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('rejects an account number that is not all digits', async () => {
    const res = await POST(postRequest({ ...VALID_BODY, accountNumber: '12ab567890' }));
    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('sets isVerified: false and a 48h eligibleForPayoutAt on every new account', async () => {
    const before = Date.now();
    await POST(postRequest(VALID_BODY));
    const createArgs = mockCreate.mock.calls[0][0];
    expect(createArgs.data.isVerified).toBe(false);
    const eligibleAt = new Date(createArgs.data.eligibleForPayoutAt).getTime();
    // Should be ~48h out, allow a few seconds of test-run slack either side.
    expect(eligibleAt).toBeGreaterThan(before + 47.9 * 60 * 60 * 1000);
    expect(eligibleAt).toBeLessThan(before + 48.1 * 60 * 60 * 1000);
  });

  it('never stores the raw account number — only the encrypted blob and masked display', async () => {
    await POST(postRequest(VALID_BODY));
    const createArgs = mockCreate.mock.calls[0][0];
    expect(createArgs.data.accountNumber).toBe('enc(1234567890)');
    expect(createArgs.data.maskedNumber).toBe('****7890');
  });

  it('is rate-limited', async () => {
    mockRateLimit.mockResolvedValue(true);
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(429);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('clears other defaults first when the new account is marked default', async () => {
    await POST(postRequest({ ...VALID_BODY, isDefault: true }));
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isDefault: false } })
    );
  });

  it('auto-defaults the first account for an artist even without isDefault set', async () => {
    await POST(postRequest(VALID_BODY));
    const createArgs = mockCreate.mock.calls[0][0];
    expect(createArgs.data.isDefault).toBe(true);
  });
});
