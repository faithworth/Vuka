/**
 * VUKA — Shared Zod Validation Schemas
 *
 * Single source of truth for all input validation.
 * Import `schemas` and call `.safeParse(await req.json())` in every route handler.
 * Never trust raw req.json() without validation.
 *
 * Usage:
 *   import { schemas, validationError } from '@/lib/validation';
 *   const parsed = schemas.beat.upload.safeParse(await req.json());
 *   if (!parsed.success) return validationError(parsed.error);
 */

import { z } from 'zod';
import { NextResponse } from 'next/server';

// ── Primitive helpers ─────────────────────────────────────────────────────

/** Trimmed string with max length */
const safeText = (max: number) =>
  z.string().max(max).trim();

/** CUID-shaped ID */
const cuid = () =>
  z.string().regex(/^c[a-z0-9]{24,}$/, 'Invalid ID format');

/** ISO-8601 datetime string */
const isoDate = () =>
  z.string().datetime({ message: 'Must be a valid ISO-8601 datetime' });

/** HTTPS URL */
const httpsUrl = () =>
  z.string().url().refine((u) => u.startsWith('https://'), 'URL must use HTTPS');

/** Positive monetary amount — max 2 decimal places */
const money = () =>
  z.number()
    .positive('Amount must be positive')
    .multipleOf(0.01, 'Maximum 2 decimal places');

// ── Auth ──────────────────────────────────────────────────────────────────

const authRegister = z.object({
  email:      z.string().email().max(254).trim().toLowerCase(),
  name:       safeText(100).min(2, 'Name must be at least 2 characters'),
  password:   z.string().min(10, 'Password must be at least 10 characters').max(128),
  role:       z.enum(['artist', 'fan', 'industry']).default('artist'),
  inviteCode: z.string().max(64).optional(),
});

const authLogin = z.object({
  email:    z.string().email().max(254).trim().toLowerCase(),
  password: z.string().min(1).max(128),
});

const magicLinkRequest = z.object({
  email: z.string().email().max(254).trim().toLowerCase(),
});

// ── Artist profile ────────────────────────────────────────────────────────

const artistUpdate = z.object({
  name:              safeText(100).min(2).optional(),
  bio:               safeText(1000).optional(),
  city:              safeText(100).optional(),
  country:           z.string().length(2).toUpperCase().optional(),
  genreTags:         z.array(safeText(50)).max(10).optional(),
  photoUrl:          httpsUrl().optional().nullable(),
  coverUrl:          httpsUrl().optional().nullable(),
  currency:          z.enum(['ZAR', 'USD', 'EUR', 'GBP', 'NGN', 'KES', 'GHS']).optional(),
  socialLinks:       z.record(z.string().max(20), httpsUrl()).optional(),
  paypalEmail:       z.string().email().max(254).optional().nullable(),
  paystackRecipient: z.string().max(20).trim().optional().nullable(),
});

// ── Beat upload ───────────────────────────────────────────────────────────

export const VALID_GENRES = [
  'Amapiano', 'Gqom', 'Afrobeats', 'Hip-Hop', 'R&B', 'Pop',
  'Trap', 'Drill', 'Dancehall', 'Reggae', 'Soul', 'Jazz',
  'Electronic', 'House', 'Deep House', 'Gospel', 'Kwaito',
  'Maskandi', 'Mbaqanga', 'Neo-Soul', 'Afro-Soul', 'Other',
] as const;

const beatUpload = z.object({
  title:        safeText(200).min(1, 'Title required'),
  price:        z.number().min(0, 'Price cannot be negative'),
  bpm:          z.number().int().min(40).max(300).optional(),
  key:          z.string().max(10).optional(),
  mood:         safeText(50).optional(),
  tags:         z.array(safeText(50)).max(15).default([]),
  genres:       z.array(z.enum(VALID_GENRES)).min(1).max(3),
  audioFileKey: z.string().max(500).min(1, 'Audio file is required'),
  coverUrl:     httpsUrl().optional(),
  isExclusive:  z.boolean().default(false),
  description:  safeText(2000).optional(),
});

// ── Release (selling music directly — no distribution) ───────────────────
//
// Artists upload their music and sell it on Vuka Music. We are not a distributor.
// No ISRC, no UPC, no DSP delivery — just rights, credits, and a price.

