/**
 * VUKA — Environment Validation
 * Paystack replaces PayFast. PAYSTACK_SECRET_KEY is now required.
 */

interface EnvVar {
  key: string;
  required: boolean | 'production';
  description: string;
  validate?: (val: string) => string | null;
}

const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';

const ENV_MANIFEST: EnvVar[] = [
  // ── Database ─────────────────────────────────────────────────────────────
  { key: 'DATABASE_URL', required: true, description: 'PostgreSQL pooled connection string (Supabase PgBouncer)', validate: (v) => v.startsWith('postgresql://') || v.startsWith('postgres://') ? null : 'Must be a postgresql:// URL' },
  { key: 'DIRECT_URL',   required: true, description: 'PostgreSQL direct connection for Prisma migrations',       validate: (v) => v.startsWith('postgresql://') || v.startsWith('postgres://') ? null : 'Must be a postgresql:// URL' },

  // ── Supabase Auth ─────────────────────────────────────────────────────────
  { key: 'NEXT_PUBLIC_SUPABASE_URL',      required: true, description: 'Supabase project URL' },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true, description: 'Supabase anon key' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY',     required: true, description: 'Supabase service role key — never expose to client', validate: (v) => v.startsWith('eyJ') ? null : 'Expected a JWT (starts with eyJ)' },

  // ── App ───────────────────────────────────────────────────────────────────
  { key: 'NEXT_PUBLIC_APP_URL',    required: true, description: 'Full public URL (e.g. https://www.vuka.co.za)', validate: (v) => v.startsWith('https://') ? null : 'Must start with https://' },
  { key: 'ADMIN_EMAIL',            required: true, description: 'Superadmin email', validate: (v) => v.includes('@') ? null : 'Must be a valid email' },
  { key: 'NEXT_PUBLIC_ADMIN_EMAIL',required: true, description: 'Superadmin email (client-side guard)', validate: (v) => v.includes('@') ? null : 'Must be a valid email' },

  // ── Cloudflare R2 ─────────────────────────────────────────────────────────
  { key: 'CLOUDFLARE_R2_ACCOUNT_ID',        required: true,  description: 'R2 account ID' },
  { key: 'CLOUDFLARE_R2_ACCESS_KEY_ID',     required: true,  description: 'R2 access key' },
  { key: 'CLOUDFLARE_R2_SECRET_ACCESS_KEY', required: true,  description: 'R2 secret key' },
  { key: 'CLOUDFLARE_R2_BUCKET_NAME',       required: true,  description: 'R2 bucket name' },
  { key: 'CLOUDFLARE_R2_PUBLIC_URL',        required: true,  description: 'R2 public CDN base URL', validate: (v) => v.startsWith('https://') ? null : 'Must be an https:// URL' },
  { key: 'NEXT_PUBLIC_CF_CDN_URL',          required: false, description: 'Cloudflare CDN audio delivery URL', validate: (v) => v.startsWith('https://') ? null : 'Must be an https:// URL' },

  // ── Email ─────────────────────────────────────────────────────────────────
  { key: 'RESEND_API_KEY', required: true,  description: 'Resend API key for transactional email' },
  { key: 'EMAIL_FROM',     required: false, description: 'From address (default: noreply@mail.vuka.co.za)' },

  // ── Payments — Paystack (ZA primary) ─────────────────────────────────────
  { key: 'PAYSTACK_SECRET_KEY', required: true,  description: 'Paystack secret key (sk_live_... or sk_test_...)' },
  { key: 'NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY', required: false, description: 'Paystack public key for client-side use' },

  // ── Payments — Flutterwave (Pan-Africa) ──────────────────────────────────
  { key: 'FLUTTERWAVE_SECRET_KEY', required: 'production', description: 'Flutterwave secret key' },
  { key: 'FLUTTERWAVE_PUBLIC_KEY', required: false,        description: 'Flutterwave public key' },
  { key: 'FLUTTERWAVE_HASH',       required: 'production', description: 'Flutterwave webhook hash' },

  // ── Payments — PayPal (International) ────────────────────────────────────
  { key: 'PAYPAL_CLIENT_ID',     required: false,        description: 'PayPal REST API client ID' },
  { key: 'PAYPAL_CLIENT_SECRET', required: 'production', description: 'PayPal REST API client secret' },
  { key: 'PAYPAL_SANDBOX',       required: false,        description: 'Set "true" for PayPal sandbox' },

  // ── Security ──────────────────────────────────────────────────────────────
  { key: 'ENCRYPTION_KEY', required: true, description: 'AES-256 key — 64-char hex', validate: (v) => v.length === 64 && /^[0-9a-fA-F]+$/.test(v) ? null : 'Must be 64 hex chars' },
  { key: 'HMAC_KEY',       required: false, description: 'HMAC-SHA256 key — 64-char hex', validate: (v) => v.length === 64 && /^[0-9a-fA-F]+$/.test(v) ? null : 'Must be 64 hex chars' },
  { key: 'CRON_SECRET',    required: true, description: 'Bearer token for /api/workers/cron', validate: (v) => v.length >= 32 ? null : 'Must be at least 32 chars' },

  // ── Redis ─────────────────────────────────────────────────────────────────
  { key: 'UPSTASH_REDIS_REST_URL',   required: false, description: 'Upstash Redis REST URL' },
  { key: 'UPSTASH_REDIS_REST_TOKEN', required: false, description: 'Upstash Redis REST token' },

  // ── Monitoring ────────────────────────────────────────────────────────────
  { key: 'SENTRY_DSN',              required: false, description: 'Sentry DSN', validate: (v) => v.startsWith('https://') && v.includes('sentry.io') ? null : 'Must be a valid Sentry DSN' },
  { key: 'NEXT_PUBLIC_POSTHOG_KEY', required: false, description: 'PostHog project API key' },
  { key: 'NEXT_PUBLIC_POSTHOG_HOST',required: false, description: 'PostHog host' },
  { key: 'LOG_SERVICE',             required: false, description: 'Service name tag in logs' },
  { key: 'BETTER_UPTIME_API_KEY',   required: false, description: 'Better Uptime API key' },
];

