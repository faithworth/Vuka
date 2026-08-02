export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { generateAdScript, AiScriptConfigError, AiScriptGenerationError } from '@/lib/ai-script';
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rateLimit';

// Admin-only: creates a checkpointed background job for multi-slide video
// generation. Does NOT do any image/voice/ffmpeg work itself — that's the
// job of repeated calls to /api/admin/ai-studio/generate-video-job/[id]/process,
// which the client polls after creation. This route only:
//   1. validates the request
//   2. (if scriptConcept was given) expands it into slides via the ad-script
//      generator — a single fast LLM call, safe to do synchronously here
//   3. writes the AiJob row and returns its id immediately
//
// See src/lib/ai-script.ts and prisma AiJob model comment for the full picture.

const MAX_SLIDES = 20;
const MIN_SLIDES = 1;

interface SlideInput {
  imagePrompt?: string;
  imageUrl?: string;
  voiceoverText: string;
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ip = getClientIp(req.headers);
    const limited = await rateLimit(admin.id, RATE_LIMITS.ai_job_create, ip);
    if (limited) {
      return NextResponse.json(
        { error: 'Too many jobs started — please slow down and try again later' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const size = body.size === '1080x1920' ? '1080x1920' : '1080x1080';
    const voice = typeof body.voice === 'string' ? body.voice : undefined;
    const styleTag = typeof body.styleTag === 'string' ? body.styleTag.slice(0, 60) : null;

    let slides: SlideInput[];

    if (typeof body.scriptConcept === 'string' && body.scriptConcept.trim()) {
      // Auto-script mode: one concept -> N slides via the ad-script generator.
      const slideCount = Math.min(
        MAX_SLIDES,
        Math.max(MIN_SLIDES, Number.isFinite(body.slideCount) ? Math.round(body.slideCount) : 6)
      );
      try {
        const script = await generateAdScript(body.scriptConcept.trim(), slideCount);
        slides = script.map((s) => ({ imagePrompt: s.imagePrompt, voiceoverText: s.voiceoverText }));
      } catch (err) {
        if (err instanceof AiScriptConfigError) {
          return NextResponse.json(
            { error: 'AI script generation is not configured yet on this environment' },
            { status: 503 }
          );
        }
        if (err instanceof AiScriptGenerationError) {
          console.error('[generate-video-job] script error:', err.message);
          return NextResponse.json(
            { error: 'Could not generate a script from that concept — try rephrasing it' },
            { status: 502 }
          );
        }
        throw err;
      }
    } else if (Array.isArray(body.slides)) {
      // Hand-written mode: same slide shape as the old synchronous route.
      slides = body.slides;
    } else {
      return NextResponse.json(
        { error: 'Provide either scriptConcept or slides' },
        { status: 400 }
      );
    }

    if (slides.length < MIN_SLIDES) {
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

    const job = await prisma.aiJob.create({
      data: {
        createdByUserId: admin.id,
        kind: 'video',
        status: 'queued',
        input: { slides, size, voice, styleTag },
        totalSteps: slides.length,
      },
    });

    return NextResponse.json({ jobId: job.id, totalSteps: slides.length, slides }, { status: 202 });
  } catch (err) {
    console.error('[generate-video-job] POST error:', err);
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
  }
}

// GET /api/admin/ai-studio/generate-video-job — recent job history (all admins share the studio)
export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const jobs = await prisma.aiJob.findMany({
      where: { kind: 'video' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ jobs });
  } catch (err) {
    console.error('[generate-video-job] GET error:', err);
    return NextResponse.json({ error: 'Failed to load jobs' }, { status: 500 });
  }
}