const releaseCreate = z.object({
  title:            safeText(200).min(1, 'Title required'),
  type:             z.enum(['single', 'ep', 'album', 'mixtape']),
  genres:           z.array(z.enum(VALID_GENRES)).min(1).max(3),
  releaseDate:      isoDate().optional(),
  isExplicit:       z.boolean().default(false),
  price:            z.number().min(0).optional(),
  primaryLanguage:  z.string().length(2).default('en'),
  // Rights declaration — who owns/wrote/produced this
  copyrightHolder:  safeText(200).optional(),
  copyrightYear:    z.number().int().min(1900).max(new Date().getFullYear() + 2).optional(),
  // Artist confirms ownership before submitting
  rightsConfirmed:  z.boolean().refine((v) => v === true, {
    message: 'You must confirm that you own or control the rights to this content.',
  }),
});

const trackCreate = z.object({
  releaseId:       cuid(),
  title:           safeText(200).min(1),
  trackNumber:     z.number().int().min(1).max(200),
  isExplicit:      z.boolean().default(false),
  composers:       z.array(safeText(100)).max(20).default([]),
  producers:       z.array(safeText(100)).max(20).default([]),
  featuredArtists: z.array(safeText(100)).max(10).default([]),
  audioFileKey:    z.string().max(500).min(1, 'Audio file is required'),
});

// ── Payout ────────────────────────────────────────────────────────────────
//
// SA artists: bank transfer (via Paystack manual payout) or Paystack
// International artists: PayPal

const bankAccountAdd = z.object({
  accountHolder: safeText(100).min(2, 'Account holder name required'),
  bankName:      safeText(60).min(2, 'Bank name required'),
  branchCode:    z.string().max(10).trim().default(''),
  accountNumber: z
    .string()
    .min(6, 'Account number too short')
    .max(20, 'Account number too long')
    .regex(/^\d+$/, 'Account number must be digits only')
    .trim(),
  accountType:   z.enum(['current', 'savings', 'transmission', 'credit']).default('current'),
  isDefault:     z.boolean().default(false),
});

const payoutRequest = z.object({
  amount:        money().min(100, 'Minimum payout is R100'),
  currency:      z.enum(['ZAR', 'USD']).default('ZAR'),
  method:        z.enum(['bank_transfer', 'paystack', 'paypal']),
  bankAccountId: cuid().optional(),
  paypalEmail:   z.string().email().max(254).optional(),
}).refine(
  (d) => d.method !== 'bank_transfer' || !!d.bankAccountId,
  { message: 'bankAccountId is required for bank transfers', path: ['bankAccountId'] }
).refine(
  (d) => d.method !== 'paypal' || !!d.paypalEmail,
  { message: 'paypalEmail is required for PayPal payouts', path: ['paypalEmail'] }
);

// ── Admin actions ─────────────────────────────────────────────────────────

const adminPayoutAction = z.object({
  requestId: cuid(),
  action:    z.enum(['approve', 'reject']),
  notes:     safeText(500).optional(),
});

const adminUserAction = z.object({
  userId: cuid(),
  action: z.enum(['suspend', 'unsuspend', 'verify', 'unverify', 'promote', 'demote']),
  reason: safeText(500).optional(),
  role:   z.enum(['artist', 'industry', 'admin', 'moderator', 'fan']).optional(),
});

const adminReleaseAction = z.object({
  releaseId: cuid(),
  action:    z.enum(['approve', 'reject', 'takedown', 'restore']),
  reason:    safeText(1000).optional(),
});

// ── Social ────────────────────────────────────────────────────────────────

const postCreate = z.object({
  body:       safeText(2000).min(1, 'Post body required'),
  mediaUrls:  z.array(httpsUrl()).max(4).default([]),
  linkType:   z.enum(['beat', 'release', 'external']).optional(),
  linkItemId: cuid().optional(),
  linkUrl:    httpsUrl().optional(),
});

const commentCreate = z.object({
  postId:   cuid(),
  body:     safeText(500).min(1, 'Comment cannot be empty'),
  parentId: cuid().optional(),
});

const reportCreate = z.object({
  entityType: z.enum(['beat', 'release', 'post', 'comment', 'user', 'message']),
  entityId:   cuid(),
  reason:     z.enum(['spam', 'harassment', 'copyright', 'explicit', 'misinformation', 'other']),
  details:    safeText(1000).optional(),
});

