import { createHash } from 'crypto';
import type { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';

interface LogDownloadInput {
  purchaseId: string;
  itemType: string;
  itemId?: string | null;
  kind: 'file' | 'zip';
  fileIndex?: number | null;
}

function hashIp(ip: string): string {
  if (!ip) return '';
  const salt = process.env.DOWNLOAD_LOG_SALT || process.env.NEXTAUTH_SECRET || 'vuka-download-log';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

/**
 * Records one served download. Never throws: logging must never break a
 * customer's download (e.g. if the table has not been migrated yet).
 * Raw IPs are not stored, only a salted hash used for unique-visitor counts.
 */
export async function logDownload(req: NextRequest, input: LogDownloadInput): Promise<void> {
  try {
    const forwarded = req.headers.get('x-forwarded-for') || '';
    const ip = forwarded.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '';
    await prisma.downloadLog.create({
      data: {
        purchaseId: input.purchaseId,
        itemType: input.itemType || '',
        itemId: input.itemId || '',
        kind: input.kind,
        fileIndex: input.fileIndex ?? null,
        country: req.headers.get('x-vercel-ip-country') || '',
        ipHash: hashIp(ip),
        userAgent: (req.headers.get('user-agent') || '').slice(0, 200),
      },
    });
  } catch (e) {
    console.error('[downloadLog] failed to record download', e);
  }
}
