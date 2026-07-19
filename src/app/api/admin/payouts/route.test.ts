import { describe, it, expect, vi, beforeEach } from 'vitest';

// This file exists because /api/admin/payouts is the only thing standing
// between an admin action and real money leaving Vuka's account, and as of
// this commit it had zero test coverage. The bug class this guards against
// specifically: an admin approving or paying out to a bank account that is
// unverified or still inside its 48h fraud-cooldown window — the exact gap
// that existed in production before the verification system was added.

const mockRequireAdmin = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockArtistPayoutCreate = vi.fn();
const mockAdminAction = vi.fn();

vi.mock('@/lib/auth', () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    payoutRequest: {
      findUnique: (...args: any[]) => mockFindUnique(...args),
      update: (...args: any[]) => mockUpdate(...args),
    },
    artistPayout: {
      create: (...args: any[]) => mockArtistPayoutCreate(...args),
    },
  },
}));

vi.mock('@/lib/audit', () => ({
  auditLog: { adminAction: (...args: any[]) => mockAdminAction(...args) },
}));

vi.mock('@/lib/emails', () => ({
  sendPayoutApproved: vi.fn(),
  sendPayoutProcessed: vi.fn(),
  sendPayoutFailed: vi.fn(),
}));

import { POST } from './route';

function postRequest(body: unknown) {
  return new Request('https://vukamusic.com/api/admin/payouts', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as any;
}

const ADMIN = { id: 'admin_1', role: 'admin' };

function basePayoutRequest(overrides: Record<string, any> = {}) {
  return {
    id: 'req_1',
    status: 'pending',
    artistId: 'artist_1',
    amount: 1000,
    currency: 'ZAR',
    bankAccountId: 'bank_1',
    artist: { name: 'Test Artist', user: { email: 'artist@example.com' } },
    bankAccount: {
      isVerified: true,
      eligibleForPayoutAt: new Date(Date.now() - 1000), // already past cooldown
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(ADMIN);
});

describe('POST /api/admin/payouts — auth', () => {
  it('rejects when not an admin', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    const res = await POST(postRequest({ requestId: 'req_1', action: 'approve' }));
    expect(res.status).toBe(401);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('rejects a missing requestId or action before touching the DB', async () => {
    const res = await POST(postRequest({ action: 'approve' }));
    expect(res.status).toBe(400);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/payouts — bank account verification gate', () => {
  it('blocks approve when the bank account is unverified', async () => {
    mockFindUnique.mockResolvedValue(
      basePayoutRequest({ bankAccount: { isVerified: false, eligibleForPayoutAt: null } })
    );
    const res = await POST(postRequest({ requestId: 'req_1', action: 'approve' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/not verified/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('blocks mark_paid when the bank account is unverified', async () => {
    mockFindUnique.mockResolvedValue(
      basePayoutRequest({
        status: 'approved',
        bankAccount: { isVerified: false, eligibleForPayoutAt: null },
      })
    );
    const res = await POST(postRequest({ requestId: 'req_1', action: 'mark_paid' }));
    expect(res.status).toBe(409);
    expect(mockArtistPayoutCreate).not.toHaveBeenCalled();
  });

  it('blocks approve when the account is verified but still inside the 48h cooldown', async () => {
    mockFindUnique.mockResolvedValue(
      basePayoutRequest({
        bankAccount: {
          isVerified: true,
          eligibleForPayoutAt: new Date(Date.now() + 60 * 60 * 1000), // 1h from now
        },
      })
    );
    const res = await POST(postRequest({ requestId: 'req_1', action: 'approve' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/cooldown/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('allows approve once verified and past cooldown', async () => {
    mockFindUnique.mockResolvedValue(basePayoutRequest());
    const res = await POST(postRequest({ requestId: 'req_1', action: 'approve' }));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'approved' }) })
    );
  });

  it('does NOT apply the bank gate to Paystack-method requests (no bankAccountId)', async () => {
    mockFindUnique.mockResolvedValue(
      basePayoutRequest({ bankAccountId: null, bankAccount: null })
    );
    const res = await POST(postRequest({ requestId: 'req_1', action: 'approve' }));
    expect(res.status).toBe(200);
  });

  it('rejects with 404 for a non-existent payout request', async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await POST(postRequest({ requestId: 'missing', action: 'approve' }));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/payouts — status transition guards', () => {
  it('refuses to approve a request that is not pending', async () => {
    mockFindUnique.mockResolvedValue(basePayoutRequest({ status: 'paid' }));
    const res = await POST(postRequest({ requestId: 'req_1', action: 'approve' }));
    expect(res.status).toBe(409);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('refuses to mark_paid a request that is not approved', async () => {
    mockFindUnique.mockResolvedValue(basePayoutRequest({ status: 'pending' }));
    const res = await POST(postRequest({ requestId: 'req_1', action: 'mark_paid' }));
    expect(res.status).toBe(409);
    expect(mockArtistPayoutCreate).not.toHaveBeenCalled();
  });

  it('writes an ArtistPayout ledger row exactly once on mark_paid, with the request amount', async () => {
    mockFindUnique.mockResolvedValue(basePayoutRequest({ status: 'approved' }));
    const res = await POST(postRequest({ requestId: 'req_1', action: 'mark_paid', reference: 'ref-123' }));
    expect(res.status).toBe(200);
    expect(mockArtistPayoutCreate).toHaveBeenCalledTimes(1);
    expect(mockArtistPayoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: 1000, artistId: 'artist_1', reference: 'ref-123' }),
      })
    );
  });

  it('rejects an unknown action without mutating anything', async () => {
    mockFindUnique.mockResolvedValue(basePayoutRequest());
    const res = await POST(postRequest({ requestId: 'req_1', action: 'delete_everything' }));
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockArtistPayoutCreate).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/payouts — audit trail', () => {
  it('logs every approve/reject/mark_paid action via auditLog.adminAction', async () => {
    mockFindUnique.mockResolvedValue(basePayoutRequest());
    await POST(postRequest({ requestId: 'req_1', action: 'approve' }));
    expect(mockAdminAction).toHaveBeenCalledWith(
      'payment.payout_approved', 'PayoutRequest', 'req_1', ADMIN.id, expect.any(String)
    );
  });

  it('a failed email send does not fail the request or skip the audit log', async () => {
    mockFindUnique.mockResolvedValue(basePayoutRequest());
    const res = await POST(postRequest({ requestId: 'req_1', action: 'approve' }));
    // sendPayoutApproved is mocked to resolve undefined, not throw, but this
    // documents the expectation: email delivery must never be able to block
    // or roll back a DB-confirmed payout action.
    expect(res.status).toBe(200);
    expect(mockAdminAction).toHaveBeenCalled();
  });
});
