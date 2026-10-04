export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { logDownload } from '@/lib/downloadLog';

const REPO = 'faithworth/Vuka';
// Last known-good release that has every platform attached; used if the
// newest release is missing a file (e.g. only Android was published).
const FALLBACK_TAG = 'v1.0.1';

const ASSETS: Record<string, string> = {
  windows: 'Vuka-Music-Windows.exe',
  mac: 'Vuka-Music-macOS.dmg',
  macos: 'Vuka-Music-macOS.dmg',
  android: 'Vuka-Music-Android.apk',
};

async function assetExists(url: string): Promise<boolean> {
  try {
    // GitHub answers 302 (redirect to storage) when the asset exists, 404 when not.
    const res = await fetch(url, { method: 'HEAD', redirect: 'manual', cache: 'no-store' });
    return res.status >= 300 && res.status < 400;
  } catch {
    return false;
  }
}

/**
 * Tracked app downloads. Records the download (time, country, hashed IP) and
 * redirects to the newest GitHub release file, so the /downloads buttons never
 * point at an outdated version and we can count installs per platform.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  const key = platform.toLowerCase();
  const asset = ASSETS[key];
  if (!asset) return NextResponse.json({ error: 'Unknown platform' }, { status: 404 });

  const candidates = [
    `https://github.com/${REPO}/releases/latest/download/${asset}`,
    `https://github.com/${REPO}/releases/download/${FALLBACK_TAG}/${asset}`,
  ];

  let target = candidates[candidates.length - 1];
  for (const url of candidates) {
    if (await assetExists(url)) {
      target = url;
      break;
    }
  }

  await logDownload(req, {
    purchaseId: 'app',
    itemType: 'app',
    itemId: key === 'macos' ? 'mac' : key,
    kind: 'app',
  });

  const res = NextResponse.redirect(target, 302);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