// ── Messaging ─────────────────────────────────────────────────────────────

const messageSend = z.object({
  recipientId:   cuid(),
  body:          safeText(2000).min(1, 'Message body required'),
  attachmentUrl: httpsUrl().optional(),
});

// ── Search / Discovery ────────────────────────────────────────────────────

const searchQuery = z.object({
  q:        z.string().max(200).trim().min(1),
  type:     z.enum(['beats', 'artists', 'releases', 'all']).default('all'),
  genre:    z.enum(VALID_GENRES).optional(),
  page:     z.coerce.number().int().min(1).max(500).default(1),
  limit:    z.coerce.number().int().min(1).max(50).default(20),
  sort:     z.enum(['relevance', 'newest', 'popular', 'price_asc', 'price_desc']).default('relevance'),
  minBpm:   z.coerce.number().int().min(40).max(300).optional(),
  maxBpm:   z.coerce.number().int().min(40).max(300).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  country:  z.string().length(2).toUpperCase().optional(),
});

// ── Checkout ──────────────────────────────────────────────────────────────

const paystackInitialize = z.object({
  itemType:   z.enum(['beat', 'release', 'video', 'sample', 'subscription', 'membership']),
  itemId:     z.string().min(1),
  buyerName:  safeText(200).min(1),
  buyerEmail: z.string().email().max(254).trim().toLowerCase(),
  licenseType: z.enum(['standard', 'exclusive', 'sync']).default('standard').optional(),
});

const paypalCreateOrder = z.object({
  itemType:   z.enum(['beat', 'release', 'video', 'sample']),
  itemId:     z.string().min(1),
  buyerEmail: z.string().email().optional(),
});

const paypalCaptureOrder = z.object({
  orderId:    z.string().min(1),
  itemType:   z.enum(['beat', 'release', 'video', 'sample']),
  itemId:     z.string().min(1),
  buyerName:  safeText(200).min(1),
  buyerEmail: z.string().email().max(254).trim().toLowerCase(),
});

// ── Membership ────────────────────────────────────────────────────────────

const membershipTierCreate = z.object({
  name:        safeText(100).min(1, 'Tier name required'),
  description: safeText(1000).optional(),
  priceZAR:    money().min(10, 'Minimum tier price is R10'),
  perks:       z.array(safeText(200)).max(10).default([]),
  isActive:    z.boolean().default(true),
});

// ── Services / Marketplace ────────────────────────────────────────────────

const serviceCreate = z.object({
  title:       safeText(200).min(1, 'Service title required'),
  description: safeText(2000).min(10, 'Description required'),
  category:    z.enum(['mixing', 'mastering', 'production', 'songwriting', 'vocal_recording', 'artwork', 'music_video', 'consultation', 'other']),
  priceZAR:    money().min(50, 'Minimum service price is R50'),
  deliveryDays: z.number().int().min(1).max(90),
  revisions:   z.number().int().min(0).max(10).default(2),
});

// ── Named schema export ───────────────────────────────────────────────────

export const schemas = {
  auth: {
    register:        authRegister,
    login:           authLogin,
    magicLinkRequest,
  },
  artist: {
    update: artistUpdate,
  },
  beat: {
    upload: beatUpload,
  },
  release: {
    create:      releaseCreate,
    trackCreate,
  },
  payout: {
    bankAccountAdd,
    request:  payoutRequest,
  },
  admin: {
    payoutAction:   adminPayoutAction,
    userAction:     adminUserAction,
    releaseAction:  adminReleaseAction,
  },
  social: {
    postCreate,
    commentCreate,
    reportCreate,
  },
  messaging: {
    messageSend,
  },
  search: {
    query: searchQuery,
  },
  checkout: {
    paystackInitialize,
    paypalCreateOrder,
    paypalCaptureOrder,
  },
  membership: {
    tierCreate: membershipTierCreate,
  },
  service: {
    create: serviceCreate,
  },
} as const;

// ── Response helper ───────────────────────────────────────────────────────

/**
 * Returns a 400 JSON response with structured Zod error details.
 * Use this in every route handler after a failed safeParse.
 */
export function validationError(error: z.ZodError): Response {
  return NextResponse.json(
    {
      error:   'Validation failed',
      details: error.flatten(),
    },
    { status: 400 }
  );
}
