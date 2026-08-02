/**
 * VUKA — AI Content Engine: Ad Script Generation
 *
 * Turns one free-text ad concept ("ad for our new merch drop") into a
 * structured multi-slide script — each slide gets an image prompt and a
 * matching voiceover line — ready to feed straight into the video job
 * pipeline (src/app/api/admin/ai-studio/generate-video-job/route.ts).
 *
 * Uses a Cloudflare Workers AI text-generation model (same account as
 * images/voice — no new vendor). Docs:
 * https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/
 */

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
const CF_AI_TOKEN = process.env.CLOUDFLARE_AI_API_TOKEN;

// Fast, instruction-tuned, good enough for short structured ad copy —
// no need for a larger/slower model for this task.
const SCRIPT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export interface ScriptSlide {
  imagePrompt: string;
  voiceoverText: string;
}

export class AiScriptConfigError extends Error {}
export class AiScriptGenerationError extends Error {}

function assertConfigured() {
  if (!CF_ACCOUNT_ID || !CF_AI_TOKEN) {
    throw new AiScriptConfigError(
      'Workers AI is not configured — set CLOUDFLARE_AI_API_TOKEN in the environment.'
    );
  }
}

const SYSTEM_PROMPT = `You are an ad copywriter for Vuka Music, a direct-to-fan music sales platform for South African independent artists (positioning: "Release. Sell. Earn. Own."). You write short, punchy multi-slide ad scripts for social media.

Given a concept, respond with ONLY a JSON array (no markdown fences, no commentary) of exactly the requested number of slides. Each slide is an object with:
- "imagePrompt": a concise visual description for an AI image generator (no camera jargon needed, just what's in the shot)
- "voiceoverText": one short spoken line for that slide (under 20 words, natural spoken cadence, no reading-aloud punctuation like em dashes)

The slides should flow as a mini narrative arc (hook → build → payoff), not be repetitive. Keep the tone confident and authentic, never salesy or corny.`;

/**
 * Generate a slide-by-slide ad script from one free-text concept.
 */
export async function generateAdScript(
  concept: string,
  slideCount: number
): Promise<ScriptSlide[]> {
  assertConfigured();

  const userPrompt = `Concept: ${concept}\n\nWrite exactly ${slideCount} slides as a JSON array.`;

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${SCRIPT_MODEL}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CF_AI_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1200,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AiScriptGenerationError(
      `Workers AI script request failed (${res.status}): ${text.slice(0, 500)}`
    );
  }

  const json = (await res.json()) as { result?: { response?: string } };
  const raw = json.result?.response?.trim() ?? '';

  // Model may still wrap output in markdown fences despite instructions —
  // strip them defensively before parsing.
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new AiScriptGenerationError(
      `Could not parse script model output as JSON: ${cleaned.slice(0, 300)}`
    );
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new AiScriptGenerationError('Script model did not return a slide array');
  }

  const slides: ScriptSlide[] = parsed.map((s, i) => {
    if (
      typeof s !== 'object' ||
      s === null ||
      typeof (s as any).imagePrompt !== 'string' ||
      typeof (s as any).voiceoverText !== 'string'
    ) {
      throw new AiScriptGenerationError(`Slide ${i + 1} is missing imagePrompt/voiceoverText`);
    }
    return {
      imagePrompt: (s as any).imagePrompt.trim(),
      voiceoverText: (s as any).voiceoverText.trim(),
    };
  });

  return slides;
}
