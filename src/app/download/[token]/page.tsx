'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Navbar } from '@/components/Navbar';

export default function DownloadPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/download/${token}`)
      .then(async r => {
        const d = await r.json();
        if (!r.ok) setError(d.error || 'Download failed');
        else setData(d);
        setLoading(false);
      })
      .catch(() => { setError('Network error'); setLoading(false); });
  }, [token]);

  const isMultiple = data?.downloads?.length > 1;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-16">
        {loading ? (
          <div className="text-center">
            <p style={{ color: 'var(--text-muted)' }}>Just now… fetching your files</p>
          </div>
        ) : error ? (
          <div className="text-center p-8 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-4xl mb-4">😬</p>
            <p className="font-bold mb-2" style={{ color: 'var(--text)' }}>Eish — {error}</p>
            <a href="/redownload" className="inline-block mt-4 px-6 py-3 rounded-xl font-bold" style={{ background: 'var(--sky)', color: 'white' }}>
              Re-download Portal →
            </a>
          </div>
        ) : (
          <div>
            <div className="text-center mb-8">
              <div className="text-6xl mb-4">⬇️</div>
              <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--text)' }}>It's yours now</h1>
              <p style={{ color: 'var(--text-muted)' }}>{data.itemName} · {data.downloadsLeft} download{data.downloadsLeft !== 1 ? 's' : ''} remaining</p>
            </div>

            {/* ZIP download button for multi-file (albums/EPs) */}
            {isMultiple && (
              <a
                href={`/api/download/${token}/zip`}
                className="flex items-center justify-center gap-3 w-full py-4 rounded-xl font-bold text-white text-lg mb-6 transition-all hover:scale-[1.02]"
                style={{ background: 'var(--red)' }}
              >
                📦 Download All as ZIP ({data.downloads.length} files)
              </a>
            )}

            {/* Individual file links */}
            <div className="space-y-3">
              {data.downloads?.map((d: { name: string; url: string }) => (
                <a
                  key={d.name}
                  href={d.url}
                  download
                  className="flex items-center justify-between p-4 rounded-xl transition-colors"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                >
                  <span className="font-medium text-sm">{d.name}</span>
                  <span className="px-3 py-1.5 rounded-lg font-bold text-xs flex-shrink-0 ml-3" style={{ background: 'var(--surface2)', color: 'var(--sky)', border: '1px solid var(--border)' }}>
                    {isMultiple ? 'Individual' : 'Download'}
                  </span>
                </a>
              ))}
            </div>

            {data.licenseUrl && (
              <a href={data.licenseUrl} download className="block mt-4 p-4 rounded-xl text-center" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--sky)' }}>
                📄 Download License PDF
              </a>
            )}

            <p className="text-center text-sm mt-6" style={{ color: 'var(--text-muted)' }}>
              Need another copy? <a href="/redownload" className="underline">Re-download portal</a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
