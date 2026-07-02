/**
 * VUKA — Internal Error Monitoring
 *
 * Drop-in replacement for Sentry. Exports the identical interface
 * (captureException, captureMessage) so every import across the codebase
 * continues to work without any changes.
 *
 * What this does right now:
 *   - Structured JSON error logging to stdout (Vercel captures this)
 *   - Full stack traces preserved
 *   - Context / tags attached to every event
 *   - Critical errors posted to a Slack/Discord webhook if configured
 *   - Zero external SDK dependencies — no account needed
 *
 * When you're ready for Sentry later:
 *   1. npm install @sentry/nextjs
 *   2. Add SENTRY_DSN to your env
 *   3. Replace this file with the real SDK calls
 *   4. Every import site already uses the right interface — nothing else changes
 *
 * Optional env vars:
 *   ERROR_WEBHOOK_URL — Slack/Discord incoming webhook URL for critical errors
 *   LOG_LEVEL         — 'error' | 'warn' | 'info' | 'debug' (default: 'info')
 *   LOG_SERVICE       — Service name tag included in every log line
 */

type Severity = 'error' | 'warning' | 'info' | 'debug';

export interface ErrorContext {
  userId?:    string;
  releaseId?: string;
  beatId?:    string;
  action?:    string;
  traceId?:   string;
  [key: string]:  unknown;
}

// ── Log level gate ─────────────────────────────────────────────────────────

const LEVEL_RANK: Record<Severity, number> = {
  error:   0,
  warning: 1,
  info:    2,
  debug:   3,
};

function currentLevelRank(): number {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase() as Severity;
  return LEVEL_RANK[raw] ?? LEVEL_RANK.info;
}

function shouldLog(level: Severity): boolean {
  return LEVEL_RANK[level] <= currentLevelRank();
}

// ── Structured log writer ──────────────────────────────────────────────────

function writeLog(
  level:    Severity,
  message:  string,
  error?:   Error,
  context?: ErrorContext,
): void {
  if (!shouldLog(level)) return;

  const entry: Record<string, unknown> = {
    ts:      new Date().toISOString(),
    level,
    service: process.env.LOG_SERVICE ?? 'vuka',
    env:     process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    commit:  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
    message,
  };

  if (error) {
    entry.error = {
      name:    error.name,
      message: error.message,
      stack:   error.stack,
    };
  }

  if (context && Object.keys(context).length > 0) {
    entry.context = context;
  }

  // Vercel captures stdout as structured logs
  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'warning') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

// ── Optional webhook alert (Slack / Discord) ───────────────────────────────
// Only fires on 'error' level — not on warnings or info.
// Set ERROR_WEBHOOK_URL to a Slack incoming webhook or Discord webhook URL.

function postWebhookAlert(message: string, error?: Error, context?: ErrorContext): void {
  const webhookUrl = process.env.ERROR_WEBHOOK_URL;
  if (!webhookUrl) return;

  const env    = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'dev';
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local';

  // Works for both Slack and Discord (Discord accepts Slack-compatible payloads)
  const isDiscord = webhookUrl.includes('discord.com');

  const text = [
    `🚨 *Vuka Music Error* [${env}] [${commit}]`,
    `> ${message}`,
    ...(error?.stack ? [`\`\`\`${error.stack.slice(0, 800)}\`\`\``] : []),
    ...(context?.action  ? [`Action: \`${context.action}\``]  : []),
    ...(context?.userId  ? [`User: \`${context.userId}\``]    : []),
    ...(context?.traceId ? [`Trace: \`${context.traceId}\``]  : []),
  ].join('\n');

  const body = isDiscord
    ? JSON.stringify({ content: text })
    : JSON.stringify({ text });

  fetch(webhookUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => {
    // Never let the alert mechanism crash the app
  });
}

// ── Public API — identical to @sentry/nextjs interface ─────────────────────

/**
 * Capture an exception and log it.
 * Drop-in for Sentry.captureException().
 */
export function captureException(error: unknown, context?: ErrorContext): void {
  const err     = error instanceof Error ? error : new Error(String(error));
  const message = `${err.name}: ${err.message}`;

  writeLog('error', message, err, context);
  postWebhookAlert(message, err, context);
}

/**
 * Capture a message at a given severity level.
 * Drop-in for Sentry.captureMessage().
 */
export function captureMessage(
  message: string,
  level:   Severity = 'info',
  context?: ErrorContext,
): void {
  writeLog(level, message, undefined, context);
  if (level === 'error') postWebhookAlert(message, undefined, context);
}

// ── Convenience re-exports used across the codebase ───────────────────────

export const monitoring = {
  captureException,
  captureMessage,
  info:  (msg: string, ctx?: ErrorContext) => captureMessage(msg, 'info',    ctx),
  warn:  (msg: string, ctx?: ErrorContext) => captureMessage(msg, 'warning', ctx),
  error: (msg: string, ctx?: ErrorContext) => captureMessage(msg, 'error',   ctx),
  debug: (msg: string, ctx?: ErrorContext) => captureMessage(msg, 'debug',   ctx),
} as const;

export default monitoring;
