/**
 * VUKA — AI Content Engine: Voice Generation (admin marketing tool)
 *
 * Calls Cloudflare Workers AI for text-to-speech. Two models available:
 *
 *   - @cf/deepgram/aura-1   — Deepgram's production neural TTS. This is the
 *     same quality tier used in real commercial products — genuinely
 *     natural-sounding, not a robotic offline engine. Preferred default.
 *   - @cf/myshell-ai/melotts — open-weight fallback if Aura-1 is ever
 *     unavailable/rate-limited.
 *
 * Same account/free-tier as src/lib/ai-image.ts (10k neurons/day, shared).
 * Docs: https://developers.cloudflare.com/workers-ai/models/
 */

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
const CF_AI_TOKEN = process.env.CLOUDFLARE_AI_API_TOKEN;

const VOICE_MODELS = {
  aura: '@cf/deepgram/aura-1',
  melo: '@cf/myshell-ai/melotts',
} as const;

export type VoiceEngine = keyof typeof VOICE_MODELS;

// Aura-1 named voices — pick ones that suit a warm, confident marketing VO.
// Full list: https://developers.cloudflare.com/workers-ai/models/aura-1/
export const AURA_VOICES = {
  female_warm: 'asteria',
  male_confident: 'orion',
} as const;

export interface GenerateVoiceOptions {
  engine?: VoiceEngine; // default: "aura"
  voice?: string;        // Aura voice name, ignored for melo
  speed?: number;        // 0.5–2.0, default 1.0
}

export class AiVoiceConfigError extends Error {}
export class AiVoiceGenerationError extends Error {}

function assertConfigured() {
  if (!CF_ACCOUNT_ID || !CF_AI_TOKEN) {
    throw new AiVoiceConfigError(
      'Workers AI is not configured — set CLOUDFLARE_AI_API_TOKEN in the environment.'
    );
  }
}

/**
 * Generate a voiceover clip from text. Returns raw audio bytes (MP3/WAV
 * depending on model — caller should inspect content-type or just pass
 * straight through to ffmpeg, which sniffs format from bytes).
 */
export async function generateVoice(
  text: string,
  opts: GenerateVoiceOptions = {}
): Promise<{ audio: Buffer; contentType: string }> {
  assertConfigured();

  const engine = opts.engine ?? 'aura';
  const model = VOICE_MODELS[engine];

  const payload: Record<string, unknown> = { text };
  if (engine === 'aura') {
    payload.voice = opts.voice ?? AURA_VOICES.male_confident;
    if (opts.speed) payload.speed = opts.speed;
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${model}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CF_AI_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new AiVoiceGenerationError(
      `Workers AI voice request failed (${res.status}): ${errText.slice(0, 500)}`
    );
  }

  const contentType = res.headers.get('content-type') || 'audio/mpeg';

  if (contentType.includes('application/json')) {
    const json = (await res.json()) as { result?: { audio?: string } };
    const b64 = json.result?.audio;
    if (!b64) {
      throw new AiVoiceGenerationError(
        `Workers AI returned no audio data: ${JSON.stringify(json).slice(0, 500)}`
      );
    }
    return { audio: Buffer.from(b64, 'base64'), contentType: 'audio/mpeg' };
  }

  const arrayBuf = await res.arrayBuffer();
  return { audio: Buffer.from(arrayBuf), contentType };
}
