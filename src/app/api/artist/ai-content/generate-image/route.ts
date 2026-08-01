export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { generateImage, AiImageConfigError, AiImageGenerationError } from '@/lib/ai-image';
import { uploadBuffer, getPublicUrl } from '@/lib/r2';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';

const MAX_PROMPT_LEN = 400;

// First, cheap line of defense before spending neuron budget — Workers AI
// also applies its own server-side safety filtering, this is not the only
// layer. Deliberately conservative; false positives just mean "rephrase".
const BLOCKED_TERMS = [
  /\bnude|naked|nudity\b/i,
  /\bsex(ual|y)?\b/i,
  /\bporn/i,
  /\bexplicit\b/i,
  /\bgore|mutilat/i,
  /\bchild\b/i, // any prompt mentioning a child is rejected outright, no exceptions
];

const BRAND_PREFIX =
  'professional music marketing photo, high quality, natural lighting, authentic — ';

// POST /api/artist/ai-content/generate-image — artist-only
// Body: { prompt: string, styleTag?: string, quality?: "fast" | "quality" }
export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const artist = await prisma.artist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!artist) return NextResponse.json({ error: 'Artist profile required' }, { status: 403 });

    const ip = getClientIp(req.headers);
    const limited = await rateLimit(user.id, RATE_LIMITS.ai_image_generate, ip);
    if (limited) {
      return NextResponse.json(
        { error: 'Too many AI generations — please slow down and try again later' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const styleTag = typeof body.styleTag === 'string' ? body.styleTag.slice(0, 60) : null;
    const quality = body.quality === 'quality' ? 'quality' : 'fast';

    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }
    if (prompt.length > MAX_PROMPT_LEN) {
      return NextResponse.json(
        { error: `prompt must be ${MAX_PROMPT_LEN} characters or fewer` },
        { status: 400 }
      );
    }
    if (BLOCKED_TERMS.some((re) => re.test(prompt))) {
      return NextResponse.json(
        { error: "This prompt isn't allowed — please rephrase." },
        { status: 400 }
      );
    }

    const fullPrompt = `${BRAND_PREFIX}${prompt}`;

    let imageBuffer: Buffer;
    let modelId: string;
    try {
      imageBuffer = await generateImage(fullPrompt, { quality });
      modelId = quality === 'quality' ? '@cf/black-forest-labs/flux-2-dev' : '@cf/black-forest-labs/flux-2-klein-4b';
    } catch (err) {
      if (err instanceof AiImageConfigError) {
        console.error('[ai-content/generate-image] config error:', err.message);
        return NextResponse.json(
          { error: 'AI image generation is not configured yet on this environment' },
          { status: 503 }
        );
      }
      if (err instanceof AiImageGenerationError) {
        console.error('[ai-content/generate-image] generation error:', err.message);
        return NextResponse.json({ error: 'Image generation failed — please try again' }, { status: 502 });
      }
      throw err;
    }

    const key = `ai-generated/${artist.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    await uploadBuffer(key, imageBuffer, 'image/png');
    const resultUrl = getPublicUrl(key);

    const generation = await prisma.aiGeneration.create({
      data: {
        artistId: artist.id,
        kind: 'image',
        prompt,
        styleTag,
        model: modelId,
        resultUrl,
        status: 'completed',
      },
    });

    return NextResponse.json({ generation }, { status: 201 });
  } catch (err) {
    console.error('[ai-content/generate-image] POST error:', err);
    return NextResponse.json({ error: 'Failed to generate image' }, { status: 500 });
  }
}

// GET /api/artist/ai-content/generate-image — this artist's generation history
export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const artist = await prisma.artist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!artist) return NextResponse.json({ error: 'Artist profile required' }, { status: 403 });

    const generations = await prisma.aiGeneration.findMany({
      where: { artistId: artist.id, kind: 'image' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ generations });
  } catch (err) {
    console.error('[ai-content/generate-image] GET error:', err);
    return NextResponse.json({ error: 'Failed to load generations' }, { status: 500 });
  }
}
