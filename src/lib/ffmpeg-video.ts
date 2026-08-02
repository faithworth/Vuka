/**
 * VUKA — AI Content Engine: video assembly (Phase 2)
 *
 * Composes a still image + a voiceover clip into a slow zoom/pan video
 * segment, concatenates segments, and mixes in a quiet background music
 * bed. Runs ffmpeg via `ffmpeg-static` (a bundled binary — no system
 * package, no external service) inside a Node.js Vercel function.
 *
 * IMPORTANT: this needs a Vercel plan/route config with enough execution
 * time for the number/length of slides requested — see
 * src/app/api/admin/ai-studio/generate-video/route.ts's `maxDuration`.
 * Short clips (3-6 slides, ~20-40s total) are the realistic target; this
 * is not built for feature-length output.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error -- ffmpeg-static has no types; it just exports a path string
import ffmpegPath from 'ffmpeg-static';

const execFileAsync = promisify(execFile);

async function run(args: string[]) {
  try {
    await execFileAsync(ffmpegPath as string, args, { maxBuffer: 1024 * 1024 * 64 });
  } catch (err: any) {
    const stderr = err?.stderr?.toString?.().slice(-2000) ?? '';
    throw new Error(`ffmpeg failed: ${err?.message}\n${stderr}`);
  }
}

async function probeDurationSec(file: string): Promise<number> {
  // ffmpeg-static only ships the ffmpeg binary, not ffprobe, so we get
  // duration from ffmpeg's own stderr output instead of shelling to ffprobe.
  try {
    await execFileAsync(ffmpegPath as string, ['-i', file], { maxBuffer: 1024 * 1024 * 8 });
    return 0; // unreachable: ffmpeg -i with no output always "fails" with code 1
  } catch (err: any) {
    const stderr: string = err?.stderr?.toString?.() ?? '';
    const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (!m) throw new Error(`Could not read duration for ${file}`);
    const [, hh, mm, ss] = m;
    return parseInt(hh) * 3600 + parseInt(mm) * 60 + parseFloat(ss);
  }
}

export interface VideoSlide {
  imagePath: string;   // local /tmp path to the still image
  voicePath: string;   // local /tmp path to the voiceover clip for this slide
}

export interface BuildVideoOptions {
  size?: string;        // "1080x1080" (square) or "1080x1920" (vertical), default square
  musicPath?: string;   // optional pre-written background music WAV
  musicGainDb?: number; // default -16dB
}

/**
 * Build the final video from ordered slides. Returns the path to the
 * finished MP4 inside the same temp working directory (caller is
 * responsible for reading it and cleaning up via the returned `cleanup()`).
 */
export async function buildVideo(
  slides: VideoSlide[],
  opts: BuildVideoOptions = {}
): Promise<{ videoPath: string; durationSec: number; cleanup: () => Promise<void> }> {
  if (slides.length === 0) throw new Error('buildVideo requires at least one slide');

  const size = opts.size ?? '1080x1080';
  const workdir = await mkdtemp(path.join(tmpdir(), 'vuka-video-'));
  const cleanup = () => rm(workdir, { recursive: true, force: true });

  try {
    const segPaths: string[] = [];

    for (let i = 0; i < slides.length; i++) {
      const { imagePath, voicePath } = slides[i];
      const voiceDur = await probeDurationSec(voicePath);
      const pad = 0.4;
      const total = voiceDur + pad;

      const paddedAudio = path.join(workdir, `voice_${i}_padded.wav`);
      await run(['-y', '-i', voicePath, '-af', `apad=pad_dur=${pad}`, '-t', String(total), paddedAudio]);

      const frames = Math.round(total * 30);
      const seg = path.join(workdir, `seg_${i}.mp4`);
      const vf = `zoompan=z='min(zoom+0.0006,1.08)':d=${frames}:s=${size}:fps=30,format=yuv420p`;
      await run([
        '-y', '-loop', '1', '-i', imagePath, '-i', paddedAudio,
        '-vf', vf, '-t', String(total),
        '-c:v', 'libx264', '-c:a', 'aac', '-shortest', seg,
      ]);
      segPaths.push(seg);
    }

    const listFile = path.join(workdir, 'concat.txt');
    await writeFile(listFile, segPaths.map((p) => `file '${p}'`).join('\n'));
    const concatOut = path.join(workdir, 'concat.mp4');
    await run(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', concatOut]);

    const totalDur = await probeDurationSec(concatOut);
    const finalOut = path.join(workdir, 'final.mp4');

    const musicPath = opts.musicPath ?? path.join(workdir, 'music.wav');
    if (!opts.musicPath) {
      const { buildMusicPad } = await import('./ai-music-pad');
      await writeFile(musicPath, buildMusicPad(totalDur + 1));
    }

    const gain = opts.musicGainDb ?? -16;
    const filt =
      `[1:a]volume=${gain}dB,afade=t=in:d=1.5,afade=t=out:st=${Math.max(totalDur - 1.5, 0)}:d=1.5[music];` +
      `[0:a]volume=0dB[voice];` +
      `[voice][music]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[mixed];` +
      `[mixed]alimiter=limit=0.95[aout]`;

    await run([
      '-y', '-i', concatOut, '-i', musicPath,
      '-filter_complex', filt, '-map', '0:v', '-map', '[aout]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', finalOut,
    ]);

    return { videoPath: finalOut, durationSec: totalDur, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

export async function downloadToTmp(url: string, destDir: string, filename: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const dest = path.join(destDir, filename);
  await writeFile(dest, buf);
  return dest;
}

export { mkdtemp, rm, readFile };
