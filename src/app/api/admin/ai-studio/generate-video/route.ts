export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Video assembly is CPU/time-heavy. This needs a Vercel plan whose max
// route duration covers however many slides get requested — 300s covers
// a realistic 4-8 slide marketing clip. Raise/lower alongside MAX_SLIDES
// below if your plan's ceiling differs.
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { generateImage, AiImageConfigError, AiImageGenerationError } from '@/lib/ai-image';
import { generateVoice, AiVoiceConfigError, AiVoiceGenerationError, AURA_VOICES } from '@/lib/ai-voice';
import { buildVideo, downloadToTmp, mkdtemp, rm, readFile } from '@/lib/ffmpeg-video';
import { uploadBuffer, getPublicUrl } from '@/lib/r2';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';
import { tmpdir } from 'node:os';
import path from 'node:path';

const MAX_SLIDES = 8; // keep clips short — this is a marketing-ad tool, not a video editor
const BRAND_PREFIX =
  'professional music marketing photo, high quality, natural lighting, authentic — ';

interface SlideInput {
  imagePrompt?: string; // generates a new image if provided
  imageUrl?: string;    // OR reuse an existing generated/uploaded image
  voiceoverText: string;
}

// POST /api/admin/ai-studio/generate-video
// Body: { slides: SlideInput[], size?: "1080x1080"|"1080x1920", voice?: string, styleTag?: string }
export async function POST(req: NextRequest) {
  let workdir: string | null = null;
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ip = getClientIp(req.headers);
    const limited = await rateLimit(admin.id, RATE_LIMITS.ai_video_generate, ip);
    if (limited) {
      return NextResponse.json(
        { error: 'Too many video generations — please slow down and try again later' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const slides: SlideInput[] = Array.isArray(body.slides) ? body.slides : [];
    const size = body.size === '1080x1920' ? '1080x1920' : '1080x1080';
    const voice = typeof body.voice === 'string' ? body.voice : AURA_VOICES.male_confident;
    const styleTag = typeof body.styleTag === 'string' ? body.styleTag.slice(0, 60) : null;

    if (slides.length === 0) {
      return NextResponse.json({ error: 'At least one slide is required' }, { status: 400 });
    }
    if (slides.length > MAX_SLIDES) {
      return NextResponse.json({ error: `Max ${MAX_SLIDES} slides per video` }, { status: 400 });
    }
    for (const s of slides) {
      if (!s.voiceoverText?.trim()) {
        return NextResponse.json({ error: 'Every slide needs voiceoverText' }, { status: 400 });
      }
      if (!s.imagePrompt?.trim() && !s.imageUrl?.trim()) {
        return NextResponse.json({ error: 'Every slide needs either imagePrompt or imageUrl' }, { status: 400 });
      }
    }

    workdir = await mkdtemp(path.join(tmpdir(), 'vuka-video-src-'));

    const ffmpegSlides: { imagePath: string; voicePath: string }[] = [];

    for (let i = 0; i < slides.length; i++) {
      const s = slides[i];

      let imagePath: string;
      if (s.imageUrl) {
        imagePath = await downloadToTmp(s.imageUrl, workdir, `img_${i}.png`);
      } else {
        const imgBuf = await generateImage(`${BRAND_PREFIX}${s.imagePrompt}`, { quality: 'fast' });
        imagePath = path.join(workdir, `img_${i}.png`);
        await (await import('node:fs/promises')).writeFile(imagePath, imgBuf);
      }

      const { audio } = await generateVoice(s.voiceoverText, { engine: 'aura', voice });
      const voicePath = path.join(workdir, `voice_${i}.mp3`);
      await (await import('node:fs/promises')).writeFile(voicePath, audio);

      ffmpegSlides.push({ imagePath, voicePath });
    }

    const { videoPath, durationSec, cleanup } = await buildVideo(ffmpegSlides, { size });
    const videoBuffer = await readFile(videoPath);
    await cleanup();

    const key = `ai-studio/video/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
    await uploadBuffer(key, videoBuffer, 'video/mp4');
    const resultUrl = getPublicUrl(key);

    const generation = await prisma.aiGeneration.create({
      data: {
        createdByUserId: admin.id,
        kind: 'video',
        prompt: slides.map((s) => s.voiceoverText).join(' / '),
        styleTag,
        model: 'ffmpeg+flux-2-klein-4b+aura-1',
        resultUrl,
        status: 'completed',
      },
    });

    return NextResponse.json({ generation, durationSec }, { status: 201 });
  } catch (err) {
    if (err instanceof AiImageConfigError || err instanceof AiVoiceConfigError) {
      console.error('[admin/ai-studio/generate-video] config error:', err.message);
      return NextResponse.json({ error: 'AI Studio is not fully configured yet' }, { status: 503 });
    }
    if (err instanceof AiImageGenerationError || err instanceof AiVoiceGenerationError) {
      console.error('[admin/ai-studio/generate-video] generation error:', err.message);
      return NextResponse.json({ error: 'Content generation failed — please try again' }, { status: 502 });
    }
    console.error('[admin/ai-studio/generate-video] POST error:', err);
    return NextResponse.json({ error: 'Failed to generate video' }, { status: 500 });
  } finally {
    if (workdir) await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}

// GET /api/admin/ai-studio/generate-video — generation history
export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const generations = await prisma.aiGeneration.findMany({
      where: { kind: 'video' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ generations });
  } catch (err) {
    console.error('[admin/ai-studio/generate-video] GET error:', err);
    return NextResponse.json({ error: 'Failed to load generations' }, { status: 500 });
  }
}
