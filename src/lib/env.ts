/**
 * VUKA — Environment Validation (Phase 11 — Infrastructure Complete)
 *
 * Called once at startup. Crashes loudly if a required variable is missing
 * so misconfigured deploys are caught immediately rather than silently failing.
 *
 * Changes from Phase 8:
 *  - Added PAYPAL_* variables (international payouts)
 *  - Flutterwave upgraded to required (production Africa routing)
 *  - Added POSTHOG_KEY, SENTRY_DSN, BETTER_UPTIME_API_KEY
 *  - Added NEXT_PUBLIC_CF_CDN_URL for Cloudflare CDN audio delivery
 *  - Added VERCEL_ENV guard for region checks
 *  - NODE_ENV guard: loosens requirements in test/CI environments
 */

interface EnvVar {
  key: string;
  required: boolean | 'production'; // 'production' = required only in prod
  description: string;
  /** Return error message string or null */
  validate?: (val: string) => string | null;
}

const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';

const ENV_MANIFEST: EnvVar[] = [
  // ── Database ────────────────────────────────────────────────────────────
  {
    key: 'DATABASE_URL',
    required: true,
    description: 'PostgreSQL pooled connection string (Supabase PgBouncer)',
    validate: (v) =>
      v.startsWith('postgresql://') || v.startsWith('postgres://')
        ? null
        : 'Must be a postgresql:// URL',
  },
  {
    key: 'DIRECT_URL',
    required: true,
    description: 'PostgreSQL direct connection (Supabase — for Prisma migrations)',
    validate: (v) =>
      v.startsWith('postgresql://') || v.startsWith('postgres://')
        ? null
        : 'Must be a postgresql:// URL',
  },

  // ── Supabase Auth ────────────────────────────────────────────────────────
  { key: 'NEXT_PUBLIC_SUPABASE_URL',      required: true, description: 'Supabase project URL' },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true, description: 'Supabase anon key (safe for browser)' },
  {
    key: 'SUPABASE_SERVICE_ROLE_KEY',
    required: true,
    description: 'Supabase service role key — NEVER expose to client',
    validate: (v) => (v.startsWith('eyJ') ? null : 'Expected a JWT (starts with eyJ)'),
  },

  // ── App ──────────────────────────────────────────────────────────────────
  {
    key: 'NEXT_PUBLIC_APP_URL',
    required: true,
    description: 'Full public URL (e.g. https://www.vuka.app)',
    validate: (v) => (v.startsWith('https://') ? null : 'Must start with https://'),
  },
  {
    key: 'ADMIN_EMAIL',
    required: true,
    description: 'Superadmin email — only this email can access /admin routes (server-side)',
    validate: (v) => (v.includes('@') ? null : 'Must be a valid email address'),
  },
  {
    key: 'NEXT_PUBLIC_ADMIN_EMAIL',
    required: true,
    description: 'Superadmin email (public — used by client-side admin layout guard). Must match ADMIN_EMAIL.',
    validate: (v) => (v.includes('@') ? null : 'Must be a valid email address'),
  },

  // ── Cloudflare R2 ────────────────────────────────────────────────────────
  { key: 'CLOUDFLARE_R2_ACCOUNT_ID',        required: true, description: 'R2 account ID' },
  { key: 'CLOUDFLARE_R2_ACCESS_KEY_ID',     required: true, description: 'R2 access key' },
  { key: 'CLOUDFLARE_R2_SECRET_ACCESS_KEY', required: true, description: 'R2 secret key' },
  { key: 'CLOUDFLARE_R2_BUCKET_NAME',       required: true, description: 'R2 bucket name' },
  {
    key: 'CLOUDFLARE_R2_PUBLIC_URL',
    required: true,
    description: 'R2 public CDN base URL (e.g. https://cdn.vuka.app)',
    validate: (v) => (v.startsWith('https://') ? null : 'Must be an https:// URL'),
  },
  {
    key: 'NEXT_PUBLIC_CF_CDN_URL',
    required: false,
    description: 'Cloudflare CDN audio delivery URL (falls back to R2 public URL if unset)',
    validate: (v) => (v.startsWith('https://') ? null : 'Must be an https:// URL'),
  },

  // ── Email ────────────────────────────────────────────────────────────────
  { key: 'RESEND_API_KEY', required: true,  description: 'Resend API key for transactional email' },
  { key: 'EMAIL_FROM',     required: false, description: 'From address (default: noreply@mail.vuka.app)' },

  // ── Payments — PayFast (ZA primary) ─────────────────────────────────────
  { key: 'PAYFAST_MERCHANT_ID',  required: true,  description: 'PayFast merchant ID' },
  { key: 'PAYFAST_MERCHANT_KEY', required: true,  description: 'PayFast merchant key' },
  { key: 'PAYFAST_PASSPHRASE',   required: true,  description: 'PayFast passphrase for ITN signature verification' },
  { key: 'PAYFAST_SANDBOX',      required: false, description: 'Set "true" to use PayFast sandbox (dev only)' },

  // ── Payments — Flutterwave (Pan-Africa) ──────────────────────────────────
  { key: 'FLUTTERWAVE_SECRET_KEY', required: 'production', description: 'Flutterwave secret key — required in production for Africa-wide bank transfers' },
  { key: 'FLUTTERWAVE_PUBLIC_KEY', required: false,        description: 'Flutterwave public key (frontend)' },
  { key: 'FLUTTERWAVE_HASH',       required: 'production', description: 'Flutterwave webhook hash for signature verification' },

  // ── Payments — PayPal (International) ───────────────────────────────────
  { key: 'PAYPAL_CLIENT_ID',     required: false,        description: 'PayPal REST API client ID (international payouts)' },
  { key: 'PAYPAL_CLIENT_SECRET', required: 'production', description: 'PayPal REST API client secret — required in production' },
  { key: 'PAYPAL_SANDBOX',       required: false,        description: 'Set "true" to use PayPal sandbox (dev only)' },

  // ── Security — Encryption ────────────────────────────────────────────────
  {
    key: 'ENCRYPTION_KEY',
    required: true,
    description: 'AES-256 encryption key — 64-char hex (openssl rand -hex 32)',
    validate: (v) =>
      v.length === 64 && /^[0-9a-fA-F]+$/.test(v)
        ? null
        : 'Must be exactly 64 hexadecimal characters',
  },
  {
    key: 'HMAC_KEY',
    required: false,
    description: 'HMAC-SHA256 integrity key — 64-char hex. Defaults to derived key if unset.',
    validate: (v) =>
      v.length === 64 && /^[0-9a-fA-F]+$/.test(v)
        ? null
        : 'Must be exactly 64 hexadecimal characters',
  },

  // ── Workers / Cron ───────────────────────────────────────────────────────
  {
    key: 'CRON_SECRET',
    required: true,
    description: 'Bearer token protecting /api/workers/cron from public invocation',
    validate: (v) => (v.length >= 32 ? null : 'Must be at least 32 characters'),
  },

  // ── Redis (Upstash — rate limiting + caching) ───────────────────────────
  { key: 'UPSTASH_REDIS_REST_URL',   required: false, description: 'Upstash Redis REST URL (required for production rate limiting)' },
  { key: 'UPSTASH_REDIS_REST_TOKEN', required: false, description: 'Upstash Redis REST token' },

  // ── Monitoring ───────────────────────────────────────────────────────────
  {
    key: 'SENTRY_DSN',
    required: false,
    description: 'Sentry DSN for error tracking (recommended in production)',
    validate: (v) =>
      v.startsWith('https://') && v.includes('sentry.io')
        ? null
        : 'Must be a valid Sentry DSN URL',
  },
  {
    key: 'NEXT_PUBLIC_POSTHOG_KEY',
    required: false,
    description: 'PostHog project API key for product analytics',
  },
  {
    key: 'NEXT_PUBLIC_POSTHOG_HOST',
    required: false,
    description: 'PostHog host (default: https://app.posthog.com)',
  },
  { key: 'LOG_SERVICE',           required: false, description: 'Service name tag in structured logs (default: vuka-web)' },
  { key: 'BETTER_UPTIME_API_KEY', required: false, description: 'Better Uptime API key for heartbeat monitoring' },
];

