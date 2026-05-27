/**
 * VUKA — Environment Validation
 * Called once at startup (in src/app/layout.tsx and API entrypoints).
 * Crashes loudly if a required variable is missing so misconfigured deploys
 * are caught immediately rather than silently failing at runtime.
 */

interface EnvVar {
  key: string;
  required: boolean;
  description: string;
  /** Optional validator — return error message string or null */
  validate?: (val: string) => string | null;
}

const ENV_MANIFEST: EnvVar[] = [
  // Database
  { key: 'DATABASE_URL',              required: true,  description: 'PostgreSQL connection string (Supabase pooled URL)' },
  { key: 'DIRECT_URL',                required: true,  description: 'PostgreSQL direct connection (Supabase direct URL for migrations)' },

  // Supabase Auth
  { key: 'NEXT_PUBLIC_SUPABASE_URL',  required: true,  description: 'Supabase project URL' },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true, description: 'Supabase anon key' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', required: true,  description: 'Supabase service role key (never expose to client)' },

  // App
  { key: 'NEXT_PUBLIC_APP_URL',       required: true,  description: 'Full public URL (https://vuka.app)',
    validate: v => v.startsWith('http') ? null : 'Must start with http/https' },
  { key: 'ADMIN_EMAIL',               required: true,  description: 'Admin email for protected admin routes' },

  // Cloudflare R2
  { key: 'CLOUDFLARE_R2_ACCOUNT_ID',        required: true,  description: 'R2 account ID' },
  { key: 'CLOUDFLARE_R2_ACCESS_KEY_ID',     required: true,  description: 'R2 access key' },
  { key: 'CLOUDFLARE_R2_SECRET_ACCESS_KEY', required: true,  description: 'R2 secret key' },
  { key: 'CLOUDFLARE_R2_BUCKET_NAME',       required: true,  description: 'R2 bucket name' },
  { key: 'CLOUDFLARE_R2_PUBLIC_URL',        required: true,  description: 'R2 public CDN base URL' },

  // Email
  { key: 'RESEND_API_KEY',            required: true,  description: 'Resend API key for transactional email' },
  { key: 'EMAIL_FROM',                required: false, description: 'From address (default: onboarding@resend.dev)' },

  // Payments — PayFast
  { key: 'PAYFAST_MERCHANT_ID',       required: true,  description: 'PayFast merchant ID' },
  { key: 'PAYFAST_MERCHANT_KEY',      required: true,  description: 'PayFast merchant key' },
  { key: 'PAYFAST_PASSPHRASE',        required: true,  description: 'PayFast passphrase for ITN signature' },
  { key: 'PAYFAST_SANDBOX',           required: false, description: 'Set "true" to use PayFast sandbox' },

  // Payments — Stripe
  { key: 'STRIPE_SECRET_KEY',         required: true,  description: 'Stripe secret key' },
  { key: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', required: true, description: 'Stripe publishable key' },
  { key: 'STRIPE_WEBHOOK_SECRET',     required: true,  description: 'Stripe webhook signing secret' },

  // Workers / Cron
  { key: 'CRON_SECRET',               required: true,  description: 'Secret token that protects /api/workers/cron',
    validate: v => v.length >= 32 ? null : 'Must be at least 32 characters' },

  // Optional integrations
  { key: 'LOG_SERVICE',               required: false, description: 'Service name tag in structured logs' },
  { key: 'SENTRY_DSN',                required: false, description: 'Sentry DSN for error tracking' },
];

export interface EnvValidationResult {
  ok: boolean;
  missing: string[];
  invalid: string[];
  warnings: string[];
}

export function validateEnv(throwOnError = false): EnvValidationResult {
  const missing: string[] = [];
  const invalid: string[] = [];
  const warnings: string[] = [];

  for (const spec of ENV_MANIFEST) {
    const val = process.env[spec.key];
    if (!val) {
      if (spec.required) {
        missing.push(`${spec.key} — ${spec.description}`);
      } else {
        warnings.push(`${spec.key} not set (optional) — ${spec.description}`);
      }
      continue;
    }

    if (spec.validate) {
      const err = spec.validate(val);
      if (err) {
        invalid.push(`${spec.key}: ${err}`);
      }
    }
  }

  const ok = missing.length === 0 && invalid.length === 0;

  if (!ok && throwOnError) {
    const lines = [
      '╔══════════════════════════════════════════════════════╗',
      '║         VUKA — ENVIRONMENT VALIDATION FAILED         ║',
      '╚══════════════════════════════════════════════════════╝',
      '',
      ...(missing.length  ? ['MISSING REQUIRED VARIABLES:', ...missing.map(m => `  ✗ ${m}`), ''] : []),
      ...(invalid.length  ? ['INVALID VARIABLES:', ...invalid.map(i => `  ✗ ${i}`), ''] : []),
      'Fix these before deploying. See VUKA-SETUP-GUIDE.txt for details.',
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