export interface EnvValidationResult {
  ok:       boolean;
  missing:  string[];
  invalid:  string[];
  warnings: string[];
}

export function validateEnv(throwOnError = false): EnvValidationResult {
  const missing:  string[] = [];
  const invalid:  string[] = [];
  const warnings: string[] = [];

  for (const spec of ENV_MANIFEST) {
    const val        = process.env[spec.key];
    const isRequired = spec.required === true || (spec.required === 'production' && isProduction);

    if (!val) {
      if (isRequired) missing.push(`${spec.key} — ${spec.description}`);
      else            warnings.push(`${spec.key} not set (optional) — ${spec.description}`);
      continue;
    }

    if (spec.validate) {
      const err = spec.validate(val);
      if (err) invalid.push(`${spec.key}: ${err}`);
    }
  }

  // Warn if stale PayFast keys still present
  if (process.env.PAYFAST_MERCHANT_ID || process.env.PAYFAST_MERCHANT_KEY) {
    warnings.push('PAYFAST_MERCHANT_ID / PAYFAST_MERCHANT_KEY are set but Vuka now uses Paystack — remove them');
  }
  if (process.env.STRIPE_SECRET_KEY) {
    warnings.push('STRIPE_SECRET_KEY is set but Vuka does not use Stripe — remove it');
  }
  if (isProduction && !process.env.UPSTASH_REDIS_REST_URL) {
    warnings.push('UPSTASH_REDIS_REST_URL not set — rate limiting will use in-process memory');
  }
  if (isProduction && !process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    warnings.push('NEXT_PUBLIC_POSTHOG_KEY not set — product analytics disabled');
  }

  const ok = missing.length === 0 && invalid.length === 0;

  if (!ok && throwOnError) {
    const lines = [
      '╔══════════════════════════════════════════════════════╗',
      '║         VUKA — ENVIRONMENT VALIDATION FAILED         ║',
      '╚══════════════════════════════════════════════════════╝',
      '',
      ...(missing.length ? ['MISSING REQUIRED VARIABLES:', ...missing.map(m => `  ✗ ${m}`), ''] : []),
      ...(invalid.length ? ['INVALID VARIABLES:', ...invalid.map(i => `  ✗ ${i}`), ''] : []),
      'Fix these before deploying.',
    ];
    throw new Error(lines.join('\n'));
  }

  return { ok, missing, invalid, warnings };
}

export function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`[env] Required environment variable ${key} is not set`);
  return val;
}

export function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}
