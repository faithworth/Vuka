/**
 * VUKA — AI Content Engine: background music bed
 *
 * Synthesizes a simple ambient chord pad entirely in JS (no external audio
 * library, no third-party "royalty free music" API, no copyright risk —
 * it's generated from sine waves at request time). Used as a quiet bed
 * under generated voiceovers in Phase 2 video assembly.
 *
 * Port of the Python prototype (numpy) used to validate this approach
 * during design — same chord progression, same envelope shape.
 */

const SAMPLE_RATE = 44100;

function noteFreq(name: string, octave: number): number {
  const semis: Record<string, number> = {
    C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4,
    'F#': -3, G: -2, 'G#': -1, A: 0, 'A#': 1, B: 2,
  };
  const offset = semis[name] + (octave - 4) * 12;
  return 440 * Math.pow(2, offset / 12);
}

// Am9 → Fmaj7 → Cmaj7 → G7 — moody but hopeful, matches the dark/green brand
const CHORDS: [string, number][][] = [
  [['A', 3], ['C', 4], ['E', 4], ['G', 4], ['B', 4]],
  [['F', 3], ['A', 3], ['C', 4], ['E', 4]],
  [['C', 3], ['E', 3], ['G', 3], ['B', 3]],
  [['G', 3], ['B', 3], ['D', 4], ['F', 4]],
];

function chordSamples(freqs: number[], durationSec: number, amp = 0.12): Float32Array {
  const n = Math.floor(SAMPLE_RATE * durationSec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let sum = 0;
    for (const f of freqs) sum += Math.sin(2 * Math.PI * f * t);
    out[i] = (sum / freqs.length) * amp;
  }
  // soft attack/release envelope (0.6s each end)
  const fade = Math.floor(SAMPLE_RATE * 0.6);
  for (let i = 0; i < Math.min(fade, n); i++) out[i] *= i / fade;
  for (let i = 0; i < Math.min(fade, n); i++) out[n - 1 - i] *= i / fade;
  return out;
}

function floatToWavBuffer(samples: Float32Array, sampleRate = SAMPLE_RATE): Buffer {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample; // mono
  const dataSize = samples.length * bytesPerSample;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);          // PCM chunk size
  buf.writeUInt16LE(1, 20);           // PCM format
  buf.writeUInt16LE(1, 22);           // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * blockAlign, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bytesPerSample * 8, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped * 32767 * 0.9), 44 + i * 2);
  }
  return buf;
}

/** Build an ambient pad WAV Buffer at least `totalDurationSec` long. */
export function buildMusicPad(totalDurationSec: number): Buffer {
  const chordDur = 4.0;
  const nChords = Math.ceil(totalDurationSec / chordDur);
  const totalSamples = Math.floor(SAMPLE_RATE * totalDurationSec);
  const buf = new Float32Array(totalSamples);

  for (let i = 0; i < nChords; i++) {
    const chord = CHORDS[i % CHORDS.length];
    const freqs = chord.map(([name, oct]) => noteFreq(name, oct));
    const seg = chordSamples(freqs, chordDur);
    const start = Math.floor(i * chordDur * SAMPLE_RATE);
    for (let j = 0; j < seg.length && start + j < buf.length; j++) {
      buf[start + j] += seg[j];
    }
  }

  return floatToWavBuffer(buf);
}
