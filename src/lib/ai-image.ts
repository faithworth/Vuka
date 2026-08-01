/**
 * VUKA — AI Content Engine, Phase 1: Image Generation
 *
 * Calls Cloudflare Workers AI directly over its REST API (no separate
 * Worker/binding needed) using open-weight FLUX.2 models. Chosen because:
 *
 *   - Genuine daily free allocation (10,000 neurons/day, account-wide) on
 *     the same Cloudflare account we already use for R2 — no new vendor,
 *     no new billing relationship.
 *   - Open-weight models (black-forest-labs/FLUX.2), not a black-box
 *     third-party SaaS demo API.
 *   - Runs server-side from any Node runtime (Vercel included) — a Workers
 *     deployment/binding is not required to call it.
 *
 * Docs: https://developers.cloudflare.com/workers-ai/models/
 *
 * NOTE: the free allocation is shared across the whole Cloudflare account,
 * not per-artist. src/lib/rateLimit.ts's `ai_image_generate` profile exists
 * specifically to keep one artist from exhausting it for everyone. If Vuka
 * outgrows the free tier, Workers AI has a paid path on the same API with
 * no code changes needed here — see RATE_LIMITS.ai_image_generate comment.
 */

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_R2_ACCOUNT_ID; // same Cloudflare account as R2
const CF_AI_TOKEN = process.env.CLOUDFLARE_AI_API_TOKEN;

// klein-4b: fixed 4-step distilled model — fast, cheap on the neuron budget,
// good default for iterative artist use.
// dev: full quality, slower and more neuron-expensive — opt-in only.
const MODELS = {
  fast: '@cf/black-forest-labs/flux-2-klein-4b',
  quality: '@cf/black-forest-labs/flux-2-dev',
} as const;

export type ImageQuality = keyof typeof MODELS;

export interface GenerateImageOptions {
  width?: number;
  height?: number;
  quality?: ImageQuality; // default: "fast"
}

export class AiImageConfigError extends Error {}
export class AiImageGenerationError extends Error {}

function assertConfigured() {
  if (!CF_ACCOUNT_ID || !CF_AI_TOKEN) {
    throw new AiImageConfigError(
      'Workers AI is not configured — set CLOUDFLARE_AI_API_TOKEN (and confirm ' +
      'CLOUDFLARE_R2_ACCOUNT_ID is set) in the environment.'
    );
  }
}

export function modelIdFor(quality: ImageQuality = 'fast'): string {
  return MODELS[quality];
}

/**
 * Generate an image from a text prompt via Cloudflare Workers AI.
 * Returns raw image bytes (PNG) ready to upload to R2.
 */
export async function generateImage(
  prompt: string,
  opts: GenerateImageOptions = {}
): Promise<Buffer> {
  assertConfigured();

  const model = modelIdFor(opts.quality ?? 'fast');
  const width = opts.width ?? 1024;
  const height = opts.height ?? 1024;

  const form = new FormData();
  form.append('prompt', prompt);
  form.append('width', String(width));
  form.append('height', String(height));

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${model}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${CF_AI_TOKEN}` },
      body: form,
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AiImageGenerationError(
      `Workers AI request failed (${res.status}): ${text.slice(0, 500)}`
    );
  }

  const contentType = res.headers.get('content-type') || '';

  // Some Workers AI image models return raw image bytes; others return a
  // JSON envelope with a base64 `result.image` field. Handle both.
  if (contentType.includes('application/json')) {
    const json = (await res.json()) as { result?: { image?: string }; errors?: unknown };
    const b64 = json.result?.image;
    if (!b64) {
      throw new AiImageGenerationError(
        `Workers AI returned no image data: ${JSON.stringify(json).slice(0, 500)}`
      );
    }
    return Buffer.from(b64, 'base64');
  }

  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}
