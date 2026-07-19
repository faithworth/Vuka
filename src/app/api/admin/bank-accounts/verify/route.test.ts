import { describe, it, expect, vi, beforeEach } from 'vitest';

// This endpoint is the only code path in the entire app that can ever set
// isVerified: true on a bank account. If this silently breaks, every payout
// permanently fails the gate in /api/admin/payouts and no artist can ever
// get paid by bank transfer — the opposite failure mode from the one that
// prompted building the gate in the first place, but just as damaging.

const mockRequireAdmin = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockAdminAction = vi.fn();

vi.mock('@/lib/auth', () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    artistBankAccount: {
      findUnique: (...args: any[]) => mockFindUnique(...args),
      update: (...args: any[]) => mockUpdate(...args),
    },
  },
}));

vi.mock('@/lib/audit', () => ({
  auditLog: { adminAction: (...args: any[]) => mockAdminAction(...args) },
}));

import { POST } from './route';

function postRequest(body: unknown) {
  return new Request('https://vukamusic.com/api/admin/bank-accounts/verify', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({ id: 'admin_1', role: 'admin' });
  mockFindUnique.mockResolvedValue({ id: 'bank_1' });
  mockUpdate.mockImplementation(({ data }: any) => Promise.resolve({ id: 'bank_1', ...data }));
});

describe('POST /api/admin/bank-accounts/verify', () => {
  it('rejects non-admins', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    const res = await POST(postRequest({ bankAccountId: 'bank_1', verified: true }));
    expect(res.status).toBe(401);
  });

  it('requires bankAccountId and a boolean verified field', async () => {
    const res = await POST(postRequest({ bankAccountId: 'bank_1' }));
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('404s for a bank account that does not exist', async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await POST(postRequest({ bankAccountId: 'nope', verified: true }));
    expect(res.status).toBe(404);
  });

  it('marking verified=true sets isVerified, verifiedAt, and a verification method', async () => {
    const res = await POST(postRequest({ bankAccountId: 'bank_1', verified: true, method: 'manual_call' }));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isVerified: true,
          verifiedAt: expect.any(Date),
          verificationMethod: 'manual_call',
        }),
      })
    );
  });

  it('defaults verificationMethod to manual_admin_review when none is given', async () => {
    await POST(postRequest({ bankAccountId: 'bank_1', verified: true }));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ verificationMethod: 'manual_admin_review' }) })
    );
  });

  it('marking verified=false clears verifiedAt and verificationMethod (revocation)', async () => {
    await POST(postRequest({ bankAccountId: 'bank_1', verified: false }));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isVerified: false, verifiedAt: null, verificationMethod: null }),
      })
    );
  });

  it('every verification change is written to the admin audit log', async () => {
    await POST(postRequest({ bankAccountId: 'bank_1', verified: true }));
    expect(mockAdminAction).toHaveBeenCalledWith(
      'payment.bank_account_verified', 'ArtistBankAccount', 'bank_1', 'admin_1', expect.any(String)
    );
  });
});
