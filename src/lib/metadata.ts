/**
 * Writes ID3v2 tags into MP3 buffers and INFO chunks into WAV buffers.
 * Called at download time so every file the buyer receives has full metadata.
 */
import NodeID3 from 'node-id3';

export interface TrackMeta {
  title: string;
  artist: string;
  albumArtist?: string;
  album?: string;
  trackNumber?: number;
  totalTracks?: number;
  year?: string;
  genre?: string;
  bpm?: number;
  key?: string;
  comment?: string;
  artworkBuffer?: Buffer; // JPEG/PNG bytes
}

/** Write ID3v2 tags into an MP3 buffer. Returns the tagged buffer. */
export function tagMp3(audioBuffer: Buffer, meta: TrackMeta): Buffer {
  const tags: NodeID3.Tags = {
    title: meta.title,
    artist: meta.artist,
    album: meta.album || meta.title,
    performerInfo: meta.albumArtist || meta.artist,
    trackNumber: meta.trackNumber
      ? meta.totalTracks
        ? `${meta.trackNumber}/${meta.totalTracks}`
        : `${meta.trackNumber}`
      : undefined,
    year: meta.year,
    genre: meta.genre,
    bpm: meta.bpm ? String(meta.bpm) : undefined,
    initialKey: meta.key,
    comment: meta.comment
      ? { language: 'eng', text: meta.comment }
      : undefined,
    image: meta.artworkBuffer
      ? {
          mime: 'image/jpeg',
          type: { id: 3, name: 'front cover' },
          description: 'Cover',
          imageBuffer: meta.artworkBuffer,
        }
      : undefined,
  };

  // NodeID3.write returns Buffer | false
  const result = NodeID3.write(tags, audioBuffer);
  return result instanceof Buffer ? result : audioBuffer;
}

/**
 * Write INFO metadata chunk into a WAV buffer.
 * WAV uses RIFF LIST INFO chunks for text metadata.
 */
export function tagWav(wavBuffer: Buffer, meta: TrackMeta): Buffer {
  // Build LIST INFO chunk
  const fields: Array<[string, string]> = [];
  if (meta.title)   fields.push(['INAM', meta.title]);
  if (meta.artist)  fields.push(['IART', meta.artist]);
  if (meta.album)   fields.push(['IPRD', meta.album]);
  if (meta.genre)   fields.push(['IGNR', meta.genre]);
  if (meta.year)    fields.push(['ICRD', meta.year]);
  if (meta.comment) fields.push(['ICMT', meta.comment]);
  if (meta.bpm)     fields.push(['IBPM', String(meta.bpm)]);

  if (fields.length === 0) return wavBuffer;

  // Build the INFO sub-chunks
  const subChunks: Buffer[] = [];
  for (const [id, value] of fields) {
    const textBuf = Buffer.from(value + '\0', 'utf8');
    // Pad to even length
    const padded = textBuf.length % 2 !== 0 ? Buffer.concat([textBuf, Buffer.alloc(1)]) : textBuf;
    const chunk = Buffer.alloc(8 + padded.length);
    chunk.write(id, 0, 'ascii');
    chunk.writeUInt32LE(textBuf.length, 4); // size = unpadded
    padded.copy(chunk, 8);
    subChunks.push(chunk);
  }

  const infoData = Buffer.concat(subChunks);
  // LIST chunk: 4 bytes 'LIST' + 4 bytes size + 4 bytes 'INFO' + subchunks
  const listChunk = Buffer.alloc(12 + infoData.length);
  listChunk.write('LIST', 0, 'ascii');
  listChunk.writeUInt32LE(4 + infoData.length, 4);
  listChunk.write('INFO', 8, 'ascii');
  infoData.copy(listChunk, 12);

  // Strip any existing LIST INFO chunk from the WAV then append new one
  const stripped = stripWavListInfo(wavBuffer);

  // Update RIFF size in header
  const result = Buffer.concat([stripped, listChunk]);
  result.writeUInt32LE(result.length - 8, 4); // RIFF chunk size

  return result;
}

function stripWavListInfo(wav: Buffer): Buffer {
  if (wav.length < 12) return wav;
  // Skip RIFF header (12 bytes)
  let offset = 12;
  const keep: Buffer[] = [wav.slice(0, 12)];
  while (offset + 8 <= wav.length) {
    const id = wav.slice(offset, offset + 4).toString('ascii');
    const size = wav.readUInt32LE(offset + 4);
    const paddedSize = size % 2 !== 0 ? size + 1 : size;
    const chunkEnd = offset + 8 + paddedSize;
    if (id === 'LIST' && offset + 12 <= wav.length && wav.slice(offset + 8, offset + 12).toString('ascii') === 'INFO') {
      // skip
    } else {
      keep.push(wav.slice(offset, Math.min(chunkEnd, wav.length)));
    }
    offset = chunkEnd;
  }
  return Buffer.concat(keep);
}

/** Fetch a URL and return its buffer, or null on failure */
export async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}
