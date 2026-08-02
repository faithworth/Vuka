export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { generateVoice, AiVoiceConfigError, AiVoiceGenerationError, AURA_VOICES } from '@/lib/ai-voice';
import { uploadBuffer, getPublicUrl } from '@/lib/r2';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';

// Admin-only: voiceover generation for Vuka marketing content (ads, launch
// videos, etc.) using Cloudflare Workers AI (Deepgram Aura-1 by default —
// real neural TTS, not an offline formant-synthesis engine).

const MAX_SCRIPT_LEN = 1000;

// POST /api/admin/ai-studio/generate-voice
// Body: { text: string, voice?: string, speed?: number, styleTag?: string }
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ip = getClientIp(req.headers);
    const limited = await rateLimit(admin.id, RATE_LIMITS.ai_voice_generate, ip);
    if (limited) {
      return NextResponse.json(
        { error: 'Too many voice generations — please slow down and try again later' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const voice = typeof body.voice === 'string' ? body.voice : AURA_VOICES.male_confident;
    const speed = typeof body.speed === 'number' ? body.speed : undefined;
    const styleTag = typeof body.styleTag === 'string' ? body.styleTag.slice(0, 60) : null;

    if (!text) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }
    if (text.length > MAX_SCRIPT_LEN) {
      return NextResponse.json(
        { error: `text must be ${MAX_SCRIPT_LEN} characters or fewer` },
        { status: 400 }
      );
    }

    let audio: Buffer;
    let contentType: string;
    try {
      const result = await generateVoice(text, { engine: 'aura', voice, speed });
      audio = result.audio;
      contentType = result.contentType;
    } catch (err) {
      if (err instanceof AiVoiceConfigError) {
        console.error('[admin/ai-studio/generate-voice] config error:', err.message);
        return NextResponse.json(
          { error: 'AI voice generation is not configured yet on this environment' },
          { status: 503 }
        );
      }
      if (err instanceof AiVoiceGenerationError) {
        console.error('[admin/ai-studio/generate-voice] generation error:', err.message);
        return NextResponse.json({ error: 'Voice generation failed — please try again' }, { status: 502 });
      }
      throw err;
    }

    const ext = contentType.includes('wav') ? 'wav' : 'mp3';
    const key = `ai-studio/voice/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await uploadBuffer(key, audio, contentType);
    const resultUrl = getPublicUrl(key);

    const generation = await prisma.aiGeneration.create({
      data: {
        createdByUserId: admin.id,
        kind: 'voice',
        prompt: text,
        styleTag,
        model: '@cf/deepgram/aura-1',
        resultUrl,
        status: 'completed',
      },
    });

    return NextResponse.json({ generation }, { status: 201 });
  } catch (err) {
    console.error('[admin/ai-studio/generate-voice] POST error:', err);
    return NextResponse.json({ error: 'Failed to generate voice' }, { status: 500 });
  }
}

// GET /api/admin/ai-studio/generate-voice — generation history
export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const generations = await prisma.aiGeneration.findMany({
      where: { kind: 'voice' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ generations });
  } catch (err) {
    console.error('[admin/ai-studio/generate-voice] GET error:', err);
    return NextResponse.json({ error: 'Failed to load generations' }, { status: 500 });
  }
}
