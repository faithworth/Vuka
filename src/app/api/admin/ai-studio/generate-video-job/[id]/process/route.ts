export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Each tick does as much work as fits in this budget, checkpoints, and
// returns — the client polls again for the next chunk. 280s leaves a
// buffer under Vercel's 300s ceiling for the response to actually return.
export const maxDuration = 280;
// Stop starting new slide work once this much of the budget is used, so
// there's always time left to persist progress and return cleanly instead
// of getting hard-killed mid-slide by the platform timeout.
const TIME_BUDGET_MS = 250_000;
// A tick that's been "running" for less than this is assumed still in
// flight (e.g. another tab's poll beat this one here) — don't double-work.
const LOCK_STALE_MS = 30_000;

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

const BRAND_PREFIX =
  'professional music marketing photo, high quality, natural lighting, authentic — ';

interface SlideInput {
  imagePrompt?: string;
  imageUrl?: string;
  voiceoverText: string;
}
interface SlideProgress {
  imageUrl: string;
  voiceUrl: string;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const startedAt = Date.now();
  const timeLeft = () => TIME_BUDGET_MS - (Date.now() - startedAt);

  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ip = getClientIp(req.headers);
    const limited = await rateLimit(admin.id, RATE_LIMITS.ai_job_process, ip);
    if (limited) {
      return NextResponse.json({ error: 'Too many requests — please slow down' }, { status: 429 });
    }

    let job = await prisma.aiJob.findUnique({ where: { id: params.id } });
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    // Already finished — nothing to do, just report state.
    if (job.status === 'completed' || job.status === 'failed') {
      return NextResponse.json({ job });
    }

    // Another tick appears to be actively working this job — don't
    // double-process (e.g. the client polling from two tabs/devices).
    if (job.status === 'running' && job.lockedAt && Date.now() - job.lockedAt.getTime() < LOCK_STALE_MS) {
      return NextResponse.json({ job });
    }

    // Claim the job for this tick.
    job = await prisma.aiJob.update({
      where: { id: job.id },
      data: { status: 'running', lockedAt: new Date() },
    });

    const input = job.input as { slides: SlideInput[]; size?: string; voice?: string; styleTag?: string | null };
    const slides = input.slides;
    const size = input.size === '1080x1920' ? '1080x1920' : '1080x1080';
    const voice = input.voice ?? AURA_VOICES.male_confident;
    let progress = (job.progress as SlideProgress[]) ?? [];

    // ── Phase 1: generate any slides not yet done, checkpointing after each ──
    for (let i = progress.length; i < slides.length; i++) {
      if (timeLeft() < 20_000) {
        // Not enough budget left to safely start another slide — checkpoint
        // and let the next tick continue from here.
        await prisma.aiJob.update({
          where: { id: job.id },
          data: { status: 'running', progress, lockedAt: new Date() },
        });
        return NextResponse.json({ job: { ...job, status: 'running', progress } });
      }

      const s = slides[i];

      let imageBuffer: Buffer;
      if (s.imageUrl) {
        const res = await fetch(s.imageUrl);
        if (!res.ok) throw new Error(`Could not fetch existing image for slide ${i + 1}`);
        imageBuffer = Buffer.from(await res.arrayBuffer());
      } else {
        imageBuffer = await generateImage(`${BRAND_PREFIX}${s.imagePrompt}`, { quality: 'fast' });
      }
      const imageKey = `ai-studio/video-jobs/${job.id}/slide-${i}.png`;
      await uploadBuffer(imageKey, imageBuffer, 'image/png');
      const imageUrl = getPublicUrl(imageKey);

      const { audio, contentType } = await generateVoice(s.voiceoverText, { engine: 'aura', voice });
      const ext = contentType.includes('wav') ? 'wav' : 'mp3';
      const voiceKey = `ai-studio/video-jobs/${job.id}/slide-${i}.${ext}`;
      await uploadBuffer(voiceKey, audio, contentType);
      const voiceUrl = getPublicUrl(voiceKey);

      progress = [...progress, { imageUrl, voiceUrl }];

      // Checkpoint after every single slide — if the process crashes or gets
      // killed right after this, the next tick only redoes work after this point.
      await prisma.aiJob.update({
        where: { id: job.id },
        data: { progress, lockedAt: new Date() },
      });
    }

    // ── Phase 2: all slides done — assemble the final video ──
    const workdir = await mkdtemp(path.join(tmpdir(), 'vuka-video-job-'));
    try {
      const ffmpegSlides = [];
      for (let i = 0; i < progress.length; i++) {
        const imagePath = await downloadToTmp(progress[i].imageUrl, workdir, `img_${i}.png`);
        const voicePath = await downloadToTmp(
          progress[i].voiceUrl,
          workdir,
          progress[i].voiceUrl.endsWith('.wav') ? `voice_${i}.wav` : `voice_${i}.mp3`
        );
        ffmpegSlides.push({ imagePath, voicePath });
      }

      const { videoPath, cleanup } = await buildVideo(ffmpegSlides, { size });
      const videoBuffer = await readFile(videoPath);
      await cleanup();

      const finalKey = `ai-studio/video-jobs/${job.id}/final.mp4`;
      await uploadBuffer(finalKey, videoBuffer, 'video/mp4');
      const resultUrl = getPublicUrl(finalKey);

      await prisma.aiGeneration.create({
        data: {
          createdByUserId: job.createdByUserId,
          kind: 'video',
          prompt: slides.map((s) => s.voiceoverText).join(' / '),
          styleTag: input.styleTag ?? null,
          model: 'ffmpeg+flux-2-klein-4b+aura-1',
          resultUrl,
          status: 'completed',
        },
      });

      job = await prisma.aiJob.update({
        where: { id: job.id },
        data: { status: 'completed', resultUrl, lockedAt: null },
      });
    } finally {
      await rm(workdir, { recursive: true, force: true }).catch(() => {});
    }

    return NextResponse.json({ job });
  } catch (err) {
    let message = 'Job processing failed';
    if (err instanceof AiImageConfigError || err instanceof AiVoiceConfigError) {
      message = 'AI Studio is not fully configured yet';
    } else if (err instanceof AiImageGenerationError || err instanceof AiVoiceGenerationError) {
      message = 'Content generation failed for this job';
    } else if (err instanceof Error) {
      message = err.message;
    }
    console.error('[generate-video-job/process] error:', err);
    try {
      await prisma.aiJob.update({
        where: { id: params.id },
        data: { status: 'failed', error: message, lockedAt: null },
      });
    } catch {
      // best effort — if this fails too, the client will still see the 500
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
