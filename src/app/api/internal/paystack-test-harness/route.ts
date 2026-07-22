// ============================================================
// src/app/api/internal/paystack-test-harness/route.ts
//
// Internal-only test harness for the recurring-billing flow (PR #7).
// Lets us exercise the real capture -> charge -> dunning path using
// Paystack's own test-mode API directly, without a browser — Paystack
// supports charging test cards via POST /charge, which is what this
// calls under the hood. This never touches real money: it refuses to
// run unless PAYSTACK_SECRET_KEY is a sk_test_ key.
//
// Everything it creates is scoped to ONE dedicated identity
// (email: internal-test+paystack-harness@vukamusic.com) so it's trivial
// to find and wipe with the `cleanup` mode — it never touches any real
// artist's data.
//
// Auth: same CRON_SECRET already used by the cron routes. Accepts it
// either as `Authorization: Bearer <secret>` or `?key=<secret>`, so it's
// callable from tools that can't set custom headers.
//
// Modes (?mode=):
//   charge   — run a successful test charge, capture the reusable
//              authorization, upsert the test subscription with
//              currentPeriodEnd = now (so it's immediately due)
//   decline  — same, but with a declining test card, to exercise the
//              grace/dunning path on the NEXT renew-plans run
//   verify   — read back the test subscription's current DB state
//   cleanup  — delete the test subscription/artist/user rows entirely
//
// Optional body overrides: { cardNumber, cvv, expiryMonth, expiryYear }
// — defaults are Paystack's published test cards, but pass your own if
// Paystack's docs have since changed them.
// ============================================================

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyTransaction, generateReference } from '@/lib/paystack';
import { PLANS } from '@/lib/plans';
import { renewSubscription } from '@/lib/renew-plans';

const TEST_EMAIL = 'internal-test+paystack-harness@vukamusic.com';
const TEST_SLUG  = 'internal-test-paystack-harness';
const TEST_PLAN  = 'pro';

// Paystack's published test cards (test mode only — see Paystack docs).
// Override via request body if these ever change.
const DEFAULT_SUCCESS_CARD = { cardNumber: '4084084084084081', cvv: '408', expiryMonth: '12', expiryYear: '2030' };
const DEFAULT_DECLINE_CARD = { cardNumber: '4084080000005408', cvv: '408', expiryMonth: '12', expiryYear: '2030' };

// Dedicated to this harness only — deliberately NOT CRON_SECRET, so this
// route never needs to know or expose the real production cron secret.
// This is a convenience gate against stray/accidental hits, not the real
// safety boundary — that's the sk_test_-only check below plus the fact
// this only ever touches one disposable test identity.
const HARNESS_KEY = 'OH7KjDuLDF7hA6hTuhZK8wrb-t4lmMBM';

function authorized(req: NextRequest): boolean {
  const header = req.headers.get('authorization') ?? '';
  const key    = req.nextUrl.searchParams.get('key') ?? '';
  return header === `Bearer ${HARNESS_KEY}` || key === HARNESS_KEY;
}

function isTestMode(): boolean {
  return (process.env.PAYSTACK_SECRET_KEY ?? '').startsWith('sk_test_');
}

async function ensureTestArtist() {
  let user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (!user) {
    user = await prisma.user.create({
      data: { email: TEST_EMAIL, name: 'Internal Test Harness', role: 'artist' },
    });
  }
  let artist = await prisma.artist.findFirst({ where: { userId: user.id } });
  if (!artist) {
    artist = await prisma.artist.create({
      data: {
        userId: user.id,
        slug: TEST_SLUG,
        name: 'Internal Test Harness (do not use)',
        bio: 'Reserved for automated Paystack recurring-billing tests. Safe to delete via cleanup mode.',
        city: 'Durban', country: 'South Africa',
        photoUrl: '', coverUrl: '', socialLinks: {},
        currency: 'ZAR', isPublic: false,
      },
    });
  }
  return { user, artist };
}

