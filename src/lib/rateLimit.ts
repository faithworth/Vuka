/**
 * VUKA — Rate Limiter
 *
 * DB-backed rate limiting via the SpamSignal table. Works across multiple
 * Vercel instances (unlike in-memory limiters). Redis-ready: swap
 * checkRateLimit() internals for Redis INCR if you add Redis later.
 *
 * Usage:
 *   import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit';
 *
 *   const limited = await rateLimit(userId ?? ipAddress, RATE_LIMITS.comment_post);
 *   if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
 */

import prisma from './prisma';
import { logger } from './logger';
import { auditLog } from './audit';

export interface RateLimitConfig {
  key: string;        // action name stored in SpamSignal.action
  max: number;        // max calls allowed in window
  windowMs: number;   // window in milliseconds
}

export const RATE_LIMITS = {
  // Social
  comment_post:    { key: 'comment_post',    max: 10,  windowMs: 60_000  },
  like_toggle:     { key: 'like_toggle',     max: 100, windowMs: 60_000  },
  follow_action:   { key: 'follow_action',   max: 50,  windowMs: 60_000  },
  repost_action:   { key: 'repost_action',   max: 30,  windowMs: 60_000  },
  post_create:     { key: 'post_create',     max: 5,   windowMs: 3_600_000 }, // 5/hour

  // Messaging
  message_send:    { key: 'message_send',    max: 20,  windowMs: 60_000  },

  // Reports
  report_submit:   { key: 'report_submit',   max: 5,   windowMs: 300_000 }, // 5/5min
  dmca_submit:     { key: 'dmca_submit',     max: 3,   windowMs: 3_600_000 },

  // Auth
  login_attempt:   { key: 'login_attempt',   max: 10,  windowMs: 300_000 }, // 10/5min
  register:        { key: 'register',        max: 3,   windowMs: 3_600_000 },

  // Payments
  checkout_init:   { key: 'checkout_init',   max: 10,  windowMs: 60_000  },

  // Uploads
  beat_upload:     { key: 'beat_upload',     max: 20,  windowMs: 3_600_000 }, // 20/hour
  release_upload:  { key: 'release_upload',  max: 10,  windowMs: 3_600_000 },

  // API general
  api_general:     { key: 'api_general',     max: 200, windowMs: 60_000  },
} as const;

/**
 * Check if a subject (userId or IP address) has exceeded the given rate limit.
 * Returns `true` if the request should be blocked, `false` if allowed.
 *
 * Side effect: increments the counter in the SpamSignal table.
 */
export async function rateLimit(
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
        // Limit exceeded
        logger.warn('[rateLimit] Limit exceeded', {
          subject,
          action: config.key,
          count: (existing as { count: number }).count,
          max: config.max,
        });
        await auditLog.securityEvent('security.rate_limit_hit', `action=${config.key} subject=${subject}`, ipAddress);
        return true;
      }

      // Increment counter
      await prisma.spamSignal.update({
        where: { id: existing.id },
        data: { count: { increment: 1 } },
      });
    } else {
      // First request in window
      await prisma.spamSignal.create({
        data: {
          userId: subject,
          action: config.key,
          count: 1,
          windowStart: new Date(),
        },
      });
    }

    return false; // allowed
  } catch (err) {
    // If rate limiter itself fails, fail open (allow request) — never block legitimate traffic
    logger.error('[rateLimit] DB error — failing open', {
      subject,
      action: config.key,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Convenience: extract best available subject identifier from a request.
 * Prefers userId, falls back to IP.
 */
export function getRateLimitSubject(userId?: string, ip?: string): string {
  return userId ?? ip ?? 'anonymous';
}

/**
 * Extract client IP from Next.js request headers.
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    headers.get('x-real-ip') ??
    'unknown'
  );
}
