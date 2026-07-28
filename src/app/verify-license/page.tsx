'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/Navbar';

export default function VerifyLicensePage() {
  const searchParams = useSearchParams();
  const [key, setKey] = useState(searchParams.get('key') || '');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function check(k: string) {
    if (!k.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const r = await fetch(`/api/licensing/verify?key=${encodeURIComponent(k.trim())}`);
      const d = await r.json();
      setResult(d);
    } catch {
      setResult({ valid: false, reason: 'Network error' });
    }
    setLoading(false);
  }

  useEffect(() => {
    const k = searchParams.get('key');
    if (k) check(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🔎</div>
          <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--text)' }}>Verify a License</h1>
          <p style={{ color: 'var(--text-muted)' }}>Check whether a Vuka beat license key is valid.</p>
        </div>

        <form
          onSubmit={e => { e.preventDefault(); check(key); }}
          className="flex gap-2 mb-8"
        >
          <input
            className="input flex-1"
            placeholder="Enter license key"
            value={key}
            onChange={e => setKey(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-3 rounded-xl font-bold text-white"
            style={{ background: 'var(--sky)' }}
          >
            {loading ? 'Checking…' : 'Verify'}
          </button>
        </form>

        {searched && !loading && result && (
          result.valid ? (
            <div className="p-6 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--green, #22c55e)' }}>
                ✅ Valid license
              </p>
              <dl className="space-y-2 text-sm">
                <Row label="Song" value={result.license.songTitle} />
                <Row label="Artist" value={result.license.artistName} />
                <Row label="Licensed to" value={result.license.buyerName} />
                <Row label="License type" value={result.license.licenseType} />
                <Row label="Issued" value={new Date(result.license.issuedAt).toLocaleDateString()} />
                {result.license.expiresAt && (
                  <Row label="Expires" value={new Date(result.license.expiresAt).toLocaleDateString()} />
                )}
                {result.license.rights && (
                  <>
                    <Row label="Streams" value={String(result.license.rights.streams)} />
                    <Row label="Sales cap" value={String(result.license.rights.salesCap)} />
                    <Row label="Radio" value={result.license.rights.radioStations ? 'Yes' : 'No'} />
                    <Row label="TV sync" value={result.license.rights.tvSync ? 'Yes' : 'No'} />
                    <Row label="Music video" value={result.license.rights.musicVideo ? 'Yes' : 'No'} />
                  </>
                )}
              </dl>
            </div>
          ) : (
            <div className="p-6 rounded-2xl text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="font-bold" style={{ color: 'var(--red)' }}>❌ {result.reason || 'License not found'}</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b pb-2" style={{ borderColor: 'var(--border)' }}>
      <dt style={{ color: 'var(--text-muted)' }}>{label}</dt>
      <dd className="font-medium" style={{ color: 'var(--text)' }}>{value}</dd>
    </div>
  );
}