export interface EnvValidationResult {
  ok: boolean;
  missing: string[];
  invalid: string[];
  warnings: string[];
}

export function validateEnv(throwOnError = false): EnvValidationResult {
  const missing: string[]  = [];
  const invalid: string[]  = [];
  const warnings: string[] = [];

  for (const spec of ENV_MANIFEST) {
    const val = process.env[spec.key];

    const isRequired =
      spec.required === true ||
      (spec.required === 'production' && isProduction);

    if (!val) {
      if (isRequired) {
        missing.push(`${spec.key} — ${spec.description}`);
      } else {
        warnings.push(`${spec.key} not set (optional) — ${spec.description}`);
      }
      continue;
    }

    if (spec.validate) {
      const err = spec.validate(val);
      if (err) invalid.push(`${spec.key}: ${err}`);
    }
  }

  // Warn if stray Stripe keys exist (not used in Vuka)
  if (process.env.STRIPE_SECRET_KEY) {
    warnings.push(
      'STRIPE_SECRET_KEY is set but Vuka does not use Stripe — remove it to reduce attack surface',
    );
  }

  // Warn in production if Redis is not configured (rate limiting degrades to memory-based)
  if (isProduction && !process.env.UPSTASH_REDIS_REST_URL) {
    warnings.push(
      'UPSTASH_REDIS_REST_URL not set — rate limiting will use in-process memory and will not be distributed across instances',
    );
  }

  // Warn in production if PostHog is not configured
  if (isProduction && !process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    warnings.push('NEXT_PUBLIC_POSTHOG_KEY not set — product analytics disabled in production');
  }

  const ok = missing.length === 0 && invalid.length === 0;

  if (!ok && throwOnError) {
    const lines = [
      '╔══════════════════════════════════════════════════════╗',
      '║         VUKA — ENVIRONMENT VALIDATION FAILED         ║',
      '╚══════════════════════════════════════════════════════╝',
      '',
      ...(missing.length
        ? ['MISSING REQUIRED VARIABLES:', ...missing.map((m) => `  ✗ ${m}`), '']
        : []),
      ...(invalid.length
        ? ['INVALID VARIABLES:', ...invalid.map((i) => `  ✗ ${i}`), '']
        : []),
      'Fix these before deploying. See .env.example for setup details.',
    ];
    throw new Error(lines.join('\n'));
  }

  return { ok, missing, invalid, warnings };
}

/**
 * Server-side guard. Call at the top of any server component or API route
 * that needs a specific variable to be set.
 */
export function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`[env] Required environment variable ${key} is not set`);
  return val;
}

/**
 * Get an optional env var with a fallback.
 */
export function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}
