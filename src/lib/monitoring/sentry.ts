/**
 * VUKA — Sentry Error Tracking
 * Phase 11 — Infrastructure & Deployment
 *
 * Lightweight server-side Sentry integration using the HTTP API directly.
 * For production, also install @sentry/nextjs and configure sentry.server.config.ts.
 *
 * Usage:
 *   import { captureException, captureMessage } from '@/lib/monitoring/sentry';
 *   captureException(error, { userId, releaseId });
 */

const SENTRY_DSN = process.env.SENTRY_DSN;

interface SentryContext {
  userId?: string;
  releaseId?: string;
  action?: string;
  [key: string]: unknown;
}

function parseDSN(dsn: string): { endpoint: string; publicKey: string; projectId: string } | null {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace('/', '');
    const host = url.host;
    return {
      endpoint: `https://${host}/api/${projectId}/store/`,
      publicKey,
      projectId,
    };
  } catch {
    return null;
  }
}

function buildEvent(
  level: 'error' | 'warning' | 'info',
  message: string,
  error?: Error,
  context?: SentryContext,
) {
  return {
    timestamp: new Date().toISOString(),
    level,
    platform: 'node',
    sdk: { name: 'vuka.sentry.server', version: '1.0.0' },
    server_name: process.env.VERCEL_URL ?? 'localhost',
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
    message: { formatted: message },
    ...(error ? {
      exception: {
        values: [{
          type: error.name,
          value: error.message,
          stacktrace: {
            frames: (error.stack ?? '')
              .split('\n')
              .slice(1)
              .map((line) => ({ filename: line.trim() })),
          },
        }],
      },
    } : {}),
    contexts: {
      runtime: { name: 'node', version: process.version },
      ...(context ? { vuka: context } : {}),
    },
    user: context?.userId ? { id: context.userId } : undefined,
    tags: {
      ...(context?.action ? { action: String(context.action) } : {}),
      ...(context?.releaseId ? { releaseId: String(context.releaseId) } : {}),
    },
  };
}

async function sendToSentry(
  level: 'error' | 'warning' | 'info',
  message: string,
  error?: Error,
  context?: SentryContext,
): Promise<void> {
  if (!SENTRY_DSN) return;

  const parsed = parseDSN(SENTRY_DSN);
  if (!parsed) return;

  const event = buildEvent(level, message, error, context);

  fetch(parsed.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=vuka/1.0`,
    },
    body: JSON.stringify(event),
  }).catch(() => {
    // Never let Sentry failures break the app
  });
}

export function captureException(error: unknown, context?: SentryContext): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const message = `${err.name}: ${err.message}`;
  sendToSentry('error', message, err, context);
}

export function captureMessage(
  message: string,
  level: 'error' | 'warning' | 'info' = 'info',
  context?: SentryContext,
): void {
  sendToSentry(level, message, undefined, context);
}
