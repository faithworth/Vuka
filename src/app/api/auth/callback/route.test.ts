import { describe, it, expect, vi, beforeEach } from 'vitest';

// This file exists because /api/auth/callback had zero test coverage
// despite being where every Google OAuth signup's role and referral
// attribution gets decided. Specifically guards against the two bugs
// found and fixed alongside this test: (1) a referral code passed via
// ?ref= being silently dropped instead of written to User.referredBy,
// and (2) an invalid/stale ref code being trusted instead of validated
// against a real referrer first.

const mockExchangeCodeForSession = vi.fn();
const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockArtistFindUnique = vi.fn();
const mockArtistCreate = vi.fn();
const mockIndustryUserCreate = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { exchangeCodeForSession: (...args: any[]) => mockExchangeCodeForSession(...args) },
  }),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: (...args: any[]) => mockFindUnique(...args),
      create: (...args: any[]) => mockCreate(...args),
      update: (...args: any[]) => mockUpdate(...args),
    },
    artist: {
      findUnique: (...args: any[]) => mockArtistFindUnique(...args),
      create: (...args: any[]) => mockArtistCreate(...args),
    },
    industryUser: {
      create: (...args: any[]) => mockIndustryUserCreate(...args),
    },
  },
}));

vi.mock('@/lib/utils', () => ({ slugify: (s: string) => s.toLowerCase().replace(/\s+/g, '-') }));
vi.mock('@/lib/emails', () => ({ sendWelcomeArtist: vi.fn() }));
vi.mock('@/lib/security/deviceSessions', () => ({
  registerDeviceSession: vi.fn().mockResolvedValue(undefined),
  getIpFromHeaders: () => '127.0.0.1',
}));
vi.mock('@/lib/security/twoFactor', () => ({ user2FAEnabled: vi.fn().mockResolvedValue(false) }));

import { GET } from './route';

function callbackRequest(params: Record<string, string>) {
  const url = new URL('https://vukamusic.com/api/auth/callback');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString()) as any;
}

const FAKE_SUPABASE_USER = {
  id: 'sb_user_1',
  email: 'newuser@example.com',
  user_metadata: { name: 'New User' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockExchangeCodeForSession.mockResolvedValue({ data: { user: FAKE_SUPABASE_USER }, error: null });
  mockArtistFindUnique.mockResolvedValue(null); // slug is free
  mockCreate.mockImplementation(({ data }: any) => Promise.resolve({ id: 'new_db_user', role: 'fan', artist: null, ...data }));
  // Second findUnique call (device-session lookup) needs an id too.
  mockFindUnique.mockResolvedValue(null);
});

describe('GET /api/auth/callback — referral attribution', () => {
  it('writes referredBy when ?ref= matches a real referral code', async () => {
    // First findUnique call = "does this user already exist" -> no.
    // Second findUnique call = "is this ref code real" -> yes.
    // Third findUnique call = device session lookup by email -> arbitrary.
    mockFindUnique
      .mockResolvedValueOnce(null) // no existing user
      .mockResolvedValueOnce({ id: 'referrer_1', referralCode: 'mzansi-ab12' }) // valid referrer
      .mockResolvedValueOnce({ id: 'new_db_user' }); // device session lookup

    await GET(callbackRequest({ code: 'abc', role: 'artist', ref: 'mzansi-ab12' }));

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ referredBy: 'mzansi-ab12' }) })
    );
  });

  it('does NOT write referredBy for an invalid/unknown ref code (ignored, not hard-failed)', async () => {
    mockFindUnique
      .mockResolvedValueOnce(null)       // no existing user
      .mockResolvedValueOnce(null)       // ref code doesn't match any user
      .mockResolvedValueOnce({ id: 'new_db_user' });

    const res = await GET(callbackRequest({ code: 'abc', role: 'artist', ref: 'not-a-real-code' }));

    expect(res.status).toBe(307); // redirect — signup still succeeds
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ referredBy: null }) })
    );
  });

  it('sets referredBy to null when no ?ref= is present at all', async () => {
    mockFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'new_db_user' });

    await GET(callbackRequest({ code: 'abc', role: 'fan' }));

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ referredBy: null }) })
    );
  });

  it('never re-validates or overwrites referredBy for an EXISTING user', async () => {
    mockFindUnique
      .mockResolvedValueOnce({ id: 'existing_user', role: 'artist', artist: { id: 'a1' }, industryUser: null })
      .mockResolvedValueOnce({ id: 'existing_user' });

    await GET(callbackRequest({ code: 'abc', role: 'artist', ref: 'someone-else' }));

    expect(mockCreate).not.toHaveBeenCalled();
    // update is only called for admin self-heal, not referral changes
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('GET /api/auth/callback — role assignment', () => {
  it('creates an Artist record for a brand-new artist-role signup', async () => {
    mockFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'new_db_user' });

    await GET(callbackRequest({ code: 'abc', role: 'artist' }));

    expect(mockArtistCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'new_db_user' }) })
    );
  });

  it('creates an IndustryUser record for a brand-new industry-role signup', async () => {
    mockFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'new_db_user' });

    await GET(callbackRequest({ code: 'abc', role: 'industry' }));

    expect(mockIndustryUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'new_db_user' }) })
    );
  });

  it('redirects to /auth/login?error=no_code when no code param is present', async () => {
    const res = await GET(callbackRequest({}));
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('error=no_code');
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('redirects to /auth/login?error=oauth_failed when session exchange fails', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: { message: 'bad code' } });
    const res = await GET(callbackRequest({ code: 'bad' }));
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('error=oauth_failed');
  });
});