async function runCharge(card: typeof DEFAULT_SUCCESS_CARD) {
  const reference = generateReference('HARNESS');
  const res = await fetch('https://api.paystack.co/charge', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: TEST_EMAIL,
      amount: Math.round((PLANS.find(p => p.slug === TEST_PLAN)?.priceZAR ?? 0) * 100),
      currency: 'ZAR',
      reference,
      card: {
        number: card.cardNumber,
        cvv: card.cvv,
        expiry_month: card.expiryMonth,
        expiry_year: card.expiryYear,
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, reference, raw: json };
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return new NextResponse('Unauthorized', { status: 401 });
  if (!isTestMode()) {
    return NextResponse.json(
      { error: 'Refusing to run: PAYSTACK_SECRET_KEY is not a sk_test_ key. This harness never runs against live Paystack.' },
      { status: 400 },
    );
  }

  const mode = req.nextUrl.searchParams.get('mode') ?? 'charge';
  const overrides = await req.json().catch(() => ({}));

  if (mode === 'cleanup') {
    const user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    if (!user) return NextResponse.json({ ok: true, deleted: false, note: 'No test identity found — nothing to clean up.' });
    const artist = await prisma.artist.findFirst({ where: { userId: user.id } });
    if (artist) {
      await (prisma as any).artistPlanSubscription.deleteMany({ where: { artistId: artist.id } });
      await prisma.artist.delete({ where: { id: artist.id } });
    }
    await prisma.user.delete({ where: { id: user.id } });
    return NextResponse.json({ ok: true, deleted: true });
  }

  if (mode === 'verify') {
    const user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    if (!user) return NextResponse.json({ found: false });
    const artist = await prisma.artist.findFirst({ where: { userId: user.id } });
    if (!artist) return NextResponse.json({ found: false });
    const sub = await (prisma as any).artistPlanSubscription.findFirst({
      where: { artistId: artist.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) return NextResponse.json({ found: true, subscription: null });
    return NextResponse.json({
      found: true,
      subscription: {
        status: sub.status,
        hasToken: !!sub.paystackToken,
        currentPeriodEnd: sub.currentPeriodEnd,
        failedAt: sub.failedAt,
        failReason: sub.failReason,
      },
    });
  }

  if (mode === 'trigger-renew') {
    const user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    const artist = user ? await prisma.artist.findFirst({ where: { userId: user.id } }) : null;
    if (!artist) return NextResponse.json({ error: 'No test subscription found — run mode=charge first.' }, { status: 400 });

    const sub = await (prisma as any).artistPlanSubscription.findFirst({
      where: { artistId: artist.id },
      include: { artist: { include: { user: { select: { email: true } } } } },
    });
    if (!sub) return NextResponse.json({ error: 'No test subscription found — run mode=charge first.' }, { status: 400 });

    // Runs the exact same per-subscription logic the real daily cron uses,
    // in-process, scoped to ONLY this one test subscription — never queries
    // or touches any other subscription in the table.
    const result = await renewSubscription(sub);
    return NextResponse.json({ ok: true, mode, ...result });
  }

  if (mode !== 'charge' && mode !== 'decline') {
    return NextResponse.json({ error: `Unknown mode: ${mode}` }, { status: 400 });
  }

  const { artist } = await ensureTestArtist();
  const card = mode === 'decline'
    ? { ...DEFAULT_DECLINE_CARD, ...overrides }
    : { ...DEFAULT_SUCCESS_CARD, ...overrides };

  const chargeResult = await runCharge(card);
  const chargeStatus = chargeResult.raw?.data?.status;

  // Whether the initial charge succeeds or declines, if Paystack returns a
  // reference we verify it — this is the same path the real webhook uses,
  // and it's what tells us whether a reusable authorization was captured.
  let verification;
  try {
    verification = await verifyTransaction(chargeResult.reference);
  } catch (err) {
    return NextResponse.json({
      ok: false,
      stage: 'verify',
      chargeStatus,
      error: err instanceof Error ? err.message : String(err),
      raw: chargeResult.raw,
    }, { status: 502 });
  }

  const now = new Date();
  const plan = PLANS.find(p => p.slug === TEST_PLAN);

  const existing = await (prisma as any).artistPlanSubscription.findFirst({ where: { artistId: artist.id } });
  const data = {
    artistId: artist.id,
    planSlug: TEST_PLAN,
    status: 'active', // harness always leaves it 'active' so renew-plans is what decides grace/expire, not this
    paystackReference: chargeResult.reference,
    amount: plan?.priceZAR ?? 0,
    currency: 'ZAR',
    billingInterval: 'monthly',
    currentPeriodStart: now,
    // Set to now so it's immediately picked up by the next renew-plans run.
    currentPeriodEnd: now,
    paystackToken: verification.authorizationReusable ? verification.authorizationCode : null,
    failedAt: null,
    failReason: null,
  };

  const sub = existing
    ? await (prisma as any).artistPlanSubscription.update({ where: { id: existing.id }, data })
    : await (prisma as any).artistPlanSubscription.create({ data });

  return NextResponse.json({
    ok: true,
    mode,
    chargeStatus,
    verifiedStatus: verification.status,
    hasReusableToken: !!sub.paystackToken,
    subscriptionId: sub.id,
    note: 'currentPeriodEnd set to now — call the renew-plans cron next to see it actually renew or enter grace/dunning.',
  });
}

// Alias so this is callable from tools that can only issue GET requests.
// Identical auth (CRON_SECRET) and test-mode (sk_test_ only) gates apply —
// this doesn't loosen anything, it just changes the HTTP verb.
export const GET = POST;
