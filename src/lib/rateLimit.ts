/**
 * VUKA — Rate Limiter (Phase 8 hardened)
 *
 * DB-backed sliding window rate limiting via the SpamSignal table.
 * Works across all Vercel instances. If UPSTASH_REDIS_REST_URL is configured,
 * the Redis path is preferred (lower latency, atomic INCR).
 *
 * Usage:
 *   import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';
 *
 *   const limited = await rateLimit(userId ?? ip, RATE_LIMITS.login_attempt, ip);
 *   if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
 */

import prisma from './prisma';
import { logger } from './logger';
import { auditLog } from './audit';

export interface RateLimitConfig {
  key: string;       // action name stored in SpamSignal.action
  max: number;       // max calls allowed in the window
  windowMs: number;  // window length in milliseconds
}

// ── Rate limit profiles ────────────────────────────────────────

export const RATE_LIMITS = {
  // ── Auth (strictest) ──────────────────────────────────────
  login_attempt:      { key: 'login_attempt',      max: 5,   windowMs: 300_000    }, // 5/5min
  register:           { key: 'register',           max: 3,   windowMs: 3_600_000  }, // 3/hr
  magic_link_request: { key: 'magic_link_request', max: 3,   windowMs: 900_000    }, // 3/15min
  password_reset:     { key: 'password_reset',     max: 3,   windowMs: 3_600_000  },
  email_verify:       { key: 'email_verify',       max: 10,  windowMs: 3_600_000  },

  // ── Payments ──────────────────────────────────────────────
  checkout_init:      { key: 'checkout_init',      max: 10,  windowMs: 60_000     },
  payout_request:     { key: 'payout_request',     max: 3,   windowMs: 3_600_000  }, // 3/hr
  bank_account_add:   { key: 'bank_account_add',   max: 5,   windowMs: 3_600_000  }, // 5/hr

  // ── Uploads ───────────────────────────────────────────────
  beat_upload:        { key: 'beat_upload',        max: 20,  windowMs: 3_600_000  },
  release_upload:     { key: 'release_upload',     max: 10,  windowMs: 3_600_000  },
  avatar_upload:      { key: 'avatar_upload',      max: 10,  windowMs: 3_600_000  },
  social_upload:      { key: 'social_upload',      max: 40,  windowMs: 3_600_000  }, // post/message media, any user

  // ── Social ────────────────────────────────────────────────
  comment_post:       { key: 'comment_post',       max: 10,  windowMs: 60_000     },
  like_toggle:        { key: 'like_toggle',        max: 100, windowMs: 60_000     },
  follow_action:      { key: 'follow_action',      max: 50,  windowMs: 60_000     },
  repost_action:      { key: 'repost_action',      max: 30,  windowMs: 60_000     },
  post_create:        { key: 'post_create',        max: 5,   windowMs: 3_600_000  },
  story_create:       { key: 'story_create',        max: 20,  windowMs: 3_600_000  },
  reel_create:        { key: 'reel_create',         max: 8,   windowMs: 3_600_000  },

  // ── Messaging ─────────────────────────────────────────────
  message_send:       { key: 'message_send',       max: 20,  windowMs: 60_000     },

  // ── Moderation ────────────────────────────────────────────
  report_submit:      { key: 'report_submit',      max: 5,   windowMs: 300_000    }, // 5/5min
  dmca_submit:        { key: 'dmca_submit',        max: 3,   windowMs: 3_600_000  },

  // ── API (general) ─────────────────────────────────────────
  api_general:        { key: 'api_general',        max: 200, windowMs: 60_000     },

  // ── Admin ─────────────────────────────────────────────────
  admin_action:       { key: 'admin_action',       max: 300, windowMs: 60_000     },

  // ── Discovery / Search ────────────────────────────────────
  search:             { key: 'search',             max: 60,  windowMs: 60_000     },
  discovery:          { key: 'discovery',          max: 120, windowMs: 60_000     },
} as const;

// ── Redis path (Upstash — optional, preferred if configured) ──

async function rateLimitRedis(
  subject: string,
  config: RateLimitConfig
): Promise<boolean | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null; // signal: redis not configured

  try {
    const redisKey   = `rl:${config.key}:${subject}`;
    const windowSecs = Math.ceil(config.windowMs / 1000);

    // MULTI-EXEC: INCR + EXPIRE atomically via Upstash HTTP pipeline
    const pipeline = [
      ['INCR', redisKey],
      ['EXPIRE', redisKey, windowSecs, 'NX'], // NX = only set expiry on first call
    ];

    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pipeline),
    });

    if (!res.ok) return null; // fall through to DB path

    const results = await res.json() as Array<{ result: number }>;
    const count = results[0]?.result ?? 0;
    return count > config.max;
  } catch {
    return null; // fall through to DB path
  }
}

// ── DB path (always available) ────────────────────────────────

async function rateLimitDb(
  subject: string,
  config: RateLimitConfig,
  ipAddress?: string
): Promise<boolean> {
  try {
    const windowStart = new Date(Date.now() - config.windowMs);

    const existing = await prisma.spamSignal.findFirst({
      where: {
        userId: subject,
        action: config.key,
        windowStart: { gte: windowStart },
      },
    });

    if (existing) {
      if ((existing as { count: number }).count >= config.max) {
        logger.warn('[rateLimit] Limit exceeded', {
          subject,
          action: config.key,
          count: (existing as { count: number }).count,
          max: config.max,
        });
        await auditLog.securityEvent(
          'security.rate_limit_hit',
          `action=${config.key} subject=${subject}`,
          ipAddress
        );
        return true;
      }
      await prisma.spamSignal.update({
        where: { id: existing.id },
        data: { count: { increment: 1 } },
      });
    } else {
      await prisma.spamSignal.create({
        data: {
          userId: subject,
          action: config.key,
          count: 1,
          windowStart: new Date(),
        },
      });
    }

    return false;
  } catch (err) {
    // Rate limiter failures must never block legitimate traffic
    logger.error('[rateLimit] DB error — failing open', {
      subject,
      action: config.key,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ── Public API ────────────────────────────────────────────────

/**
 * Check if a subject (userId or IP) has exceeded the given rate limit.
 * Returns `true` if the request should be blocked, `false` if allowed.
 *
 * Tries Redis first (if configured), falls back to Postgres.
 */
export async function rateLimit(
  subject: string,
  config: RateLimitConfig,
  ipAddress?: string
): Promise<boolean> {
  const redisResult = await rateLimitRedis(subject, config);
  if (redisResult !== null) return redisResult;
  return rateLimitDb(subject, config, ipAddress);
}

/**
 * Convenience: extract best available subject identifier.
 * Prefers userId, falls back to IP.
 */
export function getRateLimitSubject(userId?: string, ip?: string): string {
  return userId ?? ip ?? 'anonymous';
}

/**
 * Extract client IP from Next.js request headers.
 * Handles Cloudflare (CF-Connecting-IP), Vercel (x-forwarded-for), and fallbacks.
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    headers.get('x-real-ip') ??
    'unknown'
  );
}
